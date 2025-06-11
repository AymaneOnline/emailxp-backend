// emailxp/backend/utils/__tests__/campaignScheduler.test.js

// Import the function you want to test
const { executeSendCampaign } = require('../campaignScheduler');

// Mock your dependencies
jest.mock('../../models/Campaign', () => {
  // We'll return a dynamic mock in beforeEach for findById
  return {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(), // Mock the find method on the Campaign model if used directly
  };
});

jest.mock('../../models/Subscriber', () => ({
  find: jest.fn(),
}));

jest.mock('../../services/emailService', () => ({
  sendEmail: jest.fn(),
}));

// Mock Sentry to prevent errors related to its integration during tests
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  // Add other Sentry methods you might call if needed, e.g., init, addBreadcrumb, etc.
}));


// Import the actual mocked modules to access their mock functions
const Campaign = require('../../models/Campaign');
const Subscriber = require('../../models/Subscriber');
const { sendEmail } = require('../../services/emailService');
const Sentry = require('@sentry/node'); // Import the mocked Sentry

describe('executeSendCampaign', () => {
  // Define a reusable mock campaign instance for common test cases
  let mockCampaignInstanceForSuccess;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup the default mock for Campaign.findById to return a chainable populate
    // This will be overridden for specific test cases where different behavior is needed
    mockCampaignInstanceForSuccess = {
        _id: 'mockCampaignId',
        name: 'Test Campaign',
        status: 'scheduled',
        htmlContent: 'Hello {{name}}',
        plainTextContent: 'Hello {{name}}',
        subject: 'Test Subject',
        list: { _id: 'mockListId', name: 'Test List' }, // Simulates populated 'list'
        save: jest.fn().mockResolvedValue(true), // Mock the save method on this instance
    };
    
    // Default behavior for Campaign.findById for successful cases
    Campaign.findById.mockReturnValue({ // findById returns an object with a .populate() method
        populate: jest.fn().mockResolvedValue(mockCampaignInstanceForSuccess) // populate returns the mocked campaign instance
    });

    Campaign.findByIdAndUpdate.mockResolvedValue(true);
    Campaign.find.mockResolvedValue([mockCampaignInstanceForSuccess]); // For Campaign.find calls if any

    Subscriber.find.mockResolvedValue([
      { _id: 'sub1', name: 'Alice', email: 'alice@example.com' },
      { _id: 'sub2', name: 'Bob', email: 'bob@example.com' },
    ]);
    sendEmail.mockResolvedValue({ success: true, message: 'Email sent' });
    Sentry.captureException.mockImplementation(() => {}); // Prevent Sentry from trying to send errors during tests
  });

  // --- Test Case 1: Successful Campaign Sending ---
  test('should successfully send a campaign to all subscribers', async () => {
    const campaignId = 'mockCampaignId';

    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(true);
    expect(result.successfulSends).toBe(2);
    expect(Campaign.findById).toHaveBeenCalledWith(campaignId);
    expect(Campaign.findById().populate).toHaveBeenCalledWith('list');
    expect(Subscriber.find).toHaveBeenCalledWith({ list: 'mockListId' });
    expect(sendEmail).toHaveBeenCalledTimes(2); // Called for each subscriber
    expect(sendEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.any(String),
      expect.stringContaining('Hello Alice'),
      expect.stringContaining('Hello Alice'),
      campaignId,
      'sub1'
    );
    // Check if status was updated on the mock instance and save was called
    expect(mockCampaignInstanceForSuccess.save).toHaveBeenCalled();
    expect(mockCampaignInstanceForSuccess.status).toBe('sent');
  });

  // --- Test Case 2: Campaign Not Found ---
  test('should return false and update status to failed if campaign is not found', async () => {
    Campaign.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) }); // Simulate campaign not found

    const campaignId = 'nonExistentCampaignId';
    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Campaign not found.');
    expect(Campaign.findById).toHaveBeenCalledWith(campaignId);
    expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith(campaignId, { status: 'failed' });
    expect(sendEmail).not.toHaveBeenCalled(); // No emails should be sent
    expect(Sentry.captureException).toHaveBeenCalledTimes(1); // Expect Sentry to catch this error
  });

  // --- Test Case 3: No Subscribers in List ---
  test('should mark campaign as sent if no subscribers are found', async () => {
    Subscriber.find.mockResolvedValue([]); // Simulate no subscribers
    const campaignId = 'mockCampaignId';

    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(true);
    expect(result.message).toBe('No subscribers found for this campaign. Campaign marked as sent.');
    expect(sendEmail).not.toHaveBeenCalled(); // No emails should be sent
    expect(mockCampaignInstanceForSuccess.save).toHaveBeenCalled();
    expect(mockCampaignInstanceForSuccess.status).toBe('sent');
  });

  // --- Test Case 4: Partial Failures during Sending ---
  test('should handle partial email sending failures gracefully', async () => {
    sendEmail.mockImplementation(async (email) => {
      if (email === 'alice@example.com') {
        return { success: false, message: 'Failed to send to Alice' };
      }
      return { success: true, message: 'Email sent' };
    });

    const campaignId = 'mockCampaignId';
    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(true); // Still true if at least one email sent
    expect(result.successfulSends).toBe(1);
    expect(result.failedSends).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(mockCampaignInstanceForSuccess.save).toHaveBeenCalled();
    expect(mockCampaignInstanceForSuccess.status).toBe('sent'); // Campaign marked as sent if *any* emails went out
    expect(Sentry.captureException).toHaveBeenCalledTimes(1); // One failure should be captured by Sentry
  });

  // --- Test Case 5: All Failures during Sending ---
  test('should mark campaign as failed if all email sends fail', async () => {
    sendEmail.mockResolvedValue({ success: false, message: 'Failed to send all emails' });

    const campaignId = 'mockCampaignId';
    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(false);
    expect(result.successfulSends).toBe(0);
    expect(result.failedSends).toBe(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(mockCampaignInstanceForSuccess.save).toHaveBeenCalled();
    expect(mockCampaignInstanceForSuccess.status).toBe('failed'); // Campaign status should be 'failed'
    expect(Sentry.captureException).toHaveBeenCalledTimes(2); // Both failures should be captured by Sentry
  });

  // --- Test Case 6: Critical Error during execution (e.g., DB connection issue during findById.populate) ---
  test('should handle critical errors gracefully and update campaign status to failed if possible', async () => {
    const campaignId = 'mockCampaignId';

    // 1. Mock the *initial* call to Campaign.findById().populate() to throw an error.
    Campaign.findById.mockReturnValueOnce({
      populate: jest.fn().mockRejectedValue(new Error('Database connection error during populate'))
    });

    // 2. Mock the *subsequent* call to Campaign.findById (inside the catch block)
    // to return a mock campaign instance so its status can be updated and saved.
    const mockCampaignInstanceForRecovery = {
      _id: campaignId,
      name: 'Test Campaign',
      status: 'sending', // Assume it was already set to 'sending' by the scheduler loop
      save: jest.fn().mockResolvedValue(true),
    };
    Campaign.findById.mockResolvedValueOnce(mockCampaignInstanceForRecovery); // This is for the findById call inside the outer catch block

    const result = await executeSendCampaign(campaignId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('An unexpected critical error occurred');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1); // One critical error captured

    // Assert on the mock campaign instance used for recovery
    expect(mockCampaignInstanceForRecovery.save).toHaveBeenCalled();
    expect(mockCampaignInstanceForRecovery.status).toBe('failed'); // Check if the status was updated on the mock
  });
});
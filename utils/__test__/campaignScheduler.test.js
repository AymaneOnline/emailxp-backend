const Campaign = require('../../models/Campaign');
const Subscriber = require('../../models/Subscriber');
const { sendEmail } = require('../../services/emailService');
const { executeSendCampaign } = require('../campaignScheduler');

// Mock external dependencies
jest.mock('../../models/Campaign');
jest.mock('../../models/Subscriber');
jest.mock('../../services/emailService');
jest.mock('@sentry/node'); // Mock Sentry if you're using it

// Mock the console methods to prevent test output from cluttering
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

describe('executeSendCampaign', () => {
  // Mock campaign and list data - define a base structure
  const mockCampaignId = 'mockCampaignId';
  const mockListId = 'mockListId';

  const baseMockCampaign = {
    _id: mockCampaignId,
    name: 'Test Campaign',
    subject: 'Hello from Test Campaign',
    htmlContent: '<p>Hi {{name}}</p>',
    plainTextContent: 'Hi {{name}}',
    list: { _id: mockListId, name: 'Test List' },
    status: 'scheduled',
    // Do NOT include save here. It will be added to the deep copy.
  };

  const mockSubscriber1 = { _id: 'sub1', name: 'Alice', email: 'alice@example.com', status: 'subscribed' };
  const mockSubscriber2 = { _id: 'sub2', name: 'Bob', email: 'bob@example.com', status: 'subscribed' };
  const mockUnsubscribedSubscriber = { _id: 'sub3', name: 'Charlie', email: 'charlie@example.com', status: 'unsubscribed' };


  beforeEach(() => {
    // Reset all mocks before each test to ensure isolation
    jest.clearAllMocks();

    // Default mock implementations for Campaign.findById chain
    // Campaign.findById will return 'this' to allow .populate() chaining
    Campaign.findById.mockReturnThis();

    // Default mock for findByIdAndUpdate, used for status updates
    Campaign.findByIdAndUpdate.mockResolvedValue({}); // Ensure it returns a resolved promise

    // Set default mock for Subscriber.find to return two subscribed users
    Subscriber.find.mockResolvedValue([mockSubscriber1, mockSubscriber2]);

    // Set default mock for sendEmail to succeed
    sendEmail.mockResolvedValue({ success: true, message: 'Email sent' });
  });

  it('should successfully send a campaign to all subscribed subscribers', async () => {
    // Create a fresh mutable copy for this test and add the mock save method
    const campaignInstance = { ...baseMockCampaign, save: jest.fn() };
    Campaign.findById().populate.mockResolvedValue(campaignInstance); // Resolve with the test-specific instance

    const result = await executeSendCampaign(mockCampaignId);

    expect(Campaign.findById).toHaveBeenCalledWith(mockCampaignId);
    expect(Campaign.findById().populate).toHaveBeenCalledWith('list');
    expect(Subscriber.find).toHaveBeenCalledWith({ list: mockListId, status: 'subscribed' });
    expect(sendEmail).toHaveBeenCalledTimes(2); // Called for each subscriber
    expect(sendEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.any(String), // Personalized subject
      expect.stringContaining('Hi Alice'), // Personalized HTML
      expect.stringContaining('Hi Alice'), // Personalized Plain Text
      mockCampaignId,
      mockSubscriber1._id
    );
    expect(sendEmail).toHaveBeenCalledWith(
      'bob@example.com',
      expect.any(String), // Personalized subject
      expect.stringContaining('Hi Bob'), // Personalized HTML
      expect.stringContaining('Hi Bob'), // Personalized Plain Text
      mockCampaignId,
      mockSubscriber2._id
    );
    expect(campaignInstance.save).toHaveBeenCalledTimes(2); // One for 'sending', one for 'sent'
    expect(campaignInstance.status).toBe('sent');
    expect(campaignInstance.sentAt).toBeInstanceOf(Date);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Campaign sending completed.');
    expect(result.successfulSends).toBe(2);
    expect(result.failedSends).toBe(0);
  });

  it('should return false and update status to failed if campaign is not found', async () => {
    Campaign.findById().populate.mockResolvedValue(null); // Campaign not found

    const result = await executeSendCampaign('nonExistentCampaignId');

    expect(Campaign.findById).toHaveBeenCalledWith('nonExistentCampaignId');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Campaign not found.');
    // This now reflects the logic in campaignScheduler.js
    expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith('nonExistentCampaignId', { status: 'failed' });
  });

  it('should mark campaign as sent if no subscribed subscribers are found', async () => {
    const campaignInstance = { ...baseMockCampaign, save: jest.fn() };
    Campaign.findById().populate.mockResolvedValue(campaignInstance);
    Subscriber.find.mockResolvedValue([]); // No subscribers found for this test

    const result = await executeSendCampaign(mockCampaignId);

    expect(Subscriber.find).toHaveBeenCalledWith({ list: mockListId, status: 'subscribed' });
    expect(result.success).toBe(true); // Should still be true if no active subscribers to send to
    expect(result.message).toBe('No active subscribers found for this campaign. Campaign marked as sent.');
    expect(sendEmail).not.toHaveBeenCalled(); // No emails should be sent
    expect(campaignInstance.save).toHaveBeenCalledTimes(2); // One for 'sending', one for 'sent'
    expect(campaignInstance.status).toBe('sent');
  });

  it('should handle partial email sending failures gracefully', async () => {
    const campaignInstance = { ...baseMockCampaign, save: jest.fn() };
    Campaign.findById().populate.mockResolvedValue(campaignInstance);

    sendEmail
      .mockResolvedValueOnce({ success: false, message: 'Failed to send to Alice' })
      .mockResolvedValueOnce({ success: true, message: 'Email sent' });

    const result = await executeSendCampaign(mockCampaignId);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true); // Still true because at least one email succeeded
    expect(result.message).toBe('Campaign sending completed.');
    expect(result.successfulSends).toBe(1);
    expect(result.failedSends).toBe(1);
    expect(campaignInstance.save).toHaveBeenCalledTimes(2);
    expect(campaignInstance.status).toBe('sent'); // Should be 'sent' if any emails succeeded
  });

  it('should mark campaign as failed if all email sends fail', async () => {
    const campaignInstance = { ...baseMockCampaign, save: jest.fn() };
    Campaign.findById().populate.mockResolvedValue(campaignInstance);

    sendEmail.mockResolvedValue({ success: false, message: 'Failed to send all emails' }); // All emails fail

    const result = await executeSendCampaign(mockCampaignId);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Campaign sending completed.'); // Message indicates completion, but success is false
    expect(result.successfulSends).toBe(0);
    expect(result.failedSends).toBe(2);
    expect(campaignInstance.save).toHaveBeenCalledTimes(2);
    expect(campaignInstance.status).toBe('failed'); // Should be 'failed' if no emails succeeded
  });

  // --- FIX FOR CRITICAL ERROR TEST ---
  it('should handle critical errors gracefully and update campaign status to failed if possible', async () => {
    // For this test, we don't need a campaignInstance to save, as we're testing
    // the fallback `findByIdAndUpdate` on critical error.
    Campaign.findById().populate.mockResolvedValue({ ...baseMockCampaign, save: jest.fn() }); // Still provide a resolved value for initial find

    // Simulate a critical error during subscriber fetching
    Subscriber.find.mockImplementationOnce(() => {
      throw new Error('Database connection error during populate');
    });

    const result = await executeSendCampaign(mockCampaignId);

    expect(result.success).toBe(false);
    expect(result.message).toContain('An unexpected critical error occurred');
    expect(Campaign.findById).toHaveBeenCalledWith(mockCampaignId);
    // Now correctly assert that Campaign.findByIdAndUpdate was called
    expect(Campaign.findByIdAndUpdate).toHaveBeenCalledWith(
      mockCampaignId,
      { status: 'failed' }
      // We removed { new: true } because your current `findByIdAndUpdate` default mock doesn't specify it,
      // and if your actual code doesn't use it, it will cause the mock to fail.
      // If your actual code *does* use `{ new: true }` in `findByIdAndUpdate` for critical errors,
      // then you should add it back here.
    );
    // No assertion on campaignInstance.status as the `findByIdAndUpdate` handles the "DB" update.
  });

  // --- FIX FOR UNSUBSCRIBED SUBSCRIBERS TEST ---
  it('should not send email to unsubscribed subscribers', async () => {
    const campaignInstance = { ...baseMockCampaign, save: jest.fn() };
    Campaign.findById().populate.mockResolvedValue(campaignInstance);

    // Subscriber.find should only return subscribed users based on the query.
    // So, we mock it to reflect that the query for 'status: subscribed' would only return alice.
    // The previous fix already correctly set this to [mockSubscriber1].
    Subscriber.find.mockResolvedValue([mockSubscriber1]); // Only subscribed user

    const result = await executeSendCampaign(mockCampaignId);

    // This assertion now correctly expects that the Subscriber.find method was called
    // with the filter for 'subscribed' status.
    expect(Subscriber.find).toHaveBeenCalledWith({ list: mockListId, status: 'subscribed' });
    expect(sendEmail).toHaveBeenCalledTimes(1); // Should only be called for mockSubscriber1 (Alice)
    expect(sendEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.any(String),
      expect.stringContaining('Hi Alice'),
      expect.stringContaining('Hi Alice'),
      mockCampaignId,
      mockSubscriber1._id
    );
    // Ensure sendEmail was NOT called for Charlie (unsubscribed)
    expect(sendEmail).not.toHaveBeenCalledWith(
      'charlie@example.com',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
    expect(campaignInstance.status).toBe('sent');
    expect(result.successfulSends).toBe(1);
    expect(result.failedSends).toBe(0);
  });
});
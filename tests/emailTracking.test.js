const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const EmailTracking = require('../models/EmailTracking');
const emailService = require('../utils/emailService');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  await EmailTracking.deleteMany({});
});

test('createTrackingRecord stores template and actionId correctly', async () => {
  const tracking = await emailService.createTrackingRecord({
    campaign: null,
    automation: new mongoose.Types.ObjectId(),
    subscriber: new mongoose.Types.ObjectId(),
    organization: null,
    emailAddress: 'test@example.com',
    subject: 'Test subject',
    messageId: 'test-msg-123',
    status: 'sent',
    template: new mongoose.Types.ObjectId(),
    actionId: 'node-1234'
  });

  expect(tracking).toBeDefined();
  expect(tracking.messageId).toBe('test-msg-123');
  expect(tracking.template).toBeDefined();
  expect(String(tracking.template).length).toBeGreaterThan(0);
  expect(tracking.actionId).toBe('node-1234');

  // also verify via direct query
  const found = await EmailTracking.findOne({ messageId: 'test-msg-123' }).lean();
  expect(found).toBeTruthy();
  expect(found.template).toBeTruthy();
  expect(found.actionId).toBe('node-1234');
});

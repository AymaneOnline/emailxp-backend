// Suppress setInterval heavy jobs during tests by mocking queueService & related modules.
process.env.NODE_ENV = 'test';
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'testsecret';
jest.mock('../services/queueService', () => ({
  __esModule: true,
  default: {},
  emailQueue: { add: jest.fn(), process: jest.fn() }
}));

jest.mock('../services/emailQueueService', () => ({
  __esModule: true,
  EmailQueueService: function(){ return { enqueue: jest.fn() }; }
}));

// Mock nodemailer to avoid network calls
jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn().mockResolvedValue({ user: 'u', pass: 'p' }),
  createTransport: jest.fn(() => ({ sendMail: jest.fn().mockResolvedValue({ messageId: 'id' }) }))
}));

// Mock bull Queue constructor globally (simplistic)
jest.mock('bull', () => {
  return function Queue(){ return { add: jest.fn(), process: jest.fn(), on: jest.fn() }; };
});

// Sentry noop
jest.mock('@sentry/node', () => ({ init: jest.fn(), captureException: jest.fn() }));

// Mock uuid (ESM) to avoid transform issues
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

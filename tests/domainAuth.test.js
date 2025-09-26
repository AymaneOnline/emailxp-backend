// emailxp/backend/tests/domainAuth.test.js

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const domainAuthService = require('../services/domainAuthService');
const DomainAuthentication = require('../models/DomainAuthentication');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Ensure indexes are created
  await DomainAuthentication.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await DomainAuthentication.deleteMany({});
});

describe('DomainAuthService', () => {
  describe('validateDomain', () => {
    test('should validate correct domain', () => {
      const result = domainAuthService.validateDomain('mail.example.com');
      expect(result.valid).toBe(true);
    });

    test('should reject empty domain', () => {
      const result = domainAuthService.validateDomain('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Domain is required');
    });

    test('should reject domain without TLD', () => {
      const result = domainAuthService.validateDomain('example');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('top-level domain');
    });

    test('should reject domain with invalid characters', () => {
      const result = domainAuthService.validateDomain('mail!.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    test('should reject domain with consecutive dots', () => {
      const result = domainAuthService.validateDomain('mail..example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('consecutive dots');
    });
  });

  describe('createDomain', () => {
    test('should create domain successfully', async () => {
      const domain = 'test.example.com';
      const result = await domainAuthService.createDomain({
        domain,
        user: new mongoose.Types.ObjectId()
      });

      expect(result.domain).toBe(domain);
      expect(result.status).toBe('pending');
      expect(result.dkim).toBeDefined();
  expect(result.dkim.selector).toMatch(/^dkim-/);
    });

    test('should reject duplicate domain', async () => {
      const domain = 'test.example.com';
      await domainAuthService.createDomain({
        domain,
        user: new mongoose.Types.ObjectId()
      });

      await expect(domainAuthService.createDomain({
        domain,
        user: new mongoose.Types.ObjectId()
      })).rejects.toThrow('already registered');
    });
  });

  describe('buildDkimRecord', () => {
    test('should build correct DKIM record', async () => {
      const domain = await domainAuthService.createDomain({
        domain: 'test.example.com',
        user: new mongoose.Types.ObjectId()
      });

      const dkimRecord = domainAuthService.buildDkimRecord(domain);
      expect(dkimRecord.type).toBe('TXT');
  expect(dkimRecord.name).toMatch(/^dkim-[0-9a-f]+\._domainkey\.test\.example\.com$/);
      expect(dkimRecord.value).toContain('v=DKIM1');
      expect(dkimRecord.value).toContain('k=rsa');
      expect(dkimRecord.value).toContain('p=');
    });
  });

  describe('buildSpfRecord', () => {
    test('should build correct SPF record', () => {
      const spfRecord = domainAuthService.buildSpfRecord('test.example.com');
      expect(spfRecord.type).toBe('TXT');
      expect(spfRecord.name).toBe('test.example.com');
      expect(spfRecord.value).toBe('v=spf1 include:spf.resend.com ~all');
    });
  });

  describe('buildTrackingCname', () => {
    test('should build correct tracking CNAME record', async () => {
      const domain = await domainAuthService.createDomain({
        domain: 'test.example.com',
        user: new mongoose.Types.ObjectId()
      });

      const trackingRecord = domainAuthService.buildTrackingCname(domain);
      expect(trackingRecord.type).toBe('CNAME');
      expect(trackingRecord.name).toBe('track.test.example.com');
      expect(trackingRecord.value).toBe('tracking.emailxp.com');
    });
  });

  describe('listDomains', () => {
    test('should list domains with pagination', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create multiple domains
      for (let i = 0; i < 5; i++) {
        await domainAuthService.createDomain({
          domain: `test${i}.example.com`,
          user: userId
        });
      }

      const result = await domainAuthService.listDomains({ user: userId }, { page: 1, limit: 3 });

      expect(result.domains).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.pages).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    test('should filter domains by search', async () => {
      const userId = new mongoose.Types.ObjectId();

      await domainAuthService.createDomain({
        domain: 'mail.example.com',
        user: userId
      });
      await domainAuthService.createDomain({
        domain: 'smtp.test.com',
        user: userId
      });

      const result = await domainAuthService.listDomains(
        { user: userId },
        { search: 'mail' }
      );

      expect(result.domains).toHaveLength(1);
      expect(result.domains[0].domain).toBe('mail.example.com');
    });
  });

  describe('getDomainStats', () => {
    test('should return correct domain statistics', async () => {
      const userId = new mongoose.Types.ObjectId();

      // Create domains with different statuses
      const domain1 = await domainAuthService.createDomain({
        domain: 'verified.example.com',
        user: userId
      });
      await DomainAuthentication.findByIdAndUpdate(domain1._id, {
        status: 'verified',
        dkimVerified: true,
        spfVerified: true,
        trackingVerified: true
      });

      const domain2 = await domainAuthService.createDomain({
        domain: 'pending.example.com',
        user: userId
      });

      const stats = await domainAuthService.getDomainStats(userId);

      expect(stats.total).toBe(2);
      expect(stats.verified).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.partiallyVerified).toBe(0);
    });
  });
});
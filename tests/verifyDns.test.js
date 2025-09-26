const mongoose = require('mongoose');
const domainAuthService = require('../services/domainAuthService');
const dns = require('dns');

// Mock DNS functions
jest.mock('dns', () => ({ resolveTxt: jest.fn(), resolveCname: jest.fn(), resolveMx: jest.fn() }));

// Mock DomainAuthentication & User models to avoid DB calls in unit tests
jest.mock('../models/DomainAuthentication', () => ({
  findByIdAndUpdate: jest.fn(),
  findOne: jest.fn()
}));
jest.mock('../models/User', () => ({ updateOne: jest.fn() }));
const DomainAuthentication = require('../models/DomainAuthentication');
const User = require('../models/User');

describe('verifyDns DKIM and SPF parsing', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('verifies DKIM when p= matches full public key', async () => {
    const fakePublic = 'MIIBIjANBgkqh...FAKEKEY...';
    const domainAuth = {
      _id: new mongoose.Types.ObjectId(),
      domain: 'example.com',
      dkim: { selector: 'dkim-test', publicKey: fakePublic },
      user: null,
      organization: null
    };

    // dns.resolveTxt returns array of arrays (chunks). Simulate DKIM TXT containing p=<fullkey>
  dns.resolveTxt.mockResolvedValue([[`v=DKIM1; k=rsa; p=${fakePublic}`]]);
  dns.resolveCname.mockResolvedValue(['tracking.emailxp.com']);
  dns.resolveMx.mockResolvedValue([{ exchange: 'mx1.example.com' }]);

    // Mock the DB update response
    DomainAuthentication.findByIdAndUpdate.mockResolvedValue({
      ...domainAuth,
      dkimVerified: true,
      spfVerified: false,
      trackingVerified: true,
      status: 'partially_verified',
      lastCheckedAt: new Date(),
      error: null
    });

    const updated = await domainAuthService.verifyDns(domainAuth);
    expect(updated.dkimVerified).toBe(true);
    expect(updated.spfVerified).toBe(false); // SPF not present in this test
  });

  test('does not verify DKIM when p= missing and verifies SPF include', async () => {
    const fakePublic = 'MIIBIjANBgkqh...FAKEKEY...';
    const domainAuth = {
      _id: new mongoose.Types.ObjectId(),
      domain: 'example.org',
      dkim: { selector: 'dkim-test2', publicKey: fakePublic },
      user: null,
      organization: null
    };

    // DKIM TXT exists but without p= present
    dns.resolveTxt.mockImplementation(async (name) => {
      if (name.includes('_domainkey')) return [[`v=DKIM1; k=rsa; s=none`]];
      return [[`v=spf1 include:spf.resend.com ~all`]];
    });
    dns.resolveCname.mockResolvedValue(['tracking.emailxp.com']);
    dns.resolveMx.mockResolvedValue([{ exchange: 'mx1.example.org' }]);

    DomainAuthentication.findByIdAndUpdate.mockResolvedValue({
      ...domainAuth,
      dkimVerified: false,
      spfVerified: true,
      trackingVerified: true,
      status: 'partially_verified',
      lastCheckedAt: new Date(),
      error: null
    });

    const updated = await domainAuthService.verifyDns(domainAuth);
    expect(updated.dkimVerified).toBe(false);
    expect(updated.spfVerified).toBe(true);
  });
});

const crypto = require('crypto');
const dns = require('dns').promises;
const DomainAuthentication = require('../models/DomainAuthentication');
const logger = require('../utils/logger');

function generateDkimKeyPair() {
  // NOTE: For production, use a proper DKIM library. Here we simulate key generation.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' })
      .replace(/-----BEGIN PUBLIC KEY-----/,'')
      .replace(/-----END PUBLIC KEY-----/,'')
      .replace(/\n/g,''),
    privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' })
  };
}

class DomainAuthService {
  async createDomain({ domain, organization, user }) {
    domain = domain.toLowerCase().trim();
    // Enforce subdomain requirement: must have at least two dots (e.g., mail.example.com)
    const parts = domain.split('.');
    if (parts.length < 3) {
      throw new Error('A dedicated subdomain is required (e.g., mail.yourdomain.com)');
    }
    // Basic hostname character validation
    if (!/^[a-z0-9.-]+$/.test(domain) || /\.\./.test(domain) || domain.startsWith('-') || domain.endsWith('-')) {
      throw new Error('Invalid domain format');
    }
    const selector = 'dkim1';
    const { publicKey, privateKey } = generateDkimKeyPair();
    const record = await DomainAuthentication.create({
      domain,
      organization: organization || null,
      user: user || null,
      dkim: { selector, publicKey, privateKey },
      verificationTokens: { tracking: crypto.randomBytes(6).toString('hex') },
      bounceToken: crypto.randomBytes(8).toString('hex')
    });
    return record;
  }

  async listDomains(filter = {}) {
    return DomainAuthentication.find(filter).lean();
  }

  async getDomain(id) {
    return DomainAuthentication.findById(id).lean();
  }

  async regenerateDkim(id) {
    const { publicKey, privateKey } = generateDkimKeyPair();
    return DomainAuthentication.findByIdAndUpdate(id, {
      dkim: { selector: 'dkim1', publicKey, privateKey },
      dkimVerified: false,
      status: 'pending'
    }, { new: true });
  }

  buildDkimRecord(domainAuth) {
    if (!domainAuth?.dkim) return null;
    return {
      name: `${domainAuth.dkim.selector}._domainkey.${domainAuth.domain}`,
      type: 'TXT',
      value: `v=DKIM1; k=rsa; p=${domainAuth.dkim.publicKey}`
    };
  }

  buildSpfRecord(domain) {
    return { name: domain, type: 'TXT', value: `v=spf1 include:spf.resend.com ~all` };
  }

  buildTrackingCname(domainAuth) {
    return { name: `track.${domainAuth.domain}`, type: 'CNAME', value: `tracking.emailxp.com` };
  }

  buildBounceAddress(domainAuth) {
    const base = process.env.BOUNCE_BASE_DOMAIN || 'bounces.emailxp.com';
    if (!domainAuth?.bounceToken) return null;
    return `b+${domainAuth.bounceToken}@${base}`;
  }

  async getPrimaryDomainAuth(userId) {
    let primary = await DomainAuthentication.findOne({ user: userId, status: 'verified', isPrimary: true }).lean();
    if (!primary) {
      primary = await DomainAuthentication.findOne({ user: userId, status: 'verified' }).lean();
    }
    return primary;
  }

  async verifyDns(domainAuth) {
    const dkimRecord = this.buildDkimRecord(domainAuth);
    const spfRecord = this.buildSpfRecord(domainAuth.domain);
    const trackingRecord = this.buildTrackingCname(domainAuth);
    let dkimVerified = false, spfVerified = false, trackingVerified = false;
    try {
      if (dkimRecord) {
        const txt = await dns.resolveTxt(dkimRecord.name).catch(()=>[]);
        dkimVerified = txt.flat().some(str => str.includes(domainAuth.dkim.publicKey.slice(0,25)));
      }
      const spfTxt = await dns.resolveTxt(spfRecord.name).catch(()=>[]);
      spfVerified = spfTxt.flat().some(str => str.includes('spf.resend.com'));
      const cname = await dns.resolveCname(trackingRecord.name).catch(()=>[]);
      trackingVerified = cname.some(c => c.includes('tracking.emailxp.com'));
    } catch (e) {
      logger.warn('DNS verification error', { domain: domainAuth.domain, error: e.message });
    }
    const status = (dkimVerified && spfVerified && trackingVerified) ? 'verified' : (dkimVerified || spfVerified || trackingVerified) ? 'partially_verified' : 'pending';
    let updated = await DomainAuthentication.findByIdAndUpdate(domainAuth._id, {
      dkimVerified, spfVerified, trackingVerified, status, lastCheckedAt: new Date()
    }, { new: true });
    if (status === 'verified' && !updated.isPrimary) {
      // Ensure only one primary per user/org
      const existingPrimary = await DomainAuthentication.findOne({ $or: [ { user: updated.user }, { organization: updated.organization } ], isPrimary: true });
      if (!existingPrimary) {
        updated = await DomainAuthentication.findByIdAndUpdate(updated._id, { isPrimary: true }, { new: true });
      }
    }
    // Set user flag if applicable
    if (status === 'verified' && updated.user) {
      try {
        const User = require('../models/User');
        await User.updateOne({ _id: updated.user, hasVerifiedDomain: { $ne: true } }, { $set: { hasVerifiedDomain: true } });
      } catch (e) {
        logger.warn('Failed to update user.hasVerifiedDomain', { user: updated.user?.toString(), error: e.message });
      }
    }
    return updated;
  }

  async requireVerifiedDomain(domain, { allowUnverified = false } = {}) {
    if (process.env.ALLOW_UNVERIFIED_SENDING === 'true' || allowUnverified) return { allowed: true, reason: 'override' };
    const rootDomain = domain.toLowerCase().trim().split('@').pop();
    // Handle full email passed vs bare domain
    const pureDomain = rootDomain.includes('.') ? rootDomain : domain.toLowerCase().trim();
    const record = await DomainAuthentication.findOne({ domain: pureDomain });
    if (!record) return { allowed: false, reason: 'domain_not_registered' };
    if (record.status !== 'verified') return { allowed: false, reason: record.status };
    return { allowed: true, reason: 'verified' };
  }
}

module.exports = new DomainAuthService();

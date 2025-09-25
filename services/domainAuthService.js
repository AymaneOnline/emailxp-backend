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
    // Comprehensive domain validation
    const validation = this.validateDomain(domain);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    domain = domain.toLowerCase().trim();
    const selector = 'dkim1';
    const { publicKey, privateKey } = generateDkimKeyPair();

    try {
      const record = await DomainAuthentication.create({
        domain,
        organization: organization || null,
        user: user || null,
        dkim: { selector, publicKey, privateKey },
        verificationTokens: { tracking: crypto.randomBytes(6).toString('hex') },
        bounceToken: crypto.randomBytes(8).toString('hex')
      });

      logger.info('Domain created successfully', {
        domain,
        userId: user?.toString(),
        organizationId: organization?.toString(),
        domainId: record._id.toString()
      });

      return record;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('This domain is already registered');
      }
      logger.error('Failed to create domain', {
        domain,
        userId: user?.toString(),
        organizationId: organization?.toString(),
        error: error.message
      });
      throw error;
    }
  }

  validateDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return { valid: false, error: 'Domain is required' };
    }

    domain = domain.trim();

    if (domain.length === 0) {
      return { valid: false, error: 'Domain cannot be empty' };
    }

    if (domain.length > 253) {
      return { valid: false, error: 'Domain name is too long' };
    }

    // Check for valid characters (letters, numbers, hyphens, dots)
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
      return { valid: false, error: 'Domain contains invalid characters. Only letters, numbers, hyphens, and dots are allowed' };
    }

    // Check for consecutive dots
    if (/\.\./.test(domain)) {
      return { valid: false, error: 'Domain cannot contain consecutive dots' };
    }

    // Check for leading or trailing hyphens or dots
    if (domain.startsWith('-') || domain.startsWith('.') || domain.endsWith('-') || domain.endsWith('.')) {
      return { valid: false, error: 'Domain cannot start or end with a hyphen or dot' };
    }

    const parts = domain.split('.');

    // Must have at least two parts (domain.tld)
    if (parts.length < 2) {
      return { valid: false, error: 'Domain must include a top-level domain (e.g., example.com)' };
    }

    // Each part must be valid
    for (const part of parts) {
      if (part.length === 0) {
        return { valid: false, error: 'Domain parts cannot be empty' };
      }
      if (part.length > 63) {
        return { valid: false, error: 'Domain parts cannot be longer than 63 characters' };
      }
      if (part.startsWith('-') || part.endsWith('-')) {
        return { valid: false, error: 'Domain parts cannot start or end with hyphens' };
      }
    }

    // Check for valid TLD (basic check - at least 2 characters)
    const tld = parts[parts.length - 1];
    if (tld.length < 2) {
      return { valid: false, error: 'Top-level domain is too short' };
    }

    return { valid: true };
  }

  async listDomains(filter = {}, options = {}) {
    const { page = 1, limit = 50, sort = { createdAt: -1 } } = options;

    const query = { ...filter };

    // Add search functionality
    if (options.search) {
      query.domain = { $regex: options.search, $options: 'i' };
    }

    // Add status filter
    if (options.status) {
      query.status = options.status;
    }

    console.log('listDomains query:', query, 'options:', options);

    try {
      const domains = await DomainAuthentication.find(query)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

      const total = await DomainAuthentication.countDocuments(query);

      console.log('listDomains found:', domains.length, 'total:', total);

      return {
        domains,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to list domains', { filter, options, error: error.message });
      throw error;
    }
  }

  async getDomainStats(userId, organizationId = null) {
    try {
      const matchConditions = {};
      if (organizationId) {
        matchConditions.organization = organizationId;
      } else if (userId) {
        matchConditions.user = userId;
      }

      const stats = await DomainAuthentication.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
            partiallyVerified: { $sum: { $cond: [{ $eq: ['$status', 'partially_verified'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            error: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
            primary: { $sum: { $cond: ['$isPrimary', 1, 0] } }
          }
        }
      ]);

      return stats[0] || {
        total: 0,
        verified: 0,
        partiallyVerified: 0,
        pending: 0,
        error: 0,
        primary: 0
      };
    } catch (error) {
      logger.error('Failed to get domain stats', { userId, organizationId, error: error.message });
      throw error;
    }
  }

  async deleteDomain(id, userId, organizationId = null) {
    try {
      const domain = await DomainAuthentication.findById(id);
      if (!domain) {
        throw new Error('Domain not found');
      }

      // Check ownership
      if (organizationId && domain.organization?.toString() !== organizationId) {
        throw new Error('Unauthorized to delete this domain');
      }
      if (!organizationId && domain.user?.toString() !== userId) {
        throw new Error('Unauthorized to delete this domain');
      }

      // Prevent deletion of primary domains
      if (domain.isPrimary) {
        throw new Error('Cannot delete primary domain. Set another domain as primary first.');
      }

      await DomainAuthentication.findByIdAndDelete(id);

      logger.info('Domain deleted successfully', {
        domain: domain.domain,
        domainId: id,
        userId,
        organizationId
      });

      return { success: true, domain: domain.domain };
    } catch (error) {
      logger.error('Failed to delete domain', { domainId: id, userId, organizationId, error: error.message });
      throw error;
    }
  }

  async setPrimaryDomain(id, userId, organizationId = null) {
    try {
      const domain = await DomainAuthentication.findById(id);
      if (!domain) {
        throw new Error('Domain not found');
      }

      // Check ownership
      if (organizationId && domain.organization?.toString() !== organizationId) {
        throw new Error('Unauthorized to modify this domain');
      }
      if (!organizationId && domain.user?.toString() !== userId) {
        throw new Error('Unauthorized to modify this domain');
      }

      // Check if domain is verified
      if (domain.status !== 'verified') {
        throw new Error('Only verified domains can be set as primary');
      }

      // Remove primary flag from other domains
      await DomainAuthentication.updateMany(
        {
          $or: [{ user: userId }, { organization: organizationId }],
          _id: { $ne: id }
        },
        { isPrimary: false }
      );

      // Set this domain as primary
      const updated = await DomainAuthentication.findByIdAndUpdate(
        id,
        { isPrimary: true },
        { new: true }
      );

      logger.info('Primary domain updated', {
        domain: domain.domain,
        domainId: id,
        userId,
        organizationId
      });

      return updated;
    } catch (error) {
      logger.error('Failed to set primary domain', { domainId: id, userId, organizationId, error: error.message });
      throw error;
    }
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
    const startTime = Date.now();
    const dkimRecord = this.buildDkimRecord(domainAuth);
    const spfRecord = this.buildSpfRecord(domainAuth.domain);
    const trackingRecord = this.buildTrackingCname(domainAuth);

    let dkimVerified = false, spfVerified = false, trackingVerified = false, mxVerified = false;
    let dkimError = null, spfError = null, trackingError = null, mxError = null;

    try {
      // Verify DKIM record
      if (dkimRecord) {
        try {
          const txt = await dns.resolveTxt(dkimRecord.name);
          const records = txt.flat();
          dkimVerified = records.some(str => str.includes(domainAuth.dkim.publicKey.slice(0, 25)));
          if (!dkimVerified) {
            logger.debug('DKIM verification failed', {
              domain: domainAuth.domain,
              expectedKey: domainAuth.dkim.publicKey.slice(0, 25),
              foundRecords: records
            });
          }
        } catch (e) {
          dkimError = e.message;
          logger.debug('DKIM DNS lookup failed', { domain: domainAuth.domain, record: dkimRecord.name, error: e.message });
        }
      }

      // Verify SPF record
      try {
        const spfTxt = await dns.resolveTxt(spfRecord.name);
        const records = spfTxt.flat();
        spfVerified = records.some(str => str.includes('spf.resend.com'));
        if (!spfVerified) {
          logger.debug('SPF verification failed', {
            domain: domainAuth.domain,
            expectedValue: 'spf.resend.com',
            foundRecords: records
          });
        }
      } catch (e) {
        spfError = e.message;
        logger.debug('SPF DNS lookup failed', { domain: domainAuth.domain, record: spfRecord.name, error: e.message });
      }

      // Verify tracking CNAME
      try {
        const cname = await dns.resolveCname(trackingRecord.name);
        trackingVerified = cname.some(c => c.includes('tracking.emailxp.com'));
        if (!trackingVerified) {
          logger.debug('Tracking CNAME verification failed', {
            domain: domainAuth.domain,
            expectedValue: 'tracking.emailxp.com',
            foundRecords: cname
          });
        }
      } catch (e) {
        trackingError = e.message;
        logger.debug('Tracking CNAME lookup failed', { domain: domainAuth.domain, record: trackingRecord.name, error: e.message });
      }

      // Verify MX records (optional but recommended)
      try {
        const mxRecords = await dns.resolveMx(domainAuth.domain);
        // Check if domain has MX records configured (basic check)
        mxVerified = mxRecords && mxRecords.length > 0;
        if (!mxVerified) {
          logger.debug('MX verification failed - no MX records found', { domain: domainAuth.domain });
        }
      } catch (e) {
        mxError = e.message;
        logger.debug('MX DNS lookup failed', { domain: domainAuth.domain, error: e.message });
      }

    } catch (e) {
      logger.warn('DNS verification error', {
        domain: domainAuth.domain,
        error: e.message,
        duration: Date.now() - startTime
      });
    }

    // Determine overall status
    const allVerified = dkimVerified && spfVerified && trackingVerified;
    const someVerified = dkimVerified || spfVerified || trackingVerified;
    const status = allVerified ? 'verified' : someVerified ? 'partially_verified' : 'pending';

    // Prepare error summary
    const errors = [];
    if (dkimError) errors.push(`DKIM: ${dkimError}`);
    if (spfError) errors.push(`SPF: ${spfError}`);
    if (trackingError) errors.push(`Tracking: ${trackingError}`);
    if (mxError) errors.push(`MX: ${mxError}`);

    try {
      let updated = await DomainAuthentication.findByIdAndUpdate(domainAuth._id, {
        dkimVerified,
        spfVerified,
        trackingVerified,
        status,
        lastCheckedAt: new Date(),
        error: errors.length > 0 ? errors.join('; ') : null
      }, { new: true });

      // Set as primary if this is the first verified domain
      if (status === 'verified' && !updated.isPrimary) {
        const existingPrimary = await DomainAuthentication.findOne({
          $or: [{ user: updated.user }, { organization: updated.organization }],
          isPrimary: true
        });
        if (!existingPrimary) {
          updated = await DomainAuthentication.findByIdAndUpdate(updated._id, { isPrimary: true }, { new: true });
        }
      }

      // Update user flag if applicable
      if (status === 'verified' && updated.user) {
        try {
          const User = require('../models/User');
          await User.updateOne(
            { _id: updated.user, hasVerifiedDomain: { $ne: true } },
            { $set: { hasVerifiedDomain: true } }
          );
        } catch (e) {
          logger.warn('Failed to update user.hasVerifiedDomain', {
            user: updated.user?.toString(),
            error: e.message
          });
        }
      }

      logger.info('Domain verification completed', {
        domain: domainAuth.domain,
        domainId: domainAuth._id.toString(),
        status,
        dkimVerified,
        spfVerified,
        trackingVerified,
        mxVerified,
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined
      });

      return updated;
    } catch (updateError) {
      logger.error('Failed to update domain verification status', {
        domain: domainAuth.domain,
        domainId: domainAuth._id.toString(),
        error: updateError.message
      });
      throw updateError;
    }
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

// Periodic domain DNS re-verification job
// Lightweight cron-invoked module.

const DomainAuthentication = require('../models/DomainAuthentication');
const domainAuthService = require('../services/domainAuthService');
const User = require('../models/User');
const logger = require('../utils/logger');

async function runDomainReverificationBatch({ limit = 25, retryLimitPerRun = 20 } = {}) {
  const cutoff = new Date(Date.now() - 1000 * 60 * 30); // only recheck if >30m old
  // Include records where lastCheckedAt is older than cutoff OR is missing (newly created)
  const candidates = await DomainAuthentication.find({
    $and: [
      { status: { $in: ['verified','partially_verified','pending'] } },
      { $or: [ { lastCheckedAt: { $lte: cutoff } }, { lastCheckedAt: { $exists: false } }, { lastCheckedAt: null } ] }
    ]
  }).sort({ lastCheckedAt: 1 }).limit(limit);

  if (!candidates.length) return { checked: 0, updated: 0, regressions: 0 };
  let updated = 0, regressions = 0;
  for (const record of candidates) {
    try {
      const beforeStatus = record.status;
      const updatedRecord = await domainAuthService.verifyDns(record);
      if (updatedRecord.status !== beforeStatus) updated++;
      if (beforeStatus === 'verified' && updatedRecord.status !== 'verified') {
        regressions++;
        // If user loses all verified domains, clear flag
        if (updatedRecord.user) {
          const stillVerified = await DomainAuthentication.exists({ user: updatedRecord.user, status: 'verified' });
          if (!stillVerified) {
            await User.updateOne({ _id: updatedRecord.user }, { $set: { hasVerifiedDomain: false } });
          }
        }
      }
    } catch (e) {
      logger.warn('Domain reverify error', { id: record._id.toString(), domain: record.domain, error: e.message });
    }
  }
  // Auto-retry campaigns blocked due to domain issues if verification restored
  let retriesTriggered = 0;
  try {
    const Campaign = require('../models/Campaign');
    const { executeSendCampaign } = require('../utils/campaignScheduler');
    const retryable = await Campaign.find({ 'domainRetry.pendingAutoRetry': true, status: 'failed' }).limit(retryLimitPerRun);
    for (const camp of retryable) {
      // Ensure user still has verified primary domain
      const primary = await DomainAuthentication.findOne({ user: camp.user, isPrimary: true, status: 'verified' });
      if (!primary) continue;
      try {
        camp.status = 'draft'; // reset to allow resend path
        camp.domainRetry.pendingAutoRetry = false;
        camp.domainRetry.retryCount = (camp.domainRetry.retryCount || 0) + 1;
        camp.domainRetry.lastRetryAt = new Date();
        await camp.save();
        await executeSendCampaign(camp._id);
        retriesTriggered++;
      } catch (re) {
        logger.warn('Auto retry failed', { campaignId: camp._id.toString(), error: re.message });
      }
    }
  } catch (outer) {
    logger.warn('Retry scan failed', { error: outer.message });
  }
  return { checked: candidates.length, updated, regressions, retriesTriggered };
}

module.exports = { runDomainReverificationBatch };
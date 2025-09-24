const cron = require('node-cron');
const Subscriber = require('../models/Subscriber');
const logger = require('../utils/logger');

// Runs daily at 02:15 server time
function schedulePendingSubscriberCleanup() {
  cron.schedule('15 2 * * *', async () => {
    try {
      const result = await Subscriber.cleanupExpiredPending();
      if (result.removed > 0) {
        logger.info({ removed: result.removed }, 'Expired pending subscribers soft-deleted');
      }
    } catch (err) {
      logger.error({ err }, 'Failed pending subscriber cleanup');
    }
  });
}

module.exports = { schedulePendingSubscriberCleanup };

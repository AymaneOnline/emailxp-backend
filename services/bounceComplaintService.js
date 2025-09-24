const EmailLog = require('../models/EmailLog');
const Subscriber = require('../models/Subscriber');
const Suppression = require('../models/Suppression');
const logger = require('../utils/logger');

function classifyBounce(code, description='') {
  if (!code) return 'hard';
  const c = String(code).toUpperCase();
  if (/5\d\d/.test(c) || /PERM|PERMANENT/.test(description.toUpperCase())) return 'hard';
  if (/4\d\d/.test(c) || /TEMP|TEMPORARY/.test(description.toUpperCase())) return 'soft';
  return 'hard';
}

async function handleBounce({ messageId, email, code, description, raw, campaignId, subscriberId, bounceToken }) {
  const classification = classifyBounce(code, description);
  try {
    if (messageId) {
      await EmailLog.updateMany({ messageId }, { $set: { bounce: { code, description, classification, at: new Date() }, status: 'bounced' } });
    }
    if (subscriberId) {
      await Subscriber.updateOne({ _id: subscriberId }, { status: 'bounced' });
    }
    await Suppression.recordEvent(email, 'bounce', classification, 'webhook', null);
  } catch (e) {
    logger.error('Bounce handling failed', { error: e.message, email });
  }
  return classification;
}

async function handleComplaint({ messageId, email, feedbackType, raw, campaignId, subscriberId, bounceToken }) {
  try {
    if (messageId) {
      await EmailLog.updateMany({ messageId }, { $set: { complaint: { feedbackType, at: new Date() }, status: 'complained' } });
    }
    if (subscriberId) {
      await Subscriber.updateOne({ _id: subscriberId }, { status: 'complained' });
    }
    await Suppression.recordEvent(email, 'complaint', feedbackType || 'complaint', 'webhook', null);
  } catch (e) {
    logger.error('Complaint handling failed', { error: e.message, email });
  }
}

module.exports = { classifyBounce, handleBounce, handleComplaint };

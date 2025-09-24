// Webhook routes for handling email provider events (SendGrid, Resend)
const express = require('express');
const EmailLog = require('../models/EmailLog');
const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign');
const bounceComplaintService = require('../services/bounceComplaintService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Generic webhook handler for supported email providers (SendGrid, Resend)
 * Note: Mailgun webhooks removed - use SendGrid or Resend webhooks instead
 */
router.post('/email-provider', async (req, res) => {
  try {
    // Basic webhook acknowledgment for any email provider
  logger.info('Email provider webhook received', { body: req.body });
    res.status(200).json({ message: 'Webhook received' });
  } catch (error) {
  logger.error('Webhook processing error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Update campaign statistics
 */
async function updateCampaignStats(campaignId, metric, increment) {
  try {
    const updateField = {};
    updateField[`stats.${metric}`] = increment;
    
    await Campaign.findByIdAndUpdate(campaignId, {
      $inc: updateField
    });
  } catch (error) {
  logger.error('Failed to update campaign stats', { error: error.message });
  }
}

/**
 * Update subscriber engagement metrics
 */
async function updateSubscriberEngagement(subscriberId, action) {
  try {
    const updateData = {};
    
    if (action === 'opened') {
      updateData.lastOpenedAt = new Date();
      updateData.$inc = { totalOpens: 1 };
    } else if (action === 'clicked') {
      updateData.lastClickedAt = new Date();
      updateData.$inc = { totalClicks: 1 };
    }
    
    await Subscriber.findByIdAndUpdate(subscriberId, updateData);
  } catch (error) {
  logger.error('Failed to update subscriber engagement', { error: error.message });
  }
}

/**
 * Test webhook endpoint (for development)
 */
router.post('/test', async (req, res) => {
  logger.info('Test webhook received', { body: req.body });
  res.status(200).json({ message: 'Test webhook received' });
});

/**
 * Deliverability (bounce & complaint) unified webhook
 * Accepts single object or array of events:
 * [{ type: 'bounce', email, messageId, code, description, campaignId, subscriberId },
 *  { type: 'complaint', email, messageId, feedbackType, campaignId, subscriberId }]
 */
router.post('/deliverability', async (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  const results = [];
  for (const evt of events) {
    try {
      // Extract bounce token if present (patterns: b+<token>@, header x-bounce-token)
      let bounceToken = null;
      if (evt.returnPath && typeof evt.returnPath === 'string') {
        const match = evt.returnPath.match(/b\+([a-f0-9]{8,})@/i);
        if (match) bounceToken = match[1];
      }
      if (!bounceToken && evt.headers && (evt.headers['x-bounce-token'] || evt.headers['X-Bounce-Token'])) {
        bounceToken = (evt.headers['x-bounce-token'] || evt.headers['X-Bounce-Token']).toString();
      }
      if (evt.type === 'bounce') {
        const classification = await bounceComplaintService.handleBounce({
          messageId: evt.messageId,
          email: evt.email,
          code: evt.code,
          description: evt.description,
          raw: evt,
          campaignId: evt.campaignId,
          subscriberId: evt.subscriberId,
          bounceToken
        });
        // Reputation: map bounceToken -> domain
        if (bounceToken) {
          try {
            const DomainAuthentication = require('../models/DomainAuthentication');
            const auth = await DomainAuthentication.findOne({ bounceToken }).select('domain');
            if (auth) {
              const rep = require('../services/domainReputationService');
              rep.recordBounce(auth.domain).catch(()=>{});
            }
          } catch (re) {
            logger.warn('Failed domain reputation bounce record', { error: re.message });
          }
        }
        results.push({ ok: true, event: 'bounce', email: evt.email, classification });
      } else if (evt.type === 'complaint') {
        await bounceComplaintService.handleComplaint({
          messageId: evt.messageId,
          email: evt.email,
          feedbackType: evt.feedbackType,
          raw: evt,
          campaignId: evt.campaignId,
          subscriberId: evt.subscriberId,
          bounceToken
        });
        results.push({ ok: true, event: 'complaint', email: evt.email });
      } else {
        results.push({ ok: false, ignored: true, reason: 'unsupported_type', type: evt.type });
      }
    } catch (e) {
      logger.error('Deliverability event failed', { error: e.message, evt });
      results.push({ ok: false, error: e.message, email: evt.email });
    }
  }
  res.json({ processed: results.length, results });
});

module.exports = router;
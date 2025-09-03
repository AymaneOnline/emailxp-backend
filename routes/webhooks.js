// Webhook routes for handling Mailgun events
const express = require('express');
const crypto = require('crypto');
const EmailLog = require('../models/EmailLog');
const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign');

const router = express.Router();

/**
 * Verify Mailgun webhook signature
 */
const verifyWebhookSignature = (req, res, next) => {
  const signature = req.body.signature;
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  const { timestamp, token, signature: sig } = signature;
  
  // Create expected signature
  const value = timestamp + token;
  const hash = crypto
    .createHmac('sha256', process.env.MAILGUN_WEBHOOK_SIGNING_KEY)
    .update(value)
    .digest('hex');
  
  if (hash !== sig) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
};

/**
 * Handle all Mailgun webhook events
 */
router.post('/mailgun', verifyWebhookSignature, async (req, res) => {
  try {
    const { 'event-data': eventData } = req.body;
    
    if (!eventData) {
      return res.status(400).json({ error: 'Missing event data' });
    }
    
    const { event, message, recipient } = eventData;
    const messageId = message?.headers?.['message-id'];
    const campaignId = eventData['user-variables']?.campaign_id;
    const subscriberId = eventData['user-variables']?.subscriber_id;
    
    console.log(`Webhook received: ${event} for message ${messageId}`);
    
    // Find the email log entry
    let emailLog = await EmailLog.findOne({ messageId });
    
    if (!emailLog && campaignId && subscriberId) {
      // Create log entry if it doesn't exist
      emailLog = new EmailLog({
        campaignId,
        subscriberId,
        email: recipient,
        messageId,
        status: 'sent'
      });
    }
    
    if (!emailLog) {
      console.warn(`Email log not found for message ${messageId}`);
      return res.status(200).json({ message: 'Event processed' });
    }
    
    // Process different event types
    switch (event) {
      case 'delivered':
        await handleDelivered(emailLog, eventData);
        break;
        
      case 'opened':
        await handleOpened(emailLog, eventData);
        break;
        
      case 'clicked':
        await handleClicked(emailLog, eventData);
        break;
        
      case 'bounced':
        await handleBounced(emailLog, eventData);
        break;
        
      case 'complained':
        await handleComplained(emailLog, eventData);
        break;
        
      case 'unsubscribed':
        await handleUnsubscribed(emailLog, eventData);
        break;
        
      default:
        console.log(`Unhandled event type: ${event}`);
    }
    
    // Add webhook event to log
    emailLog.webhookEvents.push({
      eventType: event,
      timestamp: new Date(eventData.timestamp * 1000),
      data: eventData
    });
    
    await emailLog.save();
    
    res.status(200).json({ message: 'Event processed successfully' });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle delivered event
 */
async function handleDelivered(emailLog, eventData) {
  emailLog.status = 'delivered';
  emailLog.deliveredAt = new Date(eventData.timestamp * 1000);
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'delivered', 1);
}

/**
 * Handle opened event
 */
async function handleOpened(emailLog, eventData) {
  const metadata = {
    userAgent: eventData['user-agent'],
    ipAddress: eventData['ip'],
    location: eventData.geolocation
  };
  
  await emailLog.recordOpen(metadata);
  
  // Update subscriber engagement
  await updateSubscriberEngagement(emailLog.subscriberId, 'opened');
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'opened', 1);
}

/**
 * Handle clicked event
 */
async function handleClicked(emailLog, eventData) {
  const url = eventData.url;
  const metadata = {
    userAgent: eventData['user-agent'],
    ipAddress: eventData['ip']
  };
  
  await emailLog.recordClick(url, metadata);
  
  // Update subscriber engagement
  await updateSubscriberEngagement(emailLog.subscriberId, 'clicked');
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'clicked', 1);
}

/**
 * Handle bounced event
 */
async function handleBounced(emailLog, eventData) {
  const reason = eventData.reason || eventData.description;
  await emailLog.recordBounce(reason);
  
  // Add subscriber to suppression list if hard bounce
  if (eventData.severity === 'permanent') {
    await Subscriber.findByIdAndUpdate(emailLog.subscriberId, {
      status: 'bounced',
      bounceReason: reason,
      bouncedAt: new Date()
    });
  }
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'bounced', 1);
}

/**
 * Handle complained event (spam complaint)
 */
async function handleComplained(emailLog, eventData) {
  const reason = eventData.reason || 'Spam complaint';
  await emailLog.recordComplaint(reason);
  
  // Unsubscribe subscriber automatically
  await Subscriber.findByIdAndUpdate(emailLog.subscriberId, {
    status: 'complained',
    unsubscribedAt: new Date(),
    unsubscribeReason: 'Spam complaint'
  });
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'complained', 1);
}

/**
 * Handle unsubscribed event
 */
async function handleUnsubscribed(emailLog, eventData) {
  await emailLog.recordUnsubscribe();
  
  // Update subscriber status
  await Subscriber.findByIdAndUpdate(emailLog.subscriberId, {
    status: 'unsubscribed',
    unsubscribedAt: new Date(),
    unsubscribeReason: 'Webhook unsubscribe'
  });
  
  // Update campaign stats
  await updateCampaignStats(emailLog.campaignId, 'unsubscribed', 1);
}

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
    console.error('Failed to update campaign stats:', error);
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
    console.error('Failed to update subscriber engagement:', error);
  }
}

/**
 * Test webhook endpoint (for development)
 */
router.post('/test', async (req, res) => {
  console.log('Test webhook received:', req.body);
  res.status(200).json({ message: 'Test webhook received' });
});

module.exports = router;
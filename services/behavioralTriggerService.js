// emailxp/backend/services/behavioralTriggerService.js

const BehavioralEvent = require('../models/BehavioralEvent');
const BehavioralTrigger = require('../models/BehavioralTrigger');
const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const { addEmailJob } = require('./queueService');
const logger = require('../utils/logger');

/**
 * Process a behavioral event and check if any triggers should fire
 * @param {Object} eventData - The behavioral event data
 * @returns {Promise<Array>} - Array of triggered campaigns
 */
const processBehavioralEvent = async (eventData) => {
  try {
    // Create the behavioral event
    const event = new BehavioralEvent(eventData);
    await event.save();
    
    // Find all active triggers for this user
    const triggers = await BehavioralTrigger.find({
      user: eventData.user,
      isActive: true
    }).populate('campaignTemplate');
    
    const triggeredCampaigns = [];
    
    // Check each trigger
    for (const trigger of triggers) {
      // Check if this trigger matches the event
      if (doesEventMatchTrigger(event, trigger)) {
        // Check timing constraints
        if (trigger.checkTiming()) {
          // Check frequency limits
          if (await trigger.checkFrequency(eventData.subscriber)) {
            // Check subscriber conditions
            const subscriber = await Subscriber.findById(eventData.subscriber);
            if (subscriber && trigger.checkConditions(subscriber)) {
              // Trigger the campaign
              const campaign = await triggerCampaign(trigger, subscriber, event);
              if (campaign) {
                triggeredCampaigns.push(campaign);
                
                // Update trigger stats
                trigger.stats.timesFired += 1;
                trigger.lastFired = new Date();
                await trigger.save();
              }
            }
          }
        }
      }
    }
    
    return triggeredCampaigns;
  } catch (error) {
    logger.error('Error processing behavioral event:', error);
    throw error;
  }
};

/**
 * Check if an event matches a trigger
 * @param {Object} event - The behavioral event
 * @param {Object} trigger - The behavioral trigger
 * @returns {Boolean} - Whether the event matches the trigger
 */
const doesEventMatchTrigger = (event, trigger) => {
  const triggerEvent = trigger.triggerEvent;
  
  // Check event type
  if (triggerEvent.eventType !== event.eventType) {
    return false;
  }
  
  // Check custom event type if applicable
  if (triggerEvent.eventType === 'custom' && triggerEvent.customEventType) {
    if (triggerEvent.customEventType !== event.customEventType) {
      return false;
    }
  }
  
  // Check target if specified
  if (triggerEvent.target) {
    if (!event.target || !event.target.includes(triggerEvent.target)) {
      return false;
    }
  }
  
  // Check data filter if specified
  if (triggerEvent.dataFilter) {
    // This would be a more complex implementation checking event data against filter
    // For now, we'll return true
  }
  
  return true;
};

/**
 * Trigger a campaign based on a behavioral trigger
 * @param {Object} trigger - The behavioral trigger
 * @param {Object} subscriber - The subscriber
 * @param {Object} event - The behavioral event
 * @returns {Promise<Object|null>} - The triggered campaign or null
 */
const triggerCampaign = async (trigger, subscriber, event) => {
  try {
    // Get the campaign template
    const template = trigger.campaignTemplate;
    if (!template) {
      logger.warn('Trigger campaign template not found:', trigger._id);
      return null;
    }
    
    // Create a personalized campaign instance
    const campaignData = {
      user: trigger.user,
      name: `${template.name} - Triggered ${new Date().toISOString()}`,
      subject: template.subject,
      fromEmail: template.fromEmail,
      fromName: template.fromName,
      htmlContent: template.htmlContent,
      plainTextContent: template.plainTextContent,
      // Assign to the specific subscriber
      individualSubscribers: [subscriber._id],
      status: 'draft',
      type: 'triggered',
      category: 'behavioral'
    };
    
    const campaign = new Campaign(campaignData);
    await campaign.save();
    
    // Personalize the content for this subscriber
    const personalizedHtml = personalizeContent(template.htmlContent, subscriber);
    const personalizedText = personalizeContent(template.plainTextContent, subscriber);
    const personalizedSubject = personalizeContent(template.subject, subscriber);
    
    // Schedule the email with delay if specified
    const delay = (trigger.timing?.delayMinutes || 0) * 60 * 1000; // Convert to milliseconds
    
    // Queue the email
    const emailData = {
      toEmail: subscriber.email,
      subject: personalizedSubject,
      htmlContent: personalizedHtml,
      plainTextContent: personalizedText,
      campaignId: campaign._id,
      subscriberId: subscriber._id,
      fromEmail: 'onboarding@resend.dev', // Use verified sender
      fromName: template.fromName
    };
    
    await addEmailJob(emailData, { delay });
    
    logger.info(`Triggered campaign ${campaign._id} for subscriber ${subscriber._id}`);
    
    return campaign;
  } catch (error) {
    logger.error('Error triggering campaign:', error);
    return null;
  }
};

/**
 * Personalize content with subscriber data
 * @param {String} content - The content to personalize
 * @param {Object} subscriber - The subscriber data
 * @returns {String} - The personalized content
 */
const personalizeContent = (content, subscriber) => {
  if (!content) return content;
  
  return content
    .replace(/\{\{name\}\}/g, subscriber.name || 'there')
    .replace(/\{\{firstName\}\}/g, subscriber.name ? subscriber.name.split(' ')[0] : 'there')
    .replace(/\{\{email\}\}/g, subscriber.email || '')
    .replace(/\{\{location.country\}\}/g, subscriber.location?.country || '')
    .replace(/\{\{location.city\}\}/g, subscriber.location?.city || '');
};

/**
 * Get behavioral events for a subscriber
 * @param {String} userId - The user ID
 * @param {String} subscriberId - The subscriber ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of behavioral events
 */
const getSubscriberEvents = async (userId, subscriberId, options = {}) => {
  const { limit = 50, eventType, startDate, endDate } = options;
  
  const query = {
    user: userId,
    subscriber: subscriberId
  };
  
  if (eventType) {
    query['triggerEvent.eventType'] = eventType;
  }
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  return await BehavioralEvent.find(query)
    .sort({ timestamp: -1 })
    .limit(limit);
};

/**
 * Get trigger statistics
 * @param {String} userId - The user ID
 * @returns {Promise<Object>} - Trigger statistics
 */
const getTriggerStats = async (userId) => {
  const triggers = await BehavioralTrigger.find({ user: userId });
  
  let totalFired = 0;
  let activeTriggers = 0;
  
  triggers.forEach(trigger => {
    totalFired += trigger.stats.timesFired;
    if (trigger.isActive) activeTriggers++;
  });
  
  return {
    totalTriggers: triggers.length,
    activeTriggers,
    totalFired
  };
};

module.exports = {
  processBehavioralEvent,
  getSubscriberEvents,
  getTriggerStats
};
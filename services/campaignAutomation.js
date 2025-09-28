// emailxp/backend/services/campaignAutomation.js

const CampaignSchedule = require('../models/CampaignSchedule');
const Campaign = require('../models/Campaign');
const Subscriber = require('../models/Subscriber');
const Template = require('../models/Template');
const { sendEmail } = require('../services/emailService');
// Tracking is handled within emailService by injecting pixel and link redirects

class CampaignAutomationEngine {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 60000; // Check every minute
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) return;
    
    console.log('Starting Campaign Automation Engine...');
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.processPendingCampaigns();
    }, this.checkInterval);
  }

  stop() {
    if (!this.isRunning) return;
    
    console.log('Stopping Campaign Automation Engine...');
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async processPendingCampaigns() {
    try {
      const now = new Date();
      
      // Find campaigns that should be executed
      const pendingSchedules = await CampaignSchedule.find({
        $or: [
          { 
            status: 'scheduled',
            scheduledDate: { $lte: now }
          },
          {
            status: 'running',
            'stats.nextExecution': { $lte: now }
          }
        ],
        isActive: true
      }).populate('campaign').populate('user');

      console.log(`Found ${pendingSchedules.length} pending campaign schedules`);

      for (const schedule of pendingSchedules) {
        await this.executeCampaignSchedule(schedule);
      }
    } catch (error) {
      console.error('Error processing pending campaigns:', error);
    }
  }

  async executeCampaignSchedule(schedule) {
    try {
      console.log(`Executing campaign schedule: ${schedule.name}`);
      
      let result;
      
      switch (schedule.scheduleType) {
        case 'immediate':
        case 'scheduled':
          result = await this.executeStandardCampaign(schedule);
          break;
        case 'recurring':
          result = await this.executeRecurringCampaign(schedule);
          break;
        case 'drip':
          result = await this.executeDripCampaign(schedule);
          break;
        case 'trigger':
          result = await this.executeTriggerCampaign(schedule);
          break;
        default:
          throw new Error(`Unknown schedule type: ${schedule.scheduleType}`);
      }

      // Record execution
      schedule.recordExecution(result);
      await schedule.save();

      console.log(`Campaign schedule executed successfully: ${schedule.name}`);
    } catch (error) {
      console.error(`Error executing campaign schedule ${schedule.name}:`, error);
      
      // Record failed execution
      schedule.recordExecution({
        status: 'failed',
        recipientCount: 0,
        successCount: 0,
        failureCount: 0,
        errors: [error.message]
      });
      await schedule.save();
    }
  }

  async executeStandardCampaign(schedule) {
    const campaign = schedule.campaign;
    
    // Get recipients based on campaign targeting
    const recipients = await this.getRecipients(campaign);
    
    if (recipients.length === 0) {
      return {
        status: 'success',
        recipientCount: 0,
        successCount: 0,
        failureCount: 0
      };
    }

    // Apply throttling if configured
    const maxRecipients = schedule.settings.maxRecipientsPerExecution;
    const recipientsToProcess = recipients.slice(0, maxRecipients);

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const recipient of recipientsToProcess) {
      try {
        await this.sendCampaignEmail(campaign, recipient, schedule);
        successCount++;
        
        // Apply throttle delay
        if (schedule.settings.throttleDelay > 0) {
          await this.delay(schedule.settings.throttleDelay);
        }
      } catch (error) {
        failureCount++;
        errors.push(`Failed to send to ${recipient.email}: ${error.message}`);
      }
    }

    return {
      status: failureCount === 0 ? 'success' : 'partial',
      recipientCount: recipientsToProcess.length,
      successCount,
      failureCount,
      errors
    };
  }

  async executeRecurringCampaign(schedule) {
    // Check if we should continue recurring
    if (schedule.recurrence.endDate && new Date() > schedule.recurrence.endDate) {
      schedule.status = 'completed';
      await schedule.save();
      return {
        status: 'success',
        recipientCount: 0,
        successCount: 0,
        failureCount: 0
      };
    }

    if (schedule.recurrence.maxOccurrences && 
        schedule.stats.totalExecutions >= schedule.recurrence.maxOccurrences) {
      schedule.status = 'completed';
      await schedule.save();
      return {
        status: 'success',
        recipientCount: 0,
        successCount: 0,
        failureCount: 0
      };
    }

    // Execute as standard campaign
    const result = await this.executeStandardCampaign(schedule);
    
    // Set status to running for next execution
    if (schedule.status !== 'completed') {
      schedule.status = 'running';
    }

    return result;
  }

  async executeDripCampaign(schedule) {
    const campaign = schedule.campaign;
    const recipients = await this.getRecipients(campaign);
    
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    // Process each step in the drip sequence
    for (const step of schedule.dripSequence) {
      // Find recipients who should receive this step
      const stepRecipients = await this.getDripStepRecipients(recipients, step, schedule);
      
      for (const recipient of stepRecipients) {
        try {
          // Get template for this step
          const template = await Template.findById(step.template);
          if (!template) {
            throw new Error(`Template not found: ${step.template}`);
          }

          // Create campaign-like object for this step
          const stepCampaign = {
            ...campaign.toObject(),
            subject: step.subject || campaign.subject,
            template: template._id,
            htmlContent: template.htmlContent
          };

          await this.sendCampaignEmail(stepCampaign, recipient, schedule);
          successCount++;
        } catch (error) {
          failureCount++;
          errors.push(`Failed to send drip step to ${recipient.email}: ${error.message}`);
        }
      }
    }

    return {
      status: failureCount === 0 ? 'success' : 'partial',
      recipientCount: recipients.length,
      successCount,
      failureCount,
      errors
    };
  }

  async executeTriggerCampaign(schedule) {
    // Trigger campaigns are handled by event listeners
    // This method is called when a trigger event occurs
    return await this.executeStandardCampaign(schedule);
  }

  async getRecipients(campaign) {
    // Default to subscribers that are not deleted and not unsubscribed.
    // Previous default used { isActive: true } which doesn't exist on Subscriber
    // documents and therefore returned zero recipients. Use a safer default
    // that matches the Subscriber schema.
    const query = { isDeleted: false, status: { $ne: 'unsubscribed' } };

    // If the campaign has an owning user, scope recipients to that user
    if (campaign && campaign.user) {
      query.user = campaign.user;
    }

    console.log('[Automation] getRecipients base query:', query);

    // Apply targeting criteria
    if (campaign && campaign.targeting) {
      if (campaign.targeting.groups && campaign.targeting.groups.length > 0) {
        query.groups = { $in: campaign.targeting.groups };
      }

      if (campaign.targeting.tags && campaign.targeting.tags.length > 0) {
        query.tags = { $in: campaign.targeting.tags };
      }

      if (campaign.targeting.segments && campaign.targeting.segments.length > 0) {
        // Apply segment logic (simplified)
        query.segments = { $in: campaign.targeting.segments };
      }
    }

    const recipients = await Subscriber.find(query);
    console.log('[Automation] getRecipients found recipients:', (recipients || []).length, 'for campaign:', campaign && (campaign._id || campaign.id));
    return recipients;
  }

  async getDripStepRecipients(allRecipients, step, schedule) {
    // This is a simplified version - in reality, you'd track
    // when each recipient entered the drip sequence and
    // calculate if they should receive this step based on timing
    
    const now = new Date();
    const stepDelay = this.convertDelayToMilliseconds(step.delay, step.delayUnit);
    
    // For demo purposes, return all recipients
    // In production, you'd filter based on when they entered the sequence
    return allRecipients.filter(recipient => {
      // Check if recipient meets step conditions
      if (step.conditions && step.conditions.length > 0) {
        return this.evaluateConditions(recipient, step.conditions);
      }
      return true;
    });
  }

  async sendCampaignEmail(campaign, recipient, schedule) {
    // Personalize content
    const personalizedContent = this.personalizeContent(
      campaign.htmlContent, 
      recipient
    );
    
    const personalizedSubject = this.personalizeContent(
      campaign.subject, 
      recipient
    );

    // Send email using central email service (handles tracking injection)
    await sendEmail(
      recipient.email,
      personalizedSubject,
      personalizedContent,
      '',
      campaign._id,
      recipient._id,
      undefined,
      campaign.fromEmail,
      campaign.fromName
    );
  }

  personalizeContent(content, recipient) {
    if (!content) return content;
    
    // Replace common placeholders
    return content
      .replace(/\{\{firstName\}\}/g, recipient.firstName || '')
      .replace(/\{\{lastName\}\}/g, recipient.lastName || '')
      .replace(/\{\{email\}\}/g, recipient.email || '')
      .replace(/\{\{name\}\}/g, `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim());
  }

  evaluateConditions(recipient, conditions) {
    return conditions.every(condition => {
      const fieldValue = this.getFieldValue(recipient, condition.field);
      return this.evaluateCondition(fieldValue, condition.operator, condition.value);
    });
  }

  getFieldValue(recipient, field) {
    const fields = field.split('.');
    let value = recipient;
    
    for (const f of fields) {
      value = value?.[f];
    }
    
    return value;
  }

  evaluateCondition(fieldValue, operator, conditionValue) {
    switch (operator) {
      case 'equals':
        return fieldValue === conditionValue;
      case 'not_equals':
        return fieldValue !== conditionValue;
      case 'contains':
        return String(fieldValue).includes(String(conditionValue));
      case 'not_contains':
        return !String(fieldValue).includes(String(conditionValue));
      case 'greater_than':
        return Number(fieldValue) > Number(conditionValue);
      case 'less_than':
        return Number(fieldValue) < Number(conditionValue);
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null;
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null;
      default:
        return false;
    }
  }

  convertDelayToMilliseconds(delay, unit) {
    const multipliers = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000
    };
    
    return delay * (multipliers[unit] || multipliers.hours);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event handlers for trigger campaigns
  async handleSubscriberAdded(subscriber) {
    console.log('[Automation] handleSubscriberAdded invoked for subscriber:', subscriber && (subscriber._id || subscriber.id || subscriber.email));
    const triggerSchedules = await CampaignSchedule.find({
      scheduleType: 'trigger',
      'triggers.event': 'subscriber_added',
      status: 'running',
      isActive: true
    });
    console.log('[Automation] found triggerSchedules:', Array.isArray(triggerSchedules) ? triggerSchedules.length : 0);

    for (const schedule of triggerSchedules) {
      // Check if subscriber meets trigger conditions
      const applicableTriggers = schedule.triggers.filter(trigger => 
        trigger.event === 'subscriber_added' &&
        this.evaluateConditions(subscriber, trigger.conditions || [])
      );

      if (applicableTriggers.length > 0) {
        console.log('[Automation] schedule matches subscriber_added:', { scheduleId: schedule._id ? schedule._id.toString() : schedule.id, matchedTriggers: applicableTriggers.length });
      } else {
        console.log('[Automation] schedule did NOT match conditions:', { scheduleId: schedule._id ? schedule._id.toString() : schedule.id });
      }

      for (const trigger of applicableTriggers) {
        // Schedule execution with delay
        setTimeout(async () => {
          try {
            console.log('[Automation] executing trigger schedule:', { scheduleId: schedule._id ? schedule._id.toString() : schedule.id, triggerId: trigger.id || trigger._id });
            await this.executeCampaignSchedule(schedule);
          } catch (err) {
            console.error('[Automation] failed executing trigger schedule:', err && err.message ? err.message : err);
          }
        }, this.convertDelayToMilliseconds(trigger.delay, trigger.delayUnit));
      }
    }
  }

  async handleTagAdded(subscriber, tag) {
    const triggerSchedules = await CampaignSchedule.find({
      scheduleType: 'trigger',
      'triggers.event': 'tag_added',
      status: 'running',
      isActive: true
    });

    for (const schedule of triggerSchedules) {
      const applicableTriggers = schedule.triggers.filter(trigger => 
        trigger.event === 'tag_added' &&
        this.evaluateConditions({ ...subscriber, addedTag: tag }, trigger.conditions || [])
      );

      for (const trigger of applicableTriggers) {
        setTimeout(async () => {
          await this.executeCampaignSchedule(schedule);
        }, this.convertDelayToMilliseconds(trigger.delay, trigger.delayUnit));
      }
    }
  }
}

// Create singleton instance
const campaignAutomationEngine = new CampaignAutomationEngine();

module.exports = {
  CampaignAutomationEngine,
  campaignAutomationEngine
};
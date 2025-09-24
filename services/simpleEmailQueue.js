// Simple in-memory email queue (fallback when Redis is not available)
const emailService = require('./emailService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');
const mongoose = require('mongoose');
const { personalizeDynamicContent } = require('./personalizationService');
const suppressionService = require('./suppressionService');

class SimpleEmailQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.stats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };
    
    // Clean up any invalid jobs on startup
    this.cleanupInvalidJobs();
  }

  /**
   * Clean up invalid jobs from queue on startup
   */
  async cleanupInvalidJobs() {
    try {
      console.log('Checking for invalid jobs in queue...');
      
      // Get all unique campaign IDs from current jobs
      const campaignIds = new Set();
      this.queue.forEach(job => {
        if (job.data?.campaignId) {
          campaignIds.add(job.data.campaignId.toString());
        }
      });
      
      if (campaignIds.size === 0) {
        console.log('No campaign jobs found in queue');
        return;
      }
      
      console.log(`Found ${campaignIds.size} unique campaigns in queue, verifying...`);
      
      // Check which campaigns actually exist
      const existingCampaigns = await Campaign.find({
        _id: { $in: Array.from(campaignIds) }
      }).select('_id');
      
      const existingIds = new Set(existingCampaigns.map(c => c._id.toString()));
      const invalidIds = Array.from(campaignIds).filter(id => !existingIds.has(id));
      
      if (invalidIds.length > 0) {
        console.log(`Found ${invalidIds.length} invalid campaigns, cleaning up:`, invalidIds);
        
        // Remove jobs for invalid campaigns
        const initialLength = this.queue.length;
        this.queue = this.queue.filter(job => {
          const jobCampaignId = job.data?.campaignId?.toString();
          if (jobCampaignId && invalidIds.includes(jobCampaignId)) {
            this.stats.waiting = Math.max(0, this.stats.waiting - 1);
            return false;
          }
          return true;
        });
        
        const removedJobs = initialLength - this.queue.length;
        console.log(`Cleaned up ${removedJobs} invalid jobs from queue`);
      } else {
        console.log('All campaigns in queue are valid');
      }
      
    } catch (error) {
      console.error('Error during startup cleanup:', error);
    }
  }

  /**
   * Add email to queue
   */
  async addEmailToQueue(emailData, campaignId, subscriberId, options = {}) {
    const job = {
      id: Date.now() + Math.random(),
      type: 'send-email',
      data: { emailData, campaignId, subscriberId },
      options,
      status: 'waiting',
      createdAt: new Date()
    };

    this.queue.push(job);
    this.stats.waiting++;
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return job.id;
  }

  /**
   * Add campaign to queue
   */
  async addCampaignToQueue(campaignId, options = {}) {
    console.log(`📋 SimpleQueue: addCampaignToQueue called for campaign: ${campaignId}`);
    
    const job = {
      id: Date.now() + Math.random(),
      type: 'send-campaign',
      data: { campaignId },
      options,
      status: 'waiting',
      createdAt: new Date()
    };

    this.queue.push(job);
    this.stats.waiting++;
    
    console.log(`📋 SimpleQueue: Campaign ${campaignId} added to queue with job ID: ${job.id}, queue length: ${this.queue.length}`);
    
    if (!this.processing) {
      console.log(`📋 SimpleQueue: Starting queue processing...`);
      this.processQueue();
    }

    return job.id;
  }

  /**
   * Schedule campaign
   */
  async scheduleCampaign(campaignId, scheduledTime) {
    const delay = new Date(scheduledTime).getTime() - Date.now();
    
    if (delay <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    // Ensure campaignId is a proper ObjectId
    const objectId = mongoose.Types.ObjectId.isValid(campaignId) 
      ? new mongoose.Types.ObjectId(campaignId) 
      : campaignId;

    const job = {
      id: `scheduled-campaign-${objectId}`,
      type: 'send-scheduled-campaign',
      data: { campaignId: objectId },
      options: { delay },
      status: 'scheduled',
      scheduledFor: scheduledTime,
      createdAt: new Date()
    };

    // Schedule the job
    setTimeout(() => {
      this.queue.push(job);
      this.stats.waiting++;
      if (!this.processing) {
        this.processQueue();
      }
    }, delay);

    // Update campaign status
    await Campaign.findByIdAndUpdate(objectId, {
      status: 'scheduled',
      scheduledAt: scheduledTime,
      jobId: job.id
    });

    return job.id;
  }

  /**
   * Process queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      console.log(`📋 SimpleQueue: processQueue called but ${this.processing ? 'already processing' : 'queue empty'}`);
      return;
    }

    this.processing = true;
    console.log(`📋 SimpleQueue: Starting to process queue with ${this.queue.length} jobs`);
  logger.info('Processing email queue start', { waiting: this.queue.length });

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.stats.waiting--;
      this.stats.active++;

      console.log(`📋 SimpleQueue: Processing job ${job.id} of type ${job.type}`);
      
      try {
        await this.processJob(job);
        this.stats.active--;
        this.stats.completed++;
        console.log(`📋 SimpleQueue: Job ${job.id} completed successfully`);
  logger.info('Simple job completed', { jobId: job.id });
      } catch (error) {
        this.stats.active--;
        this.stats.failed++;
  logger.error('Simple job failed', { jobId: job.id, error: error.message });
        
        // If it's a campaign not found error, clean up
        if (error.message.includes('not found in database')) {
          console.log(`Detected invalid campaign, cleaning up queue`);
        }
      }

      // Small delay between jobs to prevent overwhelming
      await this.delay(100);
    }

    this.processing = false;
  logger.info('Processing email queue finished', { remaining: this.queue.length });
  }

  /**
   * Process individual job
   */
  async processJob(job) {
    const { type, data } = job;

    switch (type) {
      case 'send-email':
        return await this.processSendEmail(data);
      
      case 'send-campaign':
      case 'send-scheduled-campaign':
        return await this.processCampaign(data.campaignId);
      
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  }

  /**
   * Process single email
   */
  async processSendEmail({ emailData, campaignId, subscriberId }) {
    try {
      const idempotencyKey = crypto.createHash('sha256').update(`${campaignId}:${subscriberId}:${emailData.subject || ''}`).digest('hex');
      const existing = await EmailLog.findOne({ idempotencyKey });
      if (existing) {
        logger.warn('Duplicate send prevented (simple queue)', { campaignId, subscriberId, email: emailData.to });
        return { duplicate: true, messageId: existing.messageId };
      }
      const result = await emailService.sendEmail({ ...emailData, campaignId, subscriberId });

      // Log successful send
      await this.logEmail({
        campaignId,
        subscriberId,
        email: emailData.to,
        status: 'sent',
        messageId: result.messageId,
        sentAt: new Date(),
        metadata: emailData.bounce ? { bounceToken: emailData.bounce.token, returnPath: emailData.bounce.returnPath } : undefined
      });

      return result;
    } catch (error) {
      // Log failed send
      await this.logEmail({
        campaignId,
        subscriberId,
        email: emailData.to,
        status: 'failed',
        error: error.message,
        sentAt: new Date(),
        metadata: emailData.bounce ? { bounceToken: emailData.bounce.token, returnPath: emailData.bounce.returnPath } : undefined
      });
      
      throw error;
    }
  }

  /**
   * Process campaign
   */
  async processCampaign(campaignId) {
    // Ensure campaignId is a proper ObjectId
    let objectId;
    try {
      objectId = mongoose.Types.ObjectId.isValid(campaignId) 
        ? new mongoose.Types.ObjectId(campaignId) 
        : campaignId;
    } catch (error) {
      console.error(`Invalid campaign ID format: ${campaignId}`);
      throw new Error(`Invalid campaign ID format: ${campaignId}`);
    }
    
    console.log('DEBUG: About to populate campaign fields for campaign:', objectId);
    
    let campaign;
    try {
      campaign = await Campaign.findById(objectId)
        .populate('template')
        .populate('individualSubscribers')
        .populate('groups')
        .populate('segments');
      
      console.log('DEBUG: Successfully populated campaign fields');
    } catch (populateError) {
      console.error('DEBUG: Populate error occurred:', populateError.message);
      console.error('DEBUG: Full populate error:', populateError);
      throw populateError;
    }

    if (!campaign) {
      const errorMsg = `Campaign ${objectId} not found in database`;
      console.error('DEBUG:', errorMsg);
      
      // Clean up any references to this non-existent campaign
      await this.cleanupInvalidCampaign(objectId);
      
      throw new Error(errorMsg);
    }

    // Validate campaign has required fields
    if (!campaign.subject) {
      throw new Error(`Campaign ${objectId} is missing required subject`);
    }
    
    if (!campaign.fromEmail && !campaign.fromName) {
      // Set default values if missing
      campaign.fromEmail = process.env.DEFAULT_FROM_EMAIL || 'noreply@emailxp.com';
      campaign.fromName = process.env.DEFAULT_FROM_NAME || 'EmailXP';
    }

    // Update campaign status
    await Campaign.findByIdAndUpdate(objectId, { 
      status: 'sending',
      startedAt: new Date()
    });

  logger.debug('Campaign data', {
      campaignId: objectId,
      hasTemplate: !!campaign.template,
      hasHtmlContent: !!campaign.htmlContent,
      templateId: campaign.template?._id,
      hasIndividualSubscribers: !!(campaign.individualSubscribers && campaign.individualSubscribers.length),
      individualSubscribersCount: campaign.individualSubscribers ? campaign.individualSubscribers.length : 0,
      hasGroups: !!(campaign.groups && campaign.groups.length),
      groupsCount: campaign.groups ? campaign.groups.length : 0,
      hasSegments: !!(campaign.segments && campaign.segments.length),
      segmentsCount: campaign.segments ? campaign.segments.length : 0,
      subject: campaign.subject,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail
    });

    // Get subscribers from different sources
    let subscribers = campaign.individualSubscribers || [];
  logger.debug('Initial individual subscribers', { count: subscribers.length });
    
    // If no individual subscribers, get from groups and segments
    if (subscribers.length === 0) {
      const Subscriber = require('../models/Subscriber');
      const allSubscribers = new Set();
      
      // Get subscribers from groups
      if (campaign.groups && campaign.groups.length > 0) {
        const groupIds = campaign.groups.map(g => g._id);
  logger.debug('Fetching group subscribers', { groups: groupIds });
        const groupSubscribers = await Subscriber.find({
          groups: { $in: groupIds },
          status: 'subscribed'
        });
  logger.debug('Group subscribers found', { count: groupSubscribers.length });
        groupSubscribers.forEach(sub => allSubscribers.add(sub._id.toString()));
      }
      
      // Get subscribers from segments
      if (campaign.segments && campaign.segments.length > 0) {
        // For now, get all subscribed users for segments (you can implement segment logic later)
        const segmentSubscribers = await Subscriber.find({
          status: 'subscribed'
        });
        segmentSubscribers.forEach(sub => allSubscribers.add(sub._id.toString()));
      }
      
      // Convert back to subscriber objects
      if (allSubscribers.size > 0) {
  logger.debug('Unique subscriber IDs gathered', { total: allSubscribers.size });
        subscribers = await Subscriber.find({
          _id: { $in: Array.from(allSubscribers) },
          status: 'subscribed'
        });
  logger.debug('Final subscribers loaded', { total: subscribers.length });
      } else {
  logger.info('No subscribers found in groups or segments');
      }
    }

  logger.info('Campaign subscribers loaded', { campaignId: objectId, total: subscribers.length });

    // Suppression filtering
    const allEmails = subscribers.map(s => s.email.toLowerCase());
    const { suppressed } = await suppressionService.bulkFilter(allEmails, campaign.organization || null);
    if (suppressed.size) {
      const before = subscribers.length;
      subscribers = subscribers.filter(s => !suppressed.has(s.email.toLowerCase()));
  logger.info('Suppression applied', { campaignId: objectId, skipped: before - subscribers.length });
    }

    if (subscribers.length === 0) {
  logger.warn('No eligible subscribers after suppression', { campaignId: objectId });
      await Campaign.findByIdAndUpdate(objectId, {
        status: 'completed',
        completedAt: new Date(),
        error: 'No eligible (non-suppressed) subscribers found'
      });
      return;
    }

  const { template, subject, fromName } = campaign;
    // Fetch primary domain auth for bounce metadata (non-blocking if fails)
    let primaryDomainAuth = null;
    try {
      const domainAuthService = require('./domainAuthService');
      primaryDomainAuth = await domainAuthService.getPrimaryDomainAuth(campaign.user);
    } catch(_) {}
    let processedCount = 0;

    // Process subscribers in batches
    const batchSize = 10; // Smaller batches for simple queue
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      
      // Process batch
      const emailPromises = batch.map(subscriber => {
        // Handle case where template is null or doesn't have structure
        let personalizedContent;
        if (template && template.structure) {
          // Extract dynamic blocks for personalization
          const dynamicBlocks = (template.structure.blocks || []).filter(block => block.type === 'dynamic');
          personalizedContent = this.personalizeHtmlContentWithDynamicBlocks(campaign.htmlContent, subscriber, dynamicBlocks);
        } else if (campaign.htmlContent) {
          // Use campaign's HTML content if template is not available
          personalizedContent = this.personalizeHtmlContent(campaign.htmlContent, subscriber);
        } else {
          // Fallback to basic template
          personalizedContent = this.personalizeContent(null, subscriber);
        }
        
        const emailData = {
          to: subscriber.email,
          from: campaign.fromEmail,
          fromName: fromName,
          subject: this.personalizeSubject(subject, subscriber),
          html: personalizedContent,
          campaignType: campaign.type,
          category: campaign.category,
          bounce: primaryDomainAuth ? {
            token: primaryDomainAuth.bounceToken,
            returnPath: require('./domainAuthService').buildBounceAddress(primaryDomainAuth)
          } : undefined
        };
        if (campaign.fromEmail && campaign.fromEmail.includes('@')) {
          domainReputation.recordSend(campaign.fromEmail.split('@')[1]).catch(()=>{});
        }
        return this.processSendEmail({ emailData, campaignId: objectId, subscriberId: subscriber._id });
      });

      await Promise.allSettled(emailPromises);
      processedCount += batch.length;

  logger.info('Batch processed', { campaignId: objectId, processed: processedCount, total: subscribers.length });

      // Small delay between batches
      await this.delay(1000);
    }

    // Update campaign status
    await Campaign.findByIdAndUpdate(objectId, {
      status: 'completed',
      completedAt: new Date(),
      totalEmails: subscribers.length,
      emailsProcessed: processedCount
    });
  }

  /**
   * Personalize content (simplified version)
   */
  personalizeContent(templateStructure, subscriber) {
    // Use template structure if available, otherwise use default HTML
    if (templateStructure && templateStructure.blocks) {
      // TODO: Implement proper template structure processing
      // For now, fallback to simple template
    }
    
    // Simple HTML template as fallback
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Hello ${subscriber.firstName || subscriber.name || 'there'}!</h1>
        <p>This is a test email from EmailXP.</p>
        <p>Your email: ${subscriber.email}</p>
        <hr>
        <small>
          <a href="${process.env.FRONTEND_URL}/unsubscribe?token=${subscriber.unsubscribeToken}">Unsubscribe</a>
        </small>
      </div>
    `;
    
    return html;
  }

  /**
   * Personalize HTML content from campaign
   */
  personalizeHtmlContent(htmlContent, subscriber) {
    if (!htmlContent) {
      return this.personalizeContent(null, subscriber);
    }
    
    // For the simple email queue, we'll do basic personalization
    // In a production environment, you would pass the template structure to apply dynamic content rules
    return htmlContent
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
      .replace(/\{\{email\}\}/g, subscriber.email)
      .replace(/\{\{fullName\}\}/g, `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim() || subscriber.name || 'there');
  }

  /**
   * Personalize dynamic content blocks
   */
  personalizeDynamicContent(htmlContent, subscriber) {
    if (!htmlContent) return htmlContent;
    
    // For now, we'll use a simple approach
    // In a full implementation, we would extract dynamic blocks from the template structure
    // and apply personalization rules
    
    // Simple replacement for common variables
    let result = htmlContent
      .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
      .replace(/\{\{email\}\}/g, subscriber.email || '');
    
    return result;
  }

  /**
   * Personalize subject
   */
  personalizeSubject(subject, subscriber) {
    if (!subject) {
      return 'Email from EmailXP';
    }
    
    return subject
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
      .replace(/\{\{email\}\}/g, subscriber.email)
      .replace(/\{\{fullName\}\}/g, `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim() || subscriber.name || 'there');
  }

  /**
   * Log email activity
   */
  async logEmail(logData) {
    try {
      await EmailLog.create(logData);
    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  /**
   * Get queue stats
   */
  async getQueueStats() {
    return {
      ...this.stats,
      queueLength: this.queue.length,
      processing: this.processing
    };
  }

  /**
   * Cancel scheduled campaign
   */
  async cancelScheduledCampaign(campaignId) {
    // Ensure campaignId is a proper ObjectId
    const objectId = mongoose.Types.ObjectId.isValid(campaignId) 
      ? new mongoose.Types.ObjectId(campaignId) 
      : campaignId;
    
    // Remove from queue if exists
    const jobIndex = this.queue.findIndex(job => 
      job.id === `scheduled-campaign-${objectId}`
    );
    
    if (jobIndex !== -1) {
      this.queue.splice(jobIndex, 1);
      this.stats.waiting--;
    }
    
    await Campaign.findByIdAndUpdate(objectId, {
      status: 'cancelled',
      jobId: null
    });
  }

  /**
   * Clean up invalid campaign references
   */
  async cleanupInvalidCampaign(campaignId) {
    try {
      console.log(`Cleaning up invalid campaign references for: ${campaignId}`);
      
      // Remove any jobs for this campaign from the queue
      const initialLength = this.queue.length;
      this.queue = this.queue.filter(job => {
        const jobCampaignId = job.data?.campaignId;
        if (jobCampaignId && jobCampaignId.toString() === campaignId.toString()) {
          console.log(`Removing invalid job ${job.id} for campaign ${campaignId}`);
          this.stats.waiting = Math.max(0, this.stats.waiting - 1);
          return false;
        }
        return true;
      });
      
      const removedJobs = initialLength - this.queue.length;
      if (removedJobs > 0) {
        console.log(`Removed ${removedJobs} invalid jobs for campaign ${campaignId}`);
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Personalize HTML content with dynamic blocks
   */
  personalizeHtmlContentWithDynamicBlocks(htmlContent, subscriber, dynamicBlocks) {
    if (!htmlContent) {
      return this.personalizeContent(null, subscriber);
    }
    
    // Use the personalization service to handle dynamic content
    const personalizedContent = personalizeDynamicContent(htmlContent, subscriber, dynamicBlocks);
    
    // Apply standard personalization to any remaining merge tags
    return personalizedContent
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
      .replace(/\{\{email\}\}/g, subscriber.email)
      .replace(/\{\{fullName\}\}/g, `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim() || subscriber.name || 'there');
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SimpleEmailQueue();
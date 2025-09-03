// Email queue service using Bull for job processing
const Queue = require('bull');
const mailgunService = require('./mailgunService');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');

class EmailQueueService {
  constructor() {
    try {
      // Try to create email queue with Redis connection
      this.emailQueue = new Queue('email processing', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD || undefined,
        },
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
          attempts: 3, // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second delay
          },
        },
      });

      this.setupProcessors();
      this.setupEventHandlers();
      this.useRedis = true;
      console.log('✅ Email queue initialized with Redis');
    } catch (error) {
      console.warn('⚠️  Redis not available, using simple in-memory queue:', error.message);
      this.useRedis = false;
      this.simpleQueue = require('./simpleEmailQueue');
    }
  }

  /**
   * Setup job processors
   */
  setupProcessors() {
    // Process single email jobs
    this.emailQueue.process('send-email', 10, async (job) => {
      const { emailData, campaignId, subscriberId } = job.data;
      
      try {
        const result = await mailgunService.sendEmail({
          ...emailData,
          campaignId,
          subscriberId
        });

        // Log successful send
        await this.logEmail({
          campaignId,
          subscriberId,
          email: emailData.to,
          status: 'sent',
          messageId: result.messageId,
          sentAt: new Date()
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
          sentAt: new Date()
        });
        
        throw error;
      }
    });

    // Process campaign batch jobs
    this.emailQueue.process('send-campaign', 1, async (job) => {
      const { campaignId } = job.data;
      
      try {
        await this.processCampaign(campaignId, job);
        return { success: true, campaignId };
      } catch (error) {
        console.error(`Campaign ${campaignId} processing failed:`, error);
        throw error;
      }
    });

    // Process scheduled campaigns
    this.emailQueue.process('send-scheduled-campaign', 1, async (job) => {
      const { campaignId } = job.data;
      
      try {
        // Update campaign status to sending
        await Campaign.findByIdAndUpdate(campaignId, { 
          status: 'sending',
          startedAt: new Date()
        });

        await this.processCampaign(campaignId, job);
        
        // Update campaign status to completed
        await Campaign.findByIdAndUpdate(campaignId, { 
          status: 'completed',
          completedAt: new Date()
        });

        return { success: true, campaignId };
      } catch (error) {
        // Update campaign status to failed
        await Campaign.findByIdAndUpdate(campaignId, { 
          status: 'failed',
          error: error.message
        });
        
        throw error;
      }
    });
  }

  /**
   * Setup event handlers for job monitoring
   */
  setupEventHandlers() {
    this.emailQueue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed:`, result);
    });

    this.emailQueue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err.message);
    });

    this.emailQueue.on('stalled', (job) => {
      console.warn(`Job ${job.id} stalled`);
    });
  }

  /**
   * Add single email to queue
   */
  async addEmailToQueue(emailData, campaignId, subscriberId, options = {}) {
    if (!this.useRedis) {
      return await this.simpleQueue.addEmailToQueue(emailData, campaignId, subscriberId, options);
    }

    const job = await this.emailQueue.add('send-email', {
      emailData,
      campaignId,
      subscriberId
    }, {
      delay: options.delay || 0,
      priority: options.priority || 0,
      ...options
    });

    return job.id;
  }

  /**
   * Add campaign to queue
   */
  async addCampaignToQueue(campaignId, options = {}) {
    if (!this.useRedis) {
      return await this.simpleQueue.addCampaignToQueue(campaignId, options);
    }

    const job = await this.emailQueue.add('send-campaign', {
      campaignId
    }, {
      delay: options.delay || 0,
      priority: options.priority || 0,
      ...options
    });

    return job.id;
  }

  /**
   * Schedule campaign for future sending
   */
  async scheduleCampaign(campaignId, scheduledTime) {
    if (!this.useRedis) {
      return await this.simpleQueue.scheduleCampaign(campaignId, scheduledTime);
    }

    const delay = new Date(scheduledTime).getTime() - Date.now();
    
    if (delay <= 0) {
      throw new Error('Scheduled time must be in the future');
    }

    const job = await this.emailQueue.add('send-scheduled-campaign', {
      campaignId
    }, {
      delay,
      jobId: `scheduled-campaign-${campaignId}` // Unique ID for scheduled jobs
    });

    // Update campaign status
    await Campaign.findByIdAndUpdate(campaignId, {
      status: 'scheduled',
      scheduledAt: scheduledTime,
      jobId: job.id
    });

    return job.id;
  }

  /**
   * Process entire campaign
   */
  async processCampaign(campaignId, parentJob) {
    const campaign = await Campaign.findById(campaignId)
      .populate('template')
      .populate('subscribers');

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    let { subscribers, template, subject, fromName, fromEmail } = campaign;

    // Resolve recipients if not pre-populated
    if (!subscribers || !Array.isArray(subscribers) || subscribers.length === 0) {
      const Subscriber = require('../models/Subscriber');
      const mongoose = require('mongoose');
      const userId = campaign.user || campaign.userId || null;

      const idToObjectId = (ids = []) => ids
        .filter(Boolean)
        .map(id => {
          try { return new mongoose.Types.ObjectId(id); } catch { return null; }
        })
        .filter(Boolean);

      const groupIds = idToObjectId(campaign.groups || []);
      const segmentIds = idToObjectId(campaign.segments || []);
      const individualIds = idToObjectId(campaign.individualSubscribers || []);

      // Base filter
      const baseFilter = { user: userId, status: 'subscribed', isDeleted: false };

      // From groups
      let groupSubs = [];
      if (groupIds.length) {
        groupSubs = await Subscriber.find({ ...baseFilter, groups: { $in: groupIds } }, '_id email name location.timezone unsubscribeToken');
      }

      // From segments - basic approach: if you have a segment routine, call it; otherwise fallback to tag/status
      let segmentSubs = [];
      if (segmentIds.length) {
        // TODO: integrate real segment logic if available; fallback pulls all subscribed for now
        segmentSubs = await Subscriber.find(baseFilter, '_id email name location.timezone unsubscribeToken');
      }

      // Individuals
      let individualSubs = [];
      if (individualIds.length) {
        individualSubs = await Subscriber.find({ ...baseFilter, _id: { $in: individualIds } }, '_id email name location.timezone unsubscribeToken');
      }

      // Combine and dedupe by _id
      const map = new Map();
      [...groupSubs, ...segmentSubs, ...individualSubs].forEach(s => map.set(String(s._id), s));
      subscribers = Array.from(map.values());
    }

    const totalSubscribers = subscribers.length;
    let processedCount = 0;

    // Resolve base HTML: prefer template.generateHTML(); fallback to legacy campaign.htmlContent
    let baseHtml = '';
    if (template) {
      try {
        baseHtml = template.generateHTML();
      } catch (e) {
        console.error('Failed to generate HTML from template:', e);
      }
    }
    if (!baseHtml && campaign.htmlContent) {
      baseHtml = campaign.htmlContent;
    }

    // Increment template usage once per campaign send
    if (template && typeof template.incrementUsage === 'function') {
      try { await template.incrementUsage(); } catch (e) { console.warn('Failed to increment template usage:', e.message); }
    }

    // Validate compliance: template must contain footer with unsubscribe
    if (template && typeof template.hasFooterAndUnsubscribe === 'function') {
      if (!template.hasFooterAndUnsubscribe()) {
        throw new Error('Selected template is missing required footer/unsubscribe content.');
      }
    }

    // Process subscribers in batches
    const batchSize = 100;
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      
      // Create email jobs for batch
      const emailJobs = batch.map(subscriber => {
        const personalizedContent = this.personalizeHtml(baseHtml, subscriber);
        
        return this.addEmailToQueue({
          to: subscriber.email,
          from: `${fromName} <${fromEmail}>`,
          subject: this.personalizeSubject(subject, subscriber),
          html: personalizedContent,
          campaignId,
          subscriberId: subscriber._id,
          campaignType: campaign.type,
          category: campaign.category
        }, campaignId, subscriber._id);
      });

      await Promise.all(emailJobs);
      processedCount += batch.length;

      // Update parent job progress
      if (parentJob) {
        const progress = Math.round((processedCount / totalSubscribers) * 100);
        parentJob.progress(progress);
      }

      // Rate limiting between batches
      if (i + batchSize < subscribers.length) {
        await this.delay(1000); // 1 second between batches
      }
    }

    // Update campaign statistics
    await Campaign.findByIdAndUpdate(campaignId, {
      totalEmails: totalSubscribers,
      emailsQueued: totalSubscribers
    });
  }

  /**
   * Personalize already-generated HTML with merge tags
   */
  personalizeHtml(baseHtml, subscriber) {
    if (!baseHtml) return '';
    const fullName = `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim() || 'there';
    const unsubscribeUrl = `${process.env.FRONTEND_URL}/unsubscribe?token=${subscriber.unsubscribeToken}`;

    return baseHtml
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || 'there')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{fullName\}\}/g, fullName)
      .replace(/\{\{email\}\}/g, subscriber.email)
      .replace(/\{\{unsubscribeUrl\}\}/g, unsubscribeUrl);
  }

  /**
   * Personalize email subject
   */
  personalizeSubject(subject, subscriber) {
    return subject
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || 'there')
      .replace(/\{\{lastName\}\}/g, subscriber.lastName || '')
      .replace(/\{\{fullName\}\}/g, `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim() || 'there');
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
   * Get queue statistics
   */
  async getQueueStats() {
    if (!this.useRedis) {
      return await this.simpleQueue.getQueueStats();
    }

    const waiting = await this.emailQueue.getWaiting();
    const active = await this.emailQueue.getActive();
    const completed = await this.emailQueue.getCompleted();
    const failed = await this.emailQueue.getFailed();
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }

  /**
   * Cancel scheduled campaign
   */
  async cancelScheduledCampaign(campaignId) {
    if (!this.useRedis) {
      return await this.simpleQueue.cancelScheduledCampaign(campaignId);
    }

    const campaign = await Campaign.findById(campaignId);
    
    if (campaign && campaign.jobId) {
      const job = await this.emailQueue.getJob(campaign.jobId);
      if (job) {
        await job.remove();
      }
      
      await Campaign.findByIdAndUpdate(campaignId, {
        status: 'cancelled',
        jobId: null
      });
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new EmailQueueService();
// Email queue service using Bull for job processing
const Queue = require('bull');
const emailService = require('./emailService');
const suppressionService = require('./suppressionService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');

class EmailQueueService {
  constructor() {
    // Check if Redis is configured via environment variables
    const redisConfigured = process.env.REDIS_HOST || process.env.REDIS_URL;
    
    if (!redisConfigured) {
      console.log('📝 Redis not configured, using simple in-memory queue');
      this.useRedis = false;
      this.initializeSimpleQueue();
      return;
    }

    try {
      // Try to create email queue with Redis connection
      this.emailQueue = new Queue('email processing', {
        redis: {
          port: process.env.REDIS_PORT || 6379,
          host: process.env.REDIS_HOST || 'localhost',
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 3, // Limit retries to prevent infinite hanging
          retryDelayOnFailover: 100,
          lazyConnect: false, // Connect immediately
          connectTimeout: 5000, // 5 second timeout
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

      console.log('📋 Created Redis queue, testing connection...');
      
      // Test Redis connection
      this.emailQueue.client.ping().then(() => {
        console.log('✅ Redis ping successful, setting up processors...');
        this.setupProcessors();
        this.setupEventHandlers();
        this.useRedis = true;
        console.log('✅ Email queue initialized with Redis');
        
        // Test job processing (only in non-production environments)
        if (process.env.NODE_ENV !== 'production') {
          setTimeout(() => {
            console.log('🧪 Testing job processing with a simple test job...');
            this.emailQueue.add('send-campaign', { campaignId: 'test-campaign-id', test: true })
              .then(job => console.log(`🧪 Test job added with ID: ${job.id}`))
              .catch(err => console.error('🧪 Test job failed:', err));
          }, 2000);
        }
      }).catch((error) => {
        console.warn('⚠️  Redis connection failed, falling back to simple queue:', error.message);
        this.useRedis = false;
        this.initializeSimpleQueue();
      });
      
    } catch (error) {
      console.warn('⚠️  Redis not available, using simple in-memory queue:', error.message);
      this.useRedis = false;
      this.initializeSimpleQueue();
    }
  }

  /**
   * Initialize simple queue fallback
   */
  initializeSimpleQueue() {
    if (!this.simpleQueue) {
      this.simpleQueue = require('./simpleEmailQueue');
      console.log('✅ Simple email queue initialized (no Redis)');
    }
  }

  /**
   * Setup job processors
   */
  setupProcessors() {
    if (!this.emailQueue) {
      console.log('Email queue not available, skipping processor setup');
      return;
    }

    console.log('📋 Setting up Redis job processors...');
    
    // Process single email jobs
    this.emailQueue.process('send-email', 10, async (job) => {
      console.log(`📧 Processing send-email job: ${job.id}`);
      
      try {
        const { emailData, campaignId, subscriberId } = job.data;
        const idempotencyKey = crypto.createHash('sha256').update(`${campaignId}:${subscriberId}:${emailData.subject || ''}`).digest('hex');
        const existing = await EmailLog.findOne({ idempotencyKey });
        if (existing) {
          console.log(`⏭️ Duplicate send prevented for ${emailData.to}`);
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
          idempotencyKey,
          sentAt: new Date()
        });

        console.log(`✅ Email sent successfully to ${emailData.to}`);
        return result;
      } catch (error) {
        console.error(`❌ Send-email job ${job.id} failed:`, error);
        
        // Log failed send
        const { emailData, campaignId, subscriberId } = job.data;
        await this.logEmail({
          campaignId,
          subscriberId,
          email: emailData?.to,
          status: 'failed',
          error: error.message,
          idempotencyKey: crypto.createHash('sha256').update(`${campaignId}:${subscriberId}:${emailData?.subject || ''}`).digest('hex'),
          sentAt: new Date()
        });
        
        throw error;
      }
    });

    // Process campaign batch jobs
    this.emailQueue.process('send-campaign', 1, async (job) => {
      console.log(`⚙️ PROCESSOR CALLED: Processing campaign job: ${job.id}, data:`, job.data);
      
      try {
        console.log(`🚀 About to call processCampaign for campaign: ${job.data.campaignId}`);
        await this.processCampaign(job.data.campaignId, job);
        console.log(`✅ Campaign job ${job.id} completed successfully`);
        return { success: true, campaignId: job.data.campaignId };
      } catch (error) {
        console.error(`❌ Campaign job ${job.id} failed:`, error);
        throw error;
      }
    });

    // Process scheduled campaigns
    this.emailQueue.process('send-scheduled-campaign', 1, async (job) => {
      console.log(`📅 Processing scheduled campaign job: ${job.id}`);
      
      try {
        await this.processScheduledCampaign(job.data.campaignId, job);
        return { success: true, campaignId: job.data.campaignId };
      } catch (error) {
        console.error(`❌ Scheduled campaign job ${job.id} failed:`, error);
        throw error;
      }
    });

    console.log('✅ Redis job processors setup complete');
  }

  /**
   * Setup event handlers for job monitoring
   */
  setupEventHandlers() {
    console.log('📋 Setting up Redis event handlers...');
    
    this.emailQueue.on('completed', (job, result) => {
      console.log(`✅ Job completed: ${job.id} (${job.name})`, result);
    });

    this.emailQueue.on('failed', (job, err) => {
      console.error(`❌ Job failed: ${job.id} (${job.name})`, err.message);
    });

    this.emailQueue.on('stalled', (job) => {
      console.warn(`⚠️ Job stalled: ${job.id} (${job.name})`);
    });

    this.emailQueue.on('waiting', (jobId) => {
      console.log(`⏳ Job waiting: ${jobId}`);
    });

    this.emailQueue.on('active', (job) => {
      console.log(`▶️ Job active: ${job.id} (${job.name})`);
    });

    console.log('✅ Redis event handlers setup complete');
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
    // Always use simple queue if Redis is not available or not ready
    if (!this.useRedis || !this.emailQueue) {
      console.log('Using simple queue for campaign:', campaignId);
      this.initializeSimpleQueue();
      return await this.simpleQueue.addCampaignToQueue(campaignId, options);
    }

    try {
      const job = await this.emailQueue.add('send-campaign', {
        campaignId
      }, {
        delay: options.delay || 0,
        priority: options.priority || 0,
        ...options
      });

      return job.id;
    } catch (error) {
      console.warn('Redis queue failed, falling back to simple queue:', error.message);
      this.useRedis = false;
      this.initializeSimpleQueue();
      return await this.simpleQueue.addCampaignToQueue(campaignId, options);
    }
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
    console.log(`🚀 Starting campaign processing for campaign: ${campaignId}`);
    const mongoose = require('mongoose');

    // Validate campaignId before querying to avoid CastErrors
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      console.warn(`Invalid campaignId received, skipping processing: ${campaignId}`);
      return;
    }

    const campaign = await Campaign.findById(campaignId)
      .populate('template')
      .populate('individualSubscribers')
      .populate('groups')
      .populate('segments')
      .populate({
        path: 'user',
        populate: {
          path: 'organization'
        }
      });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    console.log(`📊 Campaign loaded:`, {
      name: campaign.name,
      hasIndividualSubscribers: !!(campaign.individualSubscribers && campaign.individualSubscribers.length),
      individualSubscribersCount: campaign.individualSubscribers ? campaign.individualSubscribers.length : 0,
      hasGroups: !!(campaign.groups && campaign.groups.length),
      groupsCount: campaign.groups ? campaign.groups.length : 0,
      hasSegments: !!(campaign.segments && campaign.segments.length),
      segmentsCount: campaign.segments ? campaign.segments.length : 0
    });

    let { individualSubscribers, template, subject, fromName, fromEmail } = campaign;
    let subscribers = individualSubscribers || [];

    console.log(`👥 Initial subscribers from individualSubscribers: ${subscribers.length}`);

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

    console.log(`👥 Final subscribers after fetching: ${subscribers.length}`);
    if (subscribers.length > 0) {
      console.log(`📧 Sample subscriber emails: ${subscribers.slice(0, 3).map(s => s.email).join(', ')}`);
    }

    // Preference category filtering
    if (campaign.preferenceCategory) {
      const catId = String(campaign.preferenceCategory);
      subscribers = subscribers.filter(s => {
        if (!s.unsubscribedCategories) return true;
        return !s.unsubscribedCategories.map(id => String(id)).includes(catId);
      });
    }

    const allEmails = subscribers.map(s => s.email.toLowerCase());
    const { suppressed } = await suppressionService.bulkFilter(allEmails, campaign.organization || null);
    if (suppressed.size) {
      subscribers = subscribers.filter(s => !suppressed.has(s.email.toLowerCase()));
  logger.info('Suppression applied', { campaignId, skipped: allEmails.length - subscribers.length });
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
    console.log(`📤 Starting to send emails to ${subscribers.length} subscribers in batches of ${batchSize}`);
    
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1} with ${batch.length} subscribers`);
      
      // Create email jobs for batch
      const emailJobs = batch.map(subscriber => {
        if (subscriber.status && subscriber.status !== 'subscribed') {
          console.log(`⏭️ Skipping subscriber ${subscriber.email} - status: ${subscriber.status}`);
          return null;
        }
        const personalizedContent = this.personalizeHtml(baseHtml, subscriber);
        
        return this.addEmailToQueue({
          to: subscriber.email, // Send to actual subscriber email
          from: fromEmail || 'onboarding@resend.dev', // Use campaign's fromEmail or fallback to Resend verified sender
          fromName: fromName, // Include the fromName
          subject: this.personalizeSubject(subject, subscriber),
          html: personalizedContent,
          campaignId,
          subscriberId: subscriber._id,
          campaignType: campaign.type,
          category: campaign.category,
          organizationId: campaign.organization || campaign.user.organization
        }, campaignId, subscriber._id);
      });

      await Promise.all(emailJobs.filter(Boolean));
      console.log(`✅ Queued ${emailJobs.filter(Boolean).length} emails for batch ${Math.floor(i / batchSize) + 1}`);
      
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
      status: 'sent',
      totalRecipients: totalSubscribers,
      sentAt: new Date()
    });

    console.log(`🎉 Campaign ${campaignId} processing completed. Total emails queued: ${totalSubscribers}`);
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
   * Add campaign to queue for processing
   */
  async addCampaignToQueue(campaignId) {
    console.log(`📋 addCampaignToQueue called for campaign: ${campaignId}, usingRedis: ${this.useRedis}`);
    
    if (!this.useRedis) {
      console.log(`📋 Using simple queue for campaign: ${campaignId}`);
      return await this.simpleQueue.addCampaignToQueue(campaignId);
    }

    // For Redis, add the campaign to the queue for processing
    console.log(`📋 Adding campaign ${campaignId} to Redis queue with job name 'send-campaign'`);
    const job = await this.emailQueue.add('send-campaign', {
      campaignId: campaignId
    });
    
    console.log(`📋 Campaign ${campaignId} added to Redis queue with job ID: ${job.id}`);
    return job.id;
  }

  /**
   * Get all subscribers for a campaign
   */
  async getCampaignSubscribers(campaign) {
    const Subscriber = require('../models/Subscriber');
    let subscribers = campaign.individualSubscribers || [];
    
    // If no individual subscribers, get from groups and segments
    if (subscribers.length === 0) {
      const allSubscribers = new Set();
      
      // Get subscribers from groups
      if (campaign.groups && campaign.groups.length > 0) {
        const groupIds = campaign.groups.map(g => g._id || g);
        const groupSubscribers = await Subscriber.find({
          groups: { $in: groupIds },
          status: 'subscribed'
        });
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
        subscribers = await Subscriber.find({
          _id: { $in: Array.from(allSubscribers) },
          status: 'subscribed'
        });
      }
    }

    // Suppression filtering
    const allEmails = subscribers.map(s => s.email.toLowerCase());
    const { suppressed } = await suppressionService.bulkFilter(allEmails, campaign.organization || null);
    if (suppressed.size) {
      subscribers = subscribers.filter(s => !suppressed.has(s.email.toLowerCase()));
    }

    return subscribers;
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
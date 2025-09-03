// Simple in-memory email queue (fallback when Redis is not available)
const emailService = require('./emailService');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');

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
    
    if (!this.processing) {
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

    const job = {
      id: `scheduled-campaign-${campaignId}`,
      type: 'send-scheduled-campaign',
      data: { campaignId },
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
    await Campaign.findByIdAndUpdate(campaignId, {
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
      return;
    }

    this.processing = true;
    console.log(`Processing email queue: ${this.queue.length} jobs waiting`);

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.stats.waiting--;
      this.stats.active++;

      try {
        await this.processJob(job);
        this.stats.active--;
        this.stats.completed++;
        console.log(`Job ${job.id} completed successfully`);
      } catch (error) {
        this.stats.active--;
        this.stats.failed++;
        console.error(`Job ${job.id} failed:`, error.message);
      }

      // Small delay between jobs to prevent overwhelming
      await this.delay(100);
    }

    this.processing = false;
    console.log('Email queue processing completed');
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
      const result = await emailService.sendEmail({
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
  }

  /**
   * Process campaign
   */
  async processCampaign(campaignId) {
    const campaign = await Campaign.findById(campaignId)
      .populate('template')
      .populate('subscribers');

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Update campaign status
    await Campaign.findByIdAndUpdate(campaignId, { 
      status: 'sending',
      startedAt: new Date()
    });

    const { subscribers, template, subject, fromName, fromEmail } = campaign;
    let processedCount = 0;

    // Process subscribers in batches
    const batchSize = 10; // Smaller batches for simple queue
    for (let i = 0; i < subscribers.length; i += batchSize) {
      const batch = subscribers.slice(i, i + batchSize);
      
      // Process batch
      const emailPromises = batch.map(subscriber => {
        const personalizedContent = this.personalizeContent(template.structure, subscriber);
        
        return this.processSendEmail({
          emailData: {
            to: subscriber.email,
            from: `${fromName} <${fromEmail}>`,
            subject: this.personalizeSubject(subject, subscriber),
            html: personalizedContent,
            campaignType: campaign.type,
            category: campaign.category
          },
          campaignId,
          subscriberId: subscriber._id
        });
      });

      await Promise.allSettled(emailPromises);
      processedCount += batch.length;

      console.log(`Processed ${processedCount}/${subscribers.length} emails for campaign ${campaignId}`);

      // Small delay between batches
      await this.delay(1000);
    }

    // Update campaign status
    await Campaign.findByIdAndUpdate(campaignId, {
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
    // Simple HTML template
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Hello ${subscriber.firstName || 'there'}!</h1>
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
   * Personalize subject
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
    // Remove from queue if exists
    const jobIndex = this.queue.findIndex(job => 
      job.id === `scheduled-campaign-${campaignId}`
    );
    
    if (jobIndex !== -1) {
      this.queue.splice(jobIndex, 1);
      this.stats.waiting--;
    }
    
    await Campaign.findByIdAndUpdate(campaignId, {
      status: 'cancelled',
      jobId: null
    });
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SimpleEmailQueue();
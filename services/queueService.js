// emailxp/backend/services/queueService.js

const Queue = require('bull');
const resendUtil = require('../utils/resendEmailService');
const logger = require('../utils/logger');

// Basic redis connection configuration (avoid advanced options that Bull forbids on bclient/subscriber)
const baseRedis = {
  port: Number(process.env.REDIS_PORT) || 6379,
  host: process.env.REDIS_HOST || 'localhost',
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0
};
if (process.env.REDIS_TLS_ENABLED === 'true') {
  baseRedis.tls = {}; // minimal TLS enable
}
const redisConfig = { redis: baseRedis };

// Create email queue with rate limiting & optional limiter
const queuePrefix = process.env.QUEUE_PREFIX || undefined;
const queueOptions = queuePrefix ? { ...redisConfig, prefix: queuePrefix } : redisConfig;
const emailQueue = new Queue('email sending', queueOptions);

// Configure queue settings
// (settings largely provided via constructor above; keep override for clarity)
emailQueue.settings.stalledInterval = 30 * 1000;
emailQueue.settings.maxStalledCount = 1;

// Rate limiting: 100 emails per minute (adjust based on your email provider limits)
const RATE_LIMIT = {
  max: 100, // Maximum jobs per duration
  duration: 60 * 1000, // 1 minute in milliseconds
};

/**
 * Process email sending jobs
 */
emailQueue.process('send-email', 10, async (job) => {
  const { 
    toEmail, 
    subject, 
    htmlContent, 
    plainTextContent, 
    campaignId, 
    subscriberId, 
    groupId, 
    fromEmail, 
    automationId,
    templateId,
    actionId,
    templateDisableAutoFooter,
    fromName 
  } = job.data;

  logger.log(`[QueueService] Processing email job`, { toEmail, campaignId });
  try { console.log(`[QueueService] Processing email job`, { toEmail, campaignId, jobId: job.id }); } catch (e) { /* ignore */ }

  try {
    const result = await resendUtil.sendEmail({
      to: toEmail,
      subject,
      html: htmlContent,
      text: plainTextContent,
        campaignId,
      subscriberId,
        automationId,
        templateId,
        templateDisableAutoFooter,
        actionId,
      from: fromEmail,
      fromName
    });

    if (result && result.success) {
  logger.log(`[QueueService] Email sent successfully`, { toEmail });
  try { console.log(`[QueueService] Email sent successfully`, { toEmail, messageId: result.messageId }); } catch (e) { /* ignore */ }
      return { success: true, result };
    } else {
      throw new Error(result?.message || 'Email sending failed');
    }
  } catch (error) {
  logger.error(`[QueueService] Email job failed`, { toEmail, error: error.message });
    throw error; // This will trigger Bull's retry mechanism
  }
});

/**
 * Process campaign batch sending jobs
 */
emailQueue.process('send-campaign-batch', 5, async (job) => {
  const { campaignId, subscribers, timezone } = job.data;
  
  logger.log(`[QueueService] Processing campaign batch`, { batchSize: subscribers.length, timezone });

  const results = [];
  
  for (const subscriber of subscribers) {
    try {
      // Add individual email jobs with rate limiting
      const emailJob = await addEmailJob({
        toEmail: subscriber.email, // Send to actual subscriber email
        subject: job.data.subject,
        htmlContent: job.data.htmlContent,
        plainTextContent: job.data.plainTextContent,
        campaignId,
        subscriberId: subscriber._id,
        groupId: job.data.groupId,
  fromEmail: process.env.EMAIL_FROM || 'onboarding@resend.dev', // Use configured EMAIL_FROM if available
        fromName: 'EmailXP',
        // propagate template/action when campaign batch originates from an automation or template
        templateId: job.data.templateId || null,
        templateDisableAutoFooter: job.data.templateDisableAutoFooter || false,
        actionId: job.data.actionId || null,
      }, {
        delay: 0, // No delay for batch processing
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      results.push({ subscriberId: subscriber._id, jobId: emailJob.id, status: 'queued' });
    } catch (error) {
      logger.error(`[QueueService] Failed to queue email for ${subscriber.email}:`, error);
      results.push({ subscriberId: subscriber._id, status: 'failed', error: error.message });
    }
  }

  return { campaignId, timezone, results };
});

/**
 * Add an email job to the queue
 */
const addEmailJob = async (emailData, options = {}) => {
  const defaultOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
  };

  const jobOptions = { ...defaultOptions, ...options };

  try {
    try { console.log('[QueueService] attempting to add job to queue', { toEmail: emailData.toEmail }); } catch (e) { /* ignore */ }

    // Wrap add in a short timeout so we don't hang indefinitely if Redis/Bull is unreachable
    const addPromise = emailQueue.add('send-email', emailData, jobOptions);
  const timeoutMs = Number(process.env.QUEUE_ADD_TIMEOUT_MS || 5000);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('queue-add-timeout')), timeoutMs));

    const job = await Promise.race([addPromise, timeoutPromise]);

    logger.log(`[QueueService] Email job added to queue: ${job.id}`);
  try { console.log(`[QueueService] Email job added to queue: ${job.id}`, { toEmail: emailData.toEmail, subscriberId: emailData.subscriberId, automationId: emailData.automationId, templateId: emailData.templateId, actionId: emailData.actionId }); } catch (e) { /* ignore */ }
  try { console.log('[QueueService] EMAIL_JOB_QUEUED', { jobId: job.id, toEmail: emailData.toEmail, automationId: emailData.automationId, templateId: emailData.templateId, actionId: emailData.actionId }); } catch (e) { /* ignore */ }
    return job;
  } catch (error) {
    // If the queue is unavailable (Redis down or Bull error) or the add timed out, fall back to sending inline
    logger.error('[QueueService] Failed to add email job to queue or timed out:', { error: error && (error.message || error) });
    try {
      console.log('[QueueService] Queue add failed/timed out, falling back to inline send for', { toEmail: emailData.toEmail, subscriberId: emailData.subscriberId, automationId: emailData.automationId, templateId: emailData.templateId, actionId: emailData.actionId });
    } catch (e) { /* ignore */ }

    try {
      const result = await resendUtil.sendEmail({
        to: emailData.toEmail,
        subject: emailData.subject,
        html: emailData.htmlContent,
        text: emailData.plainTextContent,
        campaignId: emailData.campaignId,
        subscriberId: emailData.subscriberId,
        automationId: emailData.automationId,
        templateId: emailData.templateId,
        templateDisableAutoFooter: emailData.templateDisableAutoFooter || false,
        actionId: emailData.actionId,
        from: emailData.fromEmail,
        fromName: emailData.fromName
      });

      // Resend SDK returns an object with an `id` when successful.
      // Our EmailService fallback may return { success: true, messageId }.
      const messageId = result?.id || result?.messageId || (result && result.data && result.data.id) || null;
      const succeeded = (result && result.success === true) || !!messageId;

      if (succeeded) {
        logger.log('[QueueService] Inline send succeeded (fallback from queue add)', { toEmail: emailData.toEmail });
        try { console.log('[QueueService] Inline send succeeded', { toEmail: emailData.toEmail, messageId }); } catch (e) { /* ignore */ }
        try { console.log('[QueueService] EMAIL_SENT_INLINE', { toEmail: emailData.toEmail, messageId, automationId: emailData.automationId, templateId: emailData.templateId, actionId: emailData.actionId }); } catch (e) { /* ignore */ }
        // Return a lightweight object so callers that expect job.id won't crash
        return { id: messageId ? messageId : `inline-send-${Date.now()}`, inline: true, result };
      } else {
        logger.error('[QueueService] Inline send failed after queue add failure', { toEmail: emailData.toEmail, result: result });
        throw new Error(result && result.message ? result.message : 'Inline send failed after queue add failure');
      }
    } catch (sendErr) {
      logger.error('[QueueService] Fallback inline send also failed', { error: sendErr && (sendErr.message || sendErr) });
      throw sendErr;
    }
  }
};

/**
 * Add a campaign batch job to the queue
 */
const addCampaignBatchJob = async (batchData, options = {}) => {
  const defaultOptions = {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
    removeOnComplete: 50,
    removeOnFail: 25,
  };

  const jobOptions = { ...defaultOptions, ...options };

  try {
    const job = await emailQueue.add('send-campaign-batch', batchData, jobOptions);
    logger.log(`[QueueService] Campaign batch job added to queue: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('[QueueService] Failed to add campaign batch job to queue:', error);
    throw error;
  }
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  try {
    const waiting = await emailQueue.getWaiting();
    const active = await emailQueue.getActive();
    const completed = await emailQueue.getCompleted();
    const failed = await emailQueue.getFailed();
    const delayed = await emailQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  } catch (error) {
    logger.error('[QueueService] Failed to get queue stats:', error);
    return null;
  }
};

/**
 * Clean up old jobs
 */
const cleanQueue = async () => {
  try {
    await emailQueue.clean(24 * 60 * 60 * 1000, 'completed'); // Remove completed jobs older than 24 hours
    await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Remove failed jobs older than 7 days
    logger.log('[QueueService] Queue cleanup completed');
  } catch (error) {
    logger.error('[QueueService] Queue cleanup failed:', error);
  }
};

/**
 * Pause the queue
 */
const pauseQueue = async () => {
  await emailQueue.pause();
  logger.log('[QueueService] Queue paused');
};

/**
 * Resume the queue
 */
const resumeQueue = async () => {
  await emailQueue.resume();
  logger.log('[QueueService] Queue resumed');
};

/**
 * Event listeners for monitoring
 */
emailQueue.on('completed', (job, result) => {
  logger.log(`[QueueService] Job ${job.id} completed successfully`);
});

emailQueue.on('failed', (job, err) => {
  logger.error(`[QueueService] Job ${job.id} failed:`, err);
});

emailQueue.on('stalled', (job) => {
  logger.warn(`[QueueService] Job ${job.id} stalled`);
});

// Clean queue periodically (every hour)
setInterval(cleanQueue, 60 * 60 * 1000);

module.exports = {
  emailQueue,
  addEmailJob,
  addCampaignBatchJob,
  getQueueStats,
  cleanQueue,
  pauseQueue,
  resumeQueue,
};

// Startup check: verify Redis/Bull connectivity by fetching job counts
(async function checkQueueConnectivity() {
  try {
    const counts = await emailQueue.getJobCounts();
    logger.log('[QueueService] Redis/Bull connectivity OK', { counts });
    try { console.log('[QueueService] Redis/Bull connectivity OK', { counts }); } catch (e) { /* ignore */ }
  } catch (err) {
    logger.error('[QueueService] Redis/Bull connectivity check failed', { error: err && (err.message || err) });
    try { console.log('[QueueService] Redis/Bull connectivity check failed', { error: err && (err.message || err) }); } catch (e) { /* ignore */ }
  }
})();
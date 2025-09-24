// emailxp/backend/services/queueServiceWrapper.js

const simpleEmailQueue = require('./simpleEmailQueue');
const logger = require('../utils/logger');

// Try to initialize the Redis-based queue service
let queueService;
let useRedis = false;
let lastError = null;
let initializedAt = new Date();

try {
  // Try to require and initialize the Redis-based queue service
  const redisQueueService = require('./queueService');
  queueService = redisQueueService;
  useRedis = true;
  console.log('✅ Redis-based queue service initialized successfully');
  lastError = null;
} catch (error) {
  lastError = error.message;
  console.warn('⚠️  Redis-based queue service not available, falling back to simple email queue', { error: error.message });
  console.warn('⚠️  To use Redis-based queue, ensure Redis is reachable and credentials are correct');
  queueService = null;
  useRedis = false;
}

/**
 * Add an email job to the queue
 */
const addEmailJob = async (emailData, options = {}) => {
  if (useRedis && queueService) {
    try {
      return await queueService.addEmailJob(emailData, options);
    } catch (error) {
      lastError = error.message;
      logger.error('[QueueServiceWrapper] Failed to add email job to Redis queue, falling back to simple queue', { error: error.message });
      // Fall back to simple email queue
    }
  }
  
  // Use simple email queue as fallback
  return await simpleEmailQueue.addEmailToQueue(
    emailData, 
    emailData.campaignId, 
    emailData.subscriberId, 
    options
  );
};

/**
 * Add a campaign batch job to the queue
 */
const addCampaignBatchJob = async (batchData, options = {}) => {
  if (useRedis && queueService) {
    try {
      return await queueService.addCampaignBatchJob(batchData, options);
    } catch (error) {
      lastError = error.message;
      logger.error('[QueueServiceWrapper] Failed to add campaign batch job to Redis queue, falling back to simple queue', { error: error.message });
      // Fall back to simple email queue
    }
  }
  
  // Use simple email queue as fallback
  return await simpleEmailQueue.addCampaignToQueue(batchData.campaignId, options);
};

/**
 * Get queue statistics
 */
const getQueueStats = async () => {
  if (useRedis && queueService) {
    try {
      return await queueService.getQueueStats();
    } catch (error) {
      lastError = error.message;
      logger.error('[QueueServiceWrapper] Failed to get Redis queue stats, falling back to simple queue', { error: error.message });
    }
  }
  
  // Use simple email queue stats as fallback
  return await simpleEmailQueue.getQueueStats();
};

function getQueueMode() {
  return {
    mode: useRedis ? 'redis' : 'simple',
    lastError,
    initializedAt,
    timestamp: new Date()
  };
}

module.exports = {
  addEmailJob,
  addCampaignBatchJob,
  getQueueStats,
  useRedis,
  getQueueMode
};
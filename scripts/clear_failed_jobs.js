// Clears failed send-campaign jobs from the Bull queue (connects to Redis using backend/.env)
require('dotenv').config({ path: __dirname + '/../.env' });
const Queue = require('bull');

const redisOptions = {
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  host: process.env.REDIS_HOST || '127.0.0.1',
  password: process.env.REDIS_PASSWORD || undefined,
};
if (String(process.env.REDIS_TLS_ENABLED).toLowerCase() === 'true') {
  redisOptions.tls = {};
}

const queueName = process.env.EMAIL_QUEUE_NAME || 'email processing';
const q = new Queue(queueName, { redis: redisOptions });

function isValidObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

async function clearFailed() {
  console.log('Connecting to queue:', queueName, 'with host', redisOptions.host, 'port', redisOptions.port);
  try {
    const failed = await q.getFailed();
    console.log('Found failed jobs count:', failed.length);
    let removed = 0;
    for (const job of failed) {
      try {
        const data = job.data || {};
        // remove test jobs or jobs with invalid campaignId
        if (job.name === 'send-campaign' && (data.test === true || !isValidObjectId(data.campaignId))) {
          console.log('Removing job', job.id, 'name', job.name, 'data', data);
          await job.remove();
          removed++;
        }
      } catch (err) {
        console.warn('Failed to remove job', job.id, err.message || err);
      }
    }
    console.log(`Removed ${removed} failed jobs`);
  } catch (err) {
    console.error('Error reading failed jobs:', err.message || err);
  } finally {
    try { await q.close(); } catch (e) {}
    process.exit(0);
  }
}

clearFailed();

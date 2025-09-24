// Simple Redis connection check utility
const Redis = require('ioredis');

const checkRedisConnection = async () => {
  try {
    const redis = new Redis({
      port: process.env.REDIS_PORT || 6379,
      host: process.env.REDIS_HOST || 'localhost',
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      retryDelayOnFailover: 100,
      lazyConnect: true,
      connectTimeout: 2000, // 2 second timeout
    });

    await redis.ping();
    console.log('✅ Redis connection successful');
    await redis.disconnect();
    return true;
  } catch (error) {
    console.log('❌ Redis connection failed:', error.message);
    console.log('📝 Campaign emails will be sent directly without queue (may be slower)');
    return false;
  }
};

module.exports = { checkRedisConnection };
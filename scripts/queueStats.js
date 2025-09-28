const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('../config/db');
const { getQueueStats } = require('../services/queueService');

(async () => {
  try {
    await connectDB();
    const stats = await getQueueStats();
    console.log('Queue stats:', stats);
    process.exit(0);
  } catch (err) {
    console.error('Failed to get queue stats:', err.message);
    process.exit(1);
  }
})();

const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('../config/db');

(async () => {
  try {
    await connectDB();
    const EmailTracking = require('../models/EmailTracking');
    const recent = await EmailTracking.find().sort({ createdAt: -1 }).limit(10).lean();
    console.log('Recent EmailTracking count (limit 10):', recent.length);
    recent.forEach(r => console.log({ id: r._id.toString(), email: r.emailAddress, status: r.status, createdAt: r.createdAt }));
    process.exit(0);
  } catch (err) {
    console.error('Failed to query EmailTracking:', err.message);
    process.exit(1);
  }
})();

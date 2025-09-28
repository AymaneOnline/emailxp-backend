const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('../config/db');

(async () => {
  try {
    await connectDB();
    const EmailTracking = require('../models/EmailTracking');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await EmailTracking.find({ emailAddress: 'draymane9000@gmail.com', createdAt: { $gte: since } }).sort({ createdAt: -1 }).lean();
    console.log('Found:', rows.length);
    rows.forEach(r => console.log({ id: r._id.toString(), email: r.emailAddress, status: r.status, createdAt: r.createdAt }));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

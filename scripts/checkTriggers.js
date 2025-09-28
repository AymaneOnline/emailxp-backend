// Quick script to check ENABLE_AUTOMATION_ON_SUBSCRIBE and list trigger CampaignSchedules
const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');
const path = require('path');

async function main() {
  console.log('ENABLE_AUTOMATION_ON_SUBSCRIBE =', process.env.ENABLE_AUTOMATION_ON_SUBSCRIBE);
  console.log('MONGO_URI =', process.env.MONGO_URI ? 'present' : 'missing');

  // Try to load DB connection helper
  try {
    const connectDB = require('../config/db');
    await connectDB();
  } catch (e) {
    console.error('Failed to run connectDB:', e.message);
    // fallback: try direct mongoose connect
    const uri = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
    if (!uri) {
      console.error('Mongo URI not found in env');
      process.exit(1);
    }
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  }

  const CampaignSchedule = require('../models/CampaignSchedule');

  const matches = await CampaignSchedule.find({
    scheduleType: 'trigger',
    'triggers.event': 'subscriber_added',
    status: 'running',
    isActive: true
  }).lean();

  console.log('Found trigger schedules count:', matches.length);
  matches.forEach(s => console.log({ id: s._id.toString(), name: s.name, triggers: s.triggers }));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

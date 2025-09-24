// Migration: Rename executions[].errors -> executions[].errorMessages in CampaignSchedule
// Usage: node scripts/migrateCampaignScheduleErrors.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CampaignSchedule = require('../models/CampaignSchedule');

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/emailxp';
  await mongoose.connect(mongoUri, { maxPoolSize: 5 });
  console.log('Connected to MongoDB');

  const cursor = CampaignSchedule.find({ 'executions.errors': { $exists: true, $ne: [] } }).cursor();
  let processed = 0;
  for await (const doc of cursor) {
    let modified = false;
    doc.executions = doc.executions.map(exec => {
      if (exec.errors && Array.isArray(exec.errors)) {
        // If errorMessages already exists keep union
        const merged = Array.from(new Set([...(exec.errorMessages || []), ...exec.errors]));
        const { errors, ...rest } = exec.toObject();
        modified = true;
        return { ...rest, errorMessages: merged };
      }
      return exec;
    });
    if (modified) {
      await CampaignSchedule.updateOne({ _id: doc._id }, { $set: { executions: doc.executions } });
      processed += 1;
    }
  }

  console.log(`Migration complete. Updated documents: ${processed}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});

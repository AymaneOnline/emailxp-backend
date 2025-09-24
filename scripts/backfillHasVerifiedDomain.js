// emailxp/backend/scripts/backfillHasVerifiedDomain.js
// Usage: NODE_ENV=production node scripts/backfillHasVerifiedDomain.js
// Ensures users with at least one fully verified domain have hasVerifiedDomain=true

require('dotenv').config();
const mongoose = require('mongoose');
const DomainAuthentication = require('../models/DomainAuthentication');
const User = require('../models/User');
const logger = require('../utils/logger');

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailxp';
  await mongoose.connect(uri);
  logger.info('Connected to MongoDB for backfill');

  const verifiedDomains = await DomainAuthentication.find({ status: 'verified', user: { $ne: null } }).select('user');
  const userIds = [...new Set(verifiedDomains.map(d => d.user.toString()))];
  logger.info(`Found ${userIds.length} users with verified domains`);

  if (userIds.length === 0) {
    logger.info('No users to update. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const res = await User.updateMany({ _id: { $in: userIds } }, { $set: { hasVerifiedDomain: true } });
  logger.info(`Updated ${res.modifiedCount || res.nModified || 0} users`);

  await mongoose.disconnect();
  logger.info('Backfill complete');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

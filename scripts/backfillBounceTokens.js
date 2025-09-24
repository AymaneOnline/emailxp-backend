// emailxp/backend/scripts/backfillBounceTokens.js
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const DomainAuthentication = require('../models/DomainAuthentication');

(async function run(){
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/emailxp';
  await mongoose.connect(uri);
  const without = await DomainAuthentication.find({ $or: [ { bounceToken: { $exists: false } }, { bounceToken: null } ] });
  console.log(`Found ${without.length} domains missing bounceToken`);
  for (const d of without) {
    d.bounceToken = crypto.randomBytes(8).toString('hex');
    await d.save();
    console.log(`Updated domain ${d.domain}`);
  }
  await mongoose.disconnect();
  console.log('Done');
})();

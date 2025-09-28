const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');

async function main() {
  await connectDB();
  const Automation = require('../models/Automation');

  const userId = process.argv[2] || process.env.TEST_USER_ID || '68d7c11d0e699de7a7adc370';
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.error('Invalid user id:', userId);
    process.exit(1);
  }

  const automations = await Automation.find({ user: userId }).lean();
  console.log('Found automations for user', userId, ':', automations.length);
  automations.forEach(a => {
    console.log('---');
    console.log('Automation:', a._id.toString(), 'name:', a.name, 'isActive:', !!a.isActive, 'status:', a.status);
    const nodes = a.nodes || [];
    console.log('Nodes count:', nodes.length);
    nodes.forEach((n, idx) => {
      console.log(`  [${idx}] id:${n.id} type:${n.type} dataKeys:${Object.keys(n.data||{}).join(',')}`);
    });
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

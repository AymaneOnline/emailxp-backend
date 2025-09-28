// Insert a test subscriber for the first user and invoke campaignAutomationEngine.handleSubscriberAdded
const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');

async function main() {
  const connectDB = require('../config/db');
  await connectDB();

  const User = require('../models/User');
  const Subscriber = require('../models/Subscriber');
  const campaignAutomation = require('../services/campaignAutomation');

  const user = await User.findOne();
  if (!user) {
    console.error('No user found.');
    process.exit(1);
  }

  const sub = await Subscriber.create({
    user: user._id,
    email: `test-subscriber-${Date.now()}@example.com`,
    name: 'Test Subscriber',
    status: 'subscribed',
    source: 'manual'
  });

  console.log('Inserted subscriber:', sub._id.toString());

  // Fetch subscriber (no populate to avoid missing model registration in this script)
  const populated = await Subscriber.findById(sub._id);

  // Call handler
  await campaignAutomation.campaignAutomationEngine.handleSubscriberAdded(populated);

  console.log('handleSubscriberAdded invoked.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

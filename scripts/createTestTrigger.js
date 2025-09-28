// Create a trigger-type CampaignSchedule for subscriber_added for the current user
const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');

async function main() {
  const connectDB = require('../config/db');
  await connectDB();

  const Campaign = require('../models/Campaign');
  const CampaignSchedule = require('../models/CampaignSchedule');
  const User = require('../models/User');

  // Use the first user found if no explicit user id provided
  const user = await User.findOne();
  if (!user) {
    console.error('No user found in DB to assign schedule to. Aborting.');
    process.exit(1);
  }

  // Try to find a campaign for the user
  let campaign = await Campaign.findOne({ user: user._id });
  if (!campaign) {
    // Create a minimal campaign for testing
    campaign = await Campaign.create({
      user: user._id,
      name: 'Test Campaign (auto-created)',
      subject: 'Test subject',
      htmlContent: '<p>Hello {{firstName}}</p>',
      isActive: true
    });
    console.log('Created test campaign:', campaign._id.toString());
  }

  // Create the trigger schedule
  const schedule = await CampaignSchedule.create({
    user: user._id,
    campaign: campaign._id,
    name: 'Test subscriber_added trigger',
    scheduleType: 'trigger',
    triggers: [
      { event: 'subscriber_added', conditions: [], delay: 0, delayUnit: 'minutes' }
    ],
    status: 'running',
    isActive: true,
    settings: { maxRecipientsPerExecution: 100 }
  });

  console.log('Created schedule:', schedule._id.toString());
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

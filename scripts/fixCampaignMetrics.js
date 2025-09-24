// emailxp/backend/scripts/fixCampaignMetrics.js

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');

async function fixCampaignMetrics() {
  try {
    console.log('Starting campaign metrics fix...');

    // Get all campaigns
    const campaigns = await Campaign.find({});
    console.log(`Found ${campaigns.length} campaigns to process`);

    for (const campaign of campaigns) {
      console.log(`Processing campaign: ${campaign.name} (${campaign._id})`);

      // Count unique opens for this campaign
      const uniqueOpens = await OpenEvent.distinct('subscriber', { campaign: campaign._id });
      const openCount = uniqueOpens.length;

      // Count unique clicks for this campaign
      const uniqueClicks = await ClickEvent.distinct('subscriber', { campaign: campaign._id });
      const clickCount = uniqueClicks.length;

      // Update campaign with correct counts
      await Campaign.findByIdAndUpdate(campaign._id, {
        opens: openCount,
        clicks: clickCount
      });

      console.log(`  Updated: opens=${openCount}, clicks=${clickCount}`);
    }

    console.log('Campaign metrics fix completed successfully!');
  } catch (error) {
    console.error('Error fixing campaign metrics:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/emailxp')
    .then(() => {
      console.log('Connected to MongoDB');
      return fixCampaignMetrics();
    })
    .catch(error => {
      console.error('MongoDB connection error:', error);
      process.exit(1);
    });
}

module.exports = { fixCampaignMetrics };
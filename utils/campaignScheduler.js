// emailxp/backend/utils/campaignScheduler.js

const cron = require('node-cron');
const Campaign = require('../models/Campaign'); // Assuming your Campaign model is in ../models/Campaign.js
const List = require('../models/List'); // Assuming your List model is in ../models/List.js
const Subscriber = require('../models/Subscriber'); // Assuming Subscriber model
const { sendEmail } = require('../services/emailService'); // Your email service
const cheerio = require('cheerio'); // For HTML parsing in sendCampaign

// --- IMPORTANT: Define your backend URL here ---
// This is the base URL where your tracking pixel endpoint is hosted.
// For deployment, ensure process.env.BACKEND_URL is set (e.g., https://your-app-backend.com)
// It's crucial for the tracking pixels and click redirects.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// This function contains the core logic for sending a single campaign.
// We are extracting this from the controller so it can be called by both
// the API endpoint (for immediate sends) and the scheduler.
const executeSendCampaign = async (campaignId) => {
    try {
        const campaign = await Campaign.findById(campaignId).populate('list');

        if (!campaign) {
            console.error(`[Scheduler] Campaign with ID ${campaignId} not found.`);
            return { success: false, message: 'Campaign not found.' };
        }

        // Only send if status is 'scheduled' and scheduledAt is in the past
        // or if it's explicitly triggered from an API (which handles status 'draft')
        if (campaign.status !== 'scheduled' && campaign.status !== 'draft') {
            console.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has status '${campaign.status}'. Skipping scheduled send.`);
            return { success: false, message: `Campaign status is '${campaign.status}'.` };
        }
        
        // If it's a scheduled campaign, double-check scheduledAt
        if (campaign.status === 'scheduled' && (!campaign.scheduledAt || campaign.scheduledAt > new Date())) {
            console.log(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) is scheduled for a future time. Skipping.`);
            return { success: false, message: 'Campaign not yet due.' };
        }

        const subscribers = await Subscriber.find({ list: campaign.list._id });

        if (subscribers.length === 0) {
            console.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no subscribers in list ${campaign.list.name}.`);
            campaign.status = 'sent'; // Mark as sent even if no subscribers, as it "completed" its sending attempt
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: false, message: 'No subscribers found for this campaign.' };
        }

        // Update campaign status to 'sending' before starting the send process
        campaign.status = 'sending';
        await campaign.save();
        console.log(`[Scheduler] Initiating send for campaign: ${campaign.name} (ID: ${campaign._id}) to ${subscribers.length} subscribers.`);

        const sendPromises = subscribers.map(async (subscriber) => {
            let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            const personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

            // --- Click tracking processing ---
            if (personalizedHtml) {
                const $ = cheerio.load(personalizedHtml);
                $('a').each((i, link) => {
                    const originalHref = $(link).attr('href');
                    if (originalHref && (originalHref.startsWith('http://') || originalHref.startsWith('https://'))) {
                        const encodedOriginalUrl = encodeURIComponent(originalHref);
                        const clickTrackingUrl = `${BACKEND_URL}/api/track/click/${campaign._id}/${subscriber._id}?url=${encodedOriginalUrl}`;
                        $(link).attr('href', clickTrackingUrl);
                    }
                });
                personalizedHtml = $.html();
            }

            // --- Open tracking pixel injection ---
            const trackingPixelUrl = `${BACKEND_URL}/api/track/open/${campaign._id}/${subscriber._id}`;
            personalizedHtml = `${personalizedHtml}<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">`;

            // --- Unsubscribe Link (as discussed) ---
            const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}/${campaign.list._id}`;
            personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
            personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;


            try {
                await sendEmail(
                    subscriber.email,
                    campaign.subject,
                    personalizedHtml,
                    personalizedPlain
                );
                console.log(`[Scheduler] Email sent to ${subscriber.email} for campaign ${campaign._id}`);
                return { subscriber: subscriber.email, success: true };
            } catch (emailError) {
                console.error(`[Scheduler] Failed to send email to ${subscriber.email} for campaign ${campaign._id}:`, emailError.message);
                return { subscriber: subscriber.email, success: false, error: emailError.message };
            }
        });

        const results = await Promise.allSettled(sendPromises); // Use allSettled to await all, even if some fail

        // Count successes and failures
        const successfulSends = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failedSends = results.filter(r => r.status === 'fulfilled' && !r.value.success || r.status === 'rejected').length;

        // Update campaign status to 'sent' after attempting to send to all subscribers
        campaign.status = 'sent';
        campaign.sentAt = new Date();
        await campaign.save();

        console.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
        return { success: true, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

    } catch (error) {
        console.error(`[Scheduler] Critical error during scheduled campaign send for ID ${campaignId}:`, error);
        // Attempt to revert status if it was 'sending' and an error occurred before completion
        const campaign = await Campaign.findById(campaignId);
        if (campaign && campaign.status === 'sending') {
             campaign.status = 'paused'; // Or 'failed' depending on desired state
             await campaign.save();
             console.log(`[Scheduler] Campaign ${campaignId} status reverted to 'paused' due to error.`);
        }
        return { success: false, message: `An unexpected error occurred: ${error.message}` };
    }
};

// Export the core sending logic if your controller needs to call it directly
module.exports.executeSendCampaign = executeSendCampaign;

// --- Scheduler setup ---
const startCampaignScheduler = () => {
    // Schedule a task to run every 5 minutes (adjust as needed for your requirements)
    // The cron syntax is: minute hour day_of_month month day_of_week
    // For every 5 minutes: '*/5 * * * *'
    // For every minute: '* * * * *' (good for testing)
    cron.schedule('*/1 * * * *', async () => { // Runs every minute
        console.log('[Scheduler] Running scheduled campaign check...');
        try {
            // Find campaigns that are 'scheduled' and whose scheduledAt is in the past or now
            const campaignsToSend = await Campaign.find({
                status: 'scheduled',
                scheduledAt: { $lte: new Date() } // Scheduled time is less than or equal to now
            });

            if (campaignsToSend.length > 0) {
                console.log(`[Scheduler] Found ${campaignsToSend.length} campaigns to send.`);
                for (const campaign of campaignsToSend) {
                    // Update status to 'sending' immediately to prevent other cron jobs from picking it up
                    campaign.status = 'sending';
                    await campaign.save(); // Save the status change

                    // Execute the send logic (using the extracted function)
                    await executeSendCampaign(campaign._id);
                    // The executeSendCampaign function updates the status to 'sent' or 'paused/failed'
                }
            } else {
                console.log('[Scheduler] No campaigns due for sending.');
            }
        } catch (error) {
            console.error('[Scheduler] Error during scheduled campaign check:', error);
        }
    });

    console.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
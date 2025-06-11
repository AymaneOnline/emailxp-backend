// emailxp/backend/utils/campaignScheduler.js

const cron = require('node-cron');
const Campaign = require('../models/Campaign'); // Assuming your Campaign model is in ../models/Campaign.js
const List = require('../models/List'); // Assuming your List model is in ../models/List.js (needed for unsubscribe URL)
const Subscriber = require('../models/Subscriber'); // Assuming Subscriber model
const { sendEmail } = require('../services/emailService'); // Your email service (sendEmail function)
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
    console.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`);
    try {
        // Populate 'list' to get list details like name and _id for tracking/unsubscribing
        const campaign = await Campaign.findById(campaignId).populate('list');

        if (!campaign) {
            console.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            return { success: false, message: 'Campaign not found.' };
        }

        // Only send if status is 'scheduled' and scheduledAt is in the past
        // or if it's explicitly triggered from an API (which handles status 'draft')
        if (campaign.status === 'sent' || campaign.status === 'sending') {
            console.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has status '${campaign.status}'. Skipping send execution.`);
            return { success: false, message: `Campaign status is '${campaign.status}'.` };
        }
        
        // If it's a scheduled campaign, double-check scheduledAt
        // This check is primarily for the scheduler, but harmless for immediate sends.
        if (campaign.status === 'scheduled' && (!campaign.scheduledAt || campaign.scheduledAt > new Date())) {
            console.log(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) is scheduled for a future time. Skipping.`);
            return { success: false, message: 'Campaign not yet due.' };
        }

        const subscribers = await Subscriber.find({ list: campaign.list._id });

        if (subscribers.length === 0) {
            console.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no subscribers in list ${campaign.list.name}.`);
            // If no subscribers, mark as sent even if no emails were technically sent, as the process completed.
            campaign.status = 'sent'; 
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: true, message: 'No subscribers found for this campaign. Campaign marked as sent.' };
        }

        // Update campaign status to 'sending' before starting the send process
        // This prevents multiple scheduler runs from picking up the same campaign
        campaign.status = 'sending';
        await campaign.save();
        console.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} subscribers.`);

        let successfulSends = 0;
        let failedSends = 0;

        const sendPromises = subscribers.map(async (subscriber) => {
            // Basic personalization: Replace {{name}} with subscriber's name
            let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            const personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

            // NOTE: The `sendEmail` service now handles the cheerio HTML rewriting
            // and tracking pixel injection internally, using the passed campaignId and subscriberId.
            // This simplifies the `executeSendCampaign` function.

            // --- Unsubscribe Link (as discussed) ---
            // The unsubscribe route needs both subscriber and list ID to unsubscribe from a specific list
            // Ensure campaign.list._id is used here as it's populated.
            const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}/${campaign.list._id}`;
            personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
            personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

            try {
                // Call the refactored sendEmail function with all necessary parameters
                const result = await sendEmail(
                    subscriber.email,
                    campaign.subject,
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id, // Pass campaign ID for tracking
                    subscriber._id // Pass subscriber ID for tracking
                );
                
                if (result.success) {
                    successfulSends++;
                    console.log(`[Scheduler] Email sent to ${subscriber.email} for campaign ${campaign._id}`);
                } else {
                    failedSends++;
                    // Log detailed error from sendEmail if it was unsuccessful
                    console.error(`[Scheduler Error] Failed to send email to ${subscriber.email} for campaign ${campaign._id}: ${result.message}`, result.error);
                }
                return result;
            } catch (emailError) {
                // This catch handles unexpected errors during the sendEmail call itself
                failedSends++;
                console.error(`[Scheduler] Uncaught error while trying to send email to ${subscriber.email} for campaign ${campaign._id}:`, emailError);
                return { subscriber: subscriber.email, success: false, error: emailError.message };
            }
        });

        // Use Promise.allSettled to await all email sending promises, even if some fail
        await Promise.allSettled(sendPromises); 

        // Update campaign status based on overall sending result
        campaign.status = successfulSends > 0 ? 'sent' : 'failed'; // Mark as sent if at least one email succeeded
        campaign.sentAt = new Date();
        await campaign.save();

        console.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
        return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

    } catch (error) {
        console.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, error);
        // Attempt to revert status if it was 'sending' and an error occurred before completion
        try {
            const campaign = await Campaign.findById(campaignId);
            if (campaign && campaign.status === 'sending') { // Only set to 'failed' if still in 'sending' state
                 campaign.status = 'failed'; // Set to 'failed' if a critical error occurs
                 await campaign.save();
                 console.log(`[Scheduler] Campaign ${campaignId} status reverted to 'failed' due to critical error.`);
            }
        } catch (dbError) {
            console.error(`[Scheduler] Failed to update campaign status after critical error:`, dbError);
        }
        return { success: false, message: `An unexpected critical error occurred: ${error.message}` };
    }
};

// Export the core sending logic so your controller can call it directly for immediate sends
module.exports.executeSendCampaign = executeSendCampaign;

// --- Scheduler setup ---
const startCampaignScheduler = () => {
    // Schedule a task to run every 1 minute
    // The cron syntax is: minute hour day_of_month month day_of_week
    // '* * * * *' runs every minute. Adjust as needed for production ('*/5 * * * *' for every 5 minutes).
    cron.schedule('* * * * *', async () => { 
        console.log('[Scheduler] Running scheduled campaign check...');
        const now = new Date();

        try {
            // Find campaigns that are 'scheduled' and whose scheduledAt is in the past or now
            const campaignsToSend = await Campaign.find({
                status: 'scheduled',
                scheduledAt: { $lte: now } // Scheduled time is less than or equal to current time
            });

            if (campaignsToSend.length === 0) {
                console.log('[Scheduler] No campaigns due for sending.');
                return;
            }

            console.log(`[Scheduler] Found ${campaignsToSend.length} campaigns to send.`);

            for (const campaign of campaignsToSend) {
                // Execute the send logic for each due campaign.
                // We're awaiting here to ensure sequential processing and clearer logs for debugging.
                // For very high volume production, consider using a message queue or a worker pool.
                await executeSendCampaign(campaign._id);
                // The executeSendCampaign function handles updating the campaign's status to 'sent' or 'failed'.
            }
        } catch (error) {
            console.error('[Scheduler Error] Error during scheduled campaign check:', error);
        }
    });

    console.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
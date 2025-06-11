// emailxp/backend/utils/campaignScheduler.js

// --- NEW: Add initialization logs to trace module loading ---
console.log('[Scheduler Init] Starting campaignScheduler.js initialization...');
const cron = require('node-cron');
console.log('[Scheduler Init] node-cron loaded.');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
console.log('[Scheduler Init] Mongoose models loaded (Campaign, List, Subscriber).');

// This import loads emailService.js. If there's an error in emailService.js's top-level scope, it might happen here.
console.log('[Scheduler Init] Attempting to load emailService.js...');
const { sendEmail } = require('../services/emailService');
console.log('[Scheduler Init] emailService.js loaded.');

// This import loads cheerio. If there's an error in cheerio's top-level scope, it might happen here.
console.log('[Scheduler Init] Attempting to load cheerio...');
const cheerio = require('cheerio');
console.log('[Scheduler Init] cheerio loaded.');

// Check the value of BACKEND_URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
console.log(`[Scheduler Init] BACKEND_URL value: ${BACKEND_URL}`);

console.log('[Scheduler Init] All initial imports and global variables processed.');
// --- END NEW Init Logs ---


/**
 * @desc Executes the sending process for a single campaign.
 * This function is called by the campaign scheduler or the direct send API endpoint.
 * It's responsible for fetching subscribers, personalizing content, sending emails,
 * and updating the campaign's final status ('sent' or 'failed').
 * @param {string} campaignId - The ID of the campaign to send.
 * @returns {object} An object indicating success/failure and relevant messages/stats.
 */
const executeSendCampaign = async (campaignId) => {
    // This log is primarily for confirming the function call from its parent (startCampaignScheduler or API endpoint)
    console.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`); 
    // This log confirms entry into the function's executable body
    console.log(`[Scheduler] --- INSIDE executeSendCampaign for ID: ${campaignId} ---`); 

    try {
        // Step 1: Fetch the campaign and its associated list
        console.log(`[Scheduler] Step 1: About to call Campaign.findById(${campaignId}).`);
        const campaign = await Campaign.findById(campaignId).populate('list');
        console.log(`[Scheduler] Step 2: Campaign.findById().populate('list') completed.`);
        console.log(`[Scheduler] Retrieved Campaign ID: ${campaign ? campaign._id : 'null'}`);
        console.log(`[Scheduler] Retrieved Campaign List ID: ${campaign && campaign.list ? campaign.list._id : 'null'}`);

        if (!campaign) {
            console.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            // Update status directly using findByIdAndUpdate as 'campaign' object is null
            await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' }); // Set to 'failed' if not found
            console.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' (not found).`);
            return { success: false, message: 'Campaign not found.' };
        }

        console.log(`[Scheduler] Campaign status check: ${campaign.status}`);

        // If the campaign is already 'sent', skip.
        // If it's 'sending', that means the scheduler just told us to process it, so we proceed.
        if (campaign.status === 'sent') {
            console.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has already been sent. Skipping re-send.`);
            return { success: false, message: `Campaign status is '${campaign.status}'.` };
        }
        // No else if for 'sending' needed, because if it's 'sending' and not 'sent', we continue.

        // Step 2: Fetch subscribers for the campaign's list
        const subscribers = await Subscriber.find({ list: campaign.list._id });

        if (subscribers.length === 0) {
            console.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no subscribers in list ${campaign.list.name}.`);
            // Mark campaign as sent even if no subscribers, as no emails need to be sent
            campaign.status = 'sent'; 
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: true, message: 'No subscribers found for this campaign. Campaign marked as sent.' };
        }

        // The status update to 'sending' is now handled by the startCampaignScheduler loop *before* calling executeSendCampaign.
        // So, no need to set campaign.status = 'sending'; await campaign.save(); here.

        console.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} subscribers.`);

        // Step 3: Prepare and send emails to all subscribers
        try {
            const sendPromises = subscribers.map(async (subscriber) => {
                // Personalize content
                let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                const personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

                // Generate unique unsubscribe URL
                const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}/${campaign.list._id}`;
                personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
                personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

                console.log(`[Scheduler] Prepare to call sendEmail for subscriber: ${subscriber.email} (Campaign: ${campaign._id}, Subscriber: ${subscriber._id})`);
                
                // Call the email service to send the email
                const result = await sendEmail(
                    subscriber.email,
                    campaign.subject,
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id,
                    subscriber._id
                );
                console.log(`[Scheduler] sendEmail for ${subscriber.email} returned:`, result);
                return result; 
            });

            // Use Promise.allSettled to ensure all promises are processed, even if some fail
            const results = await Promise.allSettled(sendPromises); 

            let successfulSends = 0;
            let failedSends = 0;

            results.forEach(outcome => {
                if (outcome.status === 'fulfilled') {
                    // Check the value returned by sendEmail to determine success
                    if (outcome.value && outcome.value.success) {
                        successfulSends++;
                    } else {
                        failedSends++;
                        const errorMsg = outcome.value && outcome.value.message ? outcome.value.message : 'Unknown failure';
                        const errorObj = outcome.value && outcome.value.error ? outcome.value.error : 'No detailed error object from sendEmail';
                        console.error(`[Scheduler] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                    }
                } else if (outcome.status === 'rejected') {
                    failedSends++;
                    console.error(`[Scheduler] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
                }
            });

            // Step 4: Update campaign status based on send results
            campaign.status = successfulSends > 0 ? 'sent' : 'failed'; // Mark as sent if at least one email was successful
            campaign.sentAt = new Date();
            await campaign.save();

            console.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
            return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

        } catch (innerSendingError) {
            // Catch errors during the actual email sending process (e.g., SendGrid issues)
            console.error(`[Scheduler] ERROR within sendPromises processing for campaign ID ${campaignId}:`, innerSendingError);
            campaign.status = 'failed'; // Set to failed if a major error occurs during sending
            await campaign.save();
            console.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' due to inner sending error.`);
            return { success: false, message: `Error during email sending phase: ${innerSendingError.message}` };
        }

    } catch (outerCriticalError) {
        // Catch any unexpected critical errors during the initial fetch or setup of executeSendCampaign
        console.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, outerCriticalError);
        try {
            // Try to update the campaign status to 'failed' if it was left in 'sending'
            const currentCampaignState = await Campaign.findById(campaignId);
            if (currentCampaignState && currentCampaignState.status === 'sending') {
                 currentCampaignState.status = 'failed';
                 await currentCampaignState.save();
                 console.log(`[Scheduler] Campaign ${campaignId} status reverted to 'failed' due to critical error.`);
            } else if (currentCampaignState && currentCampaignState.status === 'scheduled') {
                 // If for some reason it's still scheduled, set to failed
                 currentCampaignState.status = 'failed';
                 await currentCampaignState.save();
                 console.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' from 'scheduled' due to critical error.`);
            }
        } catch (dbError) {
            console.error(`[Scheduler] Failed to update campaign status after critical error:`, dbError);
        }
        return { success: false, message: `An unexpected critical error occurred: ${outerCriticalError.message}` };
    }
};

module.exports.executeSendCampaign = executeSendCampaign;


/**
 * @desc Starts the cron job for checking and sending scheduled campaigns.
 * This runs every minute and identifies campaigns due for sending.
 */
const startCampaignScheduler = () => {
    // Schedule to run every minute
    cron.schedule('* * * * *', async () => {
        console.log('[Scheduler] Running scheduled campaign check...');
        const now = new Date();

        try {
            // Find campaigns that are scheduled and whose scheduledAt time has passed or is current
            const campaignsToSend = await Campaign.find({
                status: 'scheduled',
                scheduledAt: { $lte: now }
            });

            if (campaignsToSend.length === 0) {
                console.log('[Scheduler] No campaigns due for sending.');
                return;
            }

            console.log(`[Scheduler] Found ${campaignsToSend.length} campaigns to send.`);

            for (const campaign of campaignsToSend) {
                // Important: Change status to 'sending' BEFORE initiating send.
                // This prevents the same campaign from being picked up by another scheduler instance
                // or being processed again if it gets stuck.
                // executeSendCampaign will then proceed since it now allows 'sending' status campaigns.
                campaign.status = 'sending';
                await campaign.save();
                console.log(`[Scheduler] Processing campaign: ${campaign.name} (ID: ${campaign._id})`);

                // Call the campaign sending logic. This call is wrapped in its own try-catch
                // to handle errors that might occur within executeSendCampaign's initial setup
                // or if it causes a hard process exit.
                try {
                    await exports.executeSendCampaign(campaign._id); // Use exports.executeSendCampaign to ensure it's callable
                } catch (executionError) {
                    // This catches errors that prevent executeSendCampaign from even fully starting up
                    console.error(`[Scheduler Error] Failed to execute send for campaign ID ${campaign._id}:`, executionError);
                    // Attempt to set campaign status to 'failed' if an error occurs here
                    try {
                        const failedCampaign = await Campaign.findById(campaign._id);
                        if (failedCampaign) {
                            failedCampaign.status = 'failed';
                            await failedCampaign.save();
                            console.log(`[Scheduler] Campaign ${campaign._id} status set to 'failed' due to execution error.`);
                        }
                    } catch (dbUpdateError) {
                        console.error(`[Scheduler] Failed to update status to 'failed' for campaign ${campaign._id}:`, dbUpdateError);
                    }
                }
            }
        } catch (error) {
            // Catch any errors that occur during the main scheduler loop (e.g., database connection issues)
            console.error('[Scheduler Error] Error during scheduled campaign check:', error);
        }
    });

    console.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
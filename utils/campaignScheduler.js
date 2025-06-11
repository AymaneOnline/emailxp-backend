// emailxp/backend/utils/campaignScheduler.js

// --- Sentry Integration ---
const Sentry = require('@sentry/node');
// --- END Sentry Integration ---

// Determine if the environment is production (e.g., set NODE_ENV=production on Railway)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Basic logger to control output based on environment
const logger = {
    log: (...args) => {
        // Log general info only in development
        if (!IS_PRODUCTION) {
            console.log(...args);
        }
    },
    warn: (...args) => {
        // Warnings are often useful in both dev and production
        console.warn(...args);
    },
    error: (...args) => {
        // Errors should always be logged in both dev and production
        console.error(...args);
    }
};

const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const { sendEmail } = require('../services/emailService');
const cheerio = require('cheerio'); // You might use this for more advanced HTML manipulation

// BACKEND_URL for unsubscribe links and click tracking
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';


/**
 * @desc Executes the sending process for a single campaign.
 * This function is called by the campaign scheduler or the direct send API endpoint.
 * It's responsible for fetching subscribers, personalizing content, sending emails,
 * and updating the campaign's final status ('sent' or 'failed').
 * @param {string} campaignId - The ID of the campaign to send.
 * @returns {object} An object indicating success/failure and relevant messages/stats.
 */
const executeSendCampaign = async (campaignId) => {
    let campaign; // Declare campaign here so it's accessible in catch block
    let successfulSends = 0;
    let failedSends = 0;

    logger.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`);

    try {
        campaign = await Campaign.findById(campaignId).populate('list');

        if (!campaign) {
            logger.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            Sentry.captureException(new Error(`Campaign with ID ${campaignId} not found during execution.`));
            // If campaign is not found, attempt to mark it failed directly
            await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' (not found).`);
            return { success: false, message: 'Campaign not found.' };
        }

        logger.log(`[Scheduler] Campaign status check: ${campaign.status}`);

        // Prevent re-sending if already sent or if status isn't 'scheduled' or 'paused'
        if (campaign.status === 'sent' || campaign.status === 'failed') {
            logger.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has status '${campaign.status}'. Skipping re-send.`);
            return { success: false, message: `Campaign status is '${campaign.status}'. Cannot send.` };
        }

        // Set campaign status to 'sending' before fetching subscribers
        campaign.status = 'sending';
        await campaign.save();

        // --- CRITICAL UPDATE: Filter for 'subscribed' status ---
        const subscribers = await Subscriber.find({
            list: campaign.list._id,
            status: 'subscribed' // ONLY fetch subscribers who are marked as 'subscribed'
        });

        if (subscribers.length === 0) {
            logger.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no 'subscribed' members in list ${campaign.list.name}.`);
            campaign.status = 'sent'; // Mark as sent even if no active subscribers found
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: true, message: 'No active subscribers found for this campaign. Campaign marked as sent.' };
        }

        logger.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} active subscribers.`);

        try {
            const sendPromises = subscribers.map(async (subscriber) => {
                let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                let personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                // Also personalize the subject if it contains placeholders
                let personalizedSubject = campaign.subject.replace(/\{\{name\}\}/g, subscriber.name || 'there');

                // --- GENERATE THE CORRECT UNSUBSCRIBE URL ---
                // It should now point to the public unsubscribe route you set up in trackingRoutes.js
                // Include campaignId as a query parameter for tracking
                const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}?campaignId=${campaign._id}`;

                // Append unsubscribe link to HTML and Plain text content
                personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
                personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

                logger.log(`[Scheduler] Prepare to call sendEmail for subscriber: ${subscriber.email}`);

                const result = await sendEmail(
                    subscriber.email,
                    personalizedSubject, // Use personalized subject
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id,
                    subscriber._id
                );
                logger.log(`[Scheduler] sendEmail for ${subscriber.email} returned:`, result);
                return result;
            });

            const results = await Promise.allSettled(sendPromises);

            results.forEach(outcome => {
                if (outcome.status === 'fulfilled') {
                    if (outcome.value && outcome.value.success) {
                        successfulSends++;
                    } else {
                        failedSends++;
                        const errorMsg = outcome.value && outcome.value.message ? outcome.value.message : 'Unknown failure';
                        const errorObj = outcome.value && outcome.value.error ? outcome.value.error : 'No detailed error object from sendEmail';
                        logger.error(`[Scheduler] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                        Sentry.captureException(new Error(`Email send fulfilled but failed: ${errorMsg}`), {
                            extra: { campaignId: campaign._id, subscriberEmail: outcome.value.email, originalError: errorObj }
                        });
                    }
                } else if (outcome.status === 'rejected') {
                    failedSends++;
                    logger.error(`[Scheduler] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
                    Sentry.captureException(outcome.reason, {
                        extra: { campaignId: campaign._id, subscriberId: 'unknown' }
                    });
                }
            });

            campaign.status = successfulSends > 0 ? 'sent' : 'failed';
            campaign.sentAt = new Date();
            await campaign.save();

            logger.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
            return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

        } catch (innerSendingError) {
            logger.error(`[Scheduler] ERROR within sendPromises processing for campaign ID ${campaignId}:`, innerSendingError);
            Sentry.captureException(innerSendingError);
            campaign.status = 'failed';
            await campaign.save();
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' due to inner sending error.`);
            return { success: false, message: `Error during email sending phase: ${innerSendingError.message}` };
        }

    } catch (outerCriticalError) {
        logger.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, outerCriticalError);
        Sentry.captureException(outerCriticalError);

        // Always attempt to mark the campaign as 'failed' using findByIdAndUpdate
        // This is robust as it doesn't rely on the 'campaign' object being loaded or having its .save() method.
        if (campaignId) {
            try {
                await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });
                logger.log(`[Scheduler] Campaign ${campaignId} status updated to 'failed' due to critical error.`);
            } catch (updateError) {
                logger.error(`[Scheduler] Failed to update campaign status to 'failed' after critical error for ID ${campaignId}:`, updateError);
                Sentry.captureException(updateError);
            }
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
    cron.schedule('* * * * *', async () => {
        logger.log('[Scheduler] Running scheduled campaign check...');
        const now = new Date();

        try {
            const campaignsToSend = await Campaign.find({
                status: 'scheduled',
                scheduledAt: { $lte: now }
            });

            if (campaignsToSend.length === 0) {
                logger.log('[Scheduler] No campaigns due for sending.');
                return;
            }

            logger.log(`[Scheduler] Found ${campaignsToSend.length} campaigns to send.`);

            for (const campaign of campaignsToSend) {
                // Set campaign status to 'sending' before calling executeSendCampaign
                // This prevents multiple cron jobs from picking up the same campaign
                // if there's a slight delay.
                campaign.status = 'sending';
                await campaign.save();
                logger.log(`[Scheduler] Processing campaign: ${campaign.name} (ID: ${campaign._id})`);

                try {
                    await exports.executeSendCampaign(campaign._id);
                } catch (executionError) {
                    logger.error(`[Scheduler Error] Failed to execute send for campaign ID ${campaign._id}:`, executionError);
                    Sentry.captureException(executionError);
                    try {
                        const failedCampaign = await Campaign.findById(campaign._id);
                        if (failedCampaign) {
                            failedCampaign.status = 'failed';
                            await failedCampaign.save();
                            logger.log(`[Scheduler] Campaign ${campaign._id} status set to 'failed' due to execution error.`);
                        }
                    } catch (dbUpdateError) {
                        logger.error(`[Scheduler] Failed to update status to 'failed' for campaign ${campaign._id}:`, dbUpdateError);
                        Sentry.captureException(dbUpdateError);
                    }
                }
            }
        } catch (error) {
            logger.error('[Scheduler Error] Error during scheduled campaign check:', error);
            Sentry.captureException(error);
        }
    });

    logger.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
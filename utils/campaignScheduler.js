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
const cheerio = require('cheerio');

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
    logger.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`); 

    try {
        const campaign = await Campaign.findById(campaignId).populate('list');
        
        if (!campaign) {
            logger.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            // --- Sentry: Capture the error if campaign is not found ---
            Sentry.captureException(new Error(`Campaign with ID ${campaignId} not found during execution.`));
            // --- END Sentry ---
            await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' }); 
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' (not found).`);
            return { success: false, message: 'Campaign not found.' };
        }

        logger.log(`[Scheduler] Campaign status check: ${campaign.status}`);

        if (campaign.status === 'sent') {
            logger.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has already been sent. Skipping re-send.`);
            return { success: false, message: `Campaign status is '${campaign.status}'.` };
        }
        
        const subscribers = await Subscriber.find({ list: campaign.list._id });

        if (subscribers.length === 0) {
            logger.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no subscribers in list ${campaign.list.name}.`);
            campaign.status = 'sent'; 
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: true, message: 'No subscribers found for this campaign. Campaign marked as sent.' };
        }

        logger.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} subscribers.`);

        try {
            const sendPromises = subscribers.map(async (subscriber) => {
                let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                let personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there'); 
                
                const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}/${campaign.list._id}`;
                personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
                personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

                logger.log(`[Scheduler] Prepare to call sendEmail for subscriber: ${subscriber.email}`);
                
                const result = await sendEmail(
                    subscriber.email,
                    campaign.subject,
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id,
                    subscriber._id
                );
                logger.log(`[Scheduler] sendEmail for ${subscriber.email} returned:`, result);
                return result; 
            });

            const results = await Promise.allSettled(sendPromises); 

            let successfulSends = 0;
            let failedSends = 0;

            results.forEach(outcome => {
                if (outcome.status === 'fulfilled') {
                    if (outcome.value && outcome.value.success) {
                        successfulSends++;
                    } else {
                        failedSends++;
                        const errorMsg = outcome.value && outcome.value.message ? outcome.value.message : 'Unknown failure';
                        const errorObj = outcome.value && outcome.value.error ? outcome.value.error : 'No detailed error object from sendEmail';
                        logger.error(`[Scheduler] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                        // --- Sentry: Capture individual send failures if sendEmail reports it as an error ---
                        Sentry.captureException(new Error(`Email send fulfilled but failed: ${errorMsg}`), {
                            extra: { campaignId, subscriberEmail: outcome.value.email, originalError: errorObj }
                        });
                        // --- END Sentry ---
                    }
                } else if (outcome.status === 'rejected') {
                    failedSends++;
                    logger.error(`[Scheduler] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
                    // --- Sentry: Capture rejected promises (e.g., network issues) ---
                    Sentry.captureException(outcome.reason, {
                        extra: { campaignId, subscriberId: 'unknown' } // You might not have subscriber ID on rejection
                    });
                    // --- END Sentry ---
                }
            });

            campaign.status = successfulSends > 0 ? 'sent' : 'failed'; 
            campaign.sentAt = new Date();
            await campaign.save();

            logger.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
            return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

        } catch (innerSendingError) {
            logger.error(`[Scheduler] ERROR within sendPromises processing for campaign ID ${campaignId}:`, innerSendingError);
            // --- Sentry: Capture critical errors during sendPromises processing ---
            Sentry.captureException(innerSendingError);
            // --- END Sentry ---
            campaign.status = 'failed'; 
            await campaign.save();
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' due to inner sending error.`);
            return { success: false, message: `Error during email sending phase: ${innerSendingError.message}` };
        }

    } catch (outerCriticalError) {
        logger.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, outerCriticalError);
        // --- Sentry: Capture any top-level critical errors in executeSendCampaign ---
        Sentry.captureException(outerCriticalError);
        // --- END Sentry ---
        try {
            const currentCampaignState = await Campaign.findById(campaignId);
            if (currentCampaignState && currentCampaignState.status === 'sending') {
                 currentCampaignState.status = 'failed';
                 await currentCampaignState.save();
                 logger.log(`[Scheduler] Campaign ${campaignId} status reverted to 'failed' due to critical error.`);
            } else if (currentCampaignState && currentCampaignState.status === 'scheduled') {
                 currentCampaignState.status = 'failed';
                 await currentCampaignState.save();
                 logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' from 'scheduled' due to critical error.`);
            }
        } catch (dbError) {
            logger.error(`[Scheduler] Failed to update campaign status after critical error:`, dbError);
            // --- Sentry: Capture errors if DB update fails after a critical error ---
            Sentry.captureException(dbError);
            // --- END Sentry ---
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
                campaign.status = 'sending';
                await campaign.save();
                logger.log(`[Scheduler] Processing campaign: ${campaign.name} (ID: ${campaign._id})`);

                try {
                    await exports.executeSendCampaign(campaign._id); 
                } catch (executionError) {
                    logger.error(`[Scheduler Error] Failed to execute send for campaign ID ${campaign._id}:`, executionError);
                    // --- Sentry: Capture errors if executeSendCampaign fails to even start/complete ---
                    Sentry.captureException(executionError);
                    // --- END Sentry ---
                    try {
                        const failedCampaign = await Campaign.findById(campaign._id);
                        if (failedCampaign) {
                            failedCampaign.status = 'failed';
                            await failedCampaign.save();
                            logger.log(`[Scheduler] Campaign ${campaign._id} status set to 'failed' due to execution error.`);
                        }
                    } catch (dbUpdateError) {
                        logger.error(`[Scheduler] Failed to update status to 'failed' for campaign ${campaign._id}:`, dbUpdateError);
                        // --- Sentry: Capture errors if DB update fails here too ---
                        Sentry.captureException(dbUpdateError);
                        // --- END Sentry ---
                    }
                }
            }
        } catch (error) {
            logger.error('[Scheduler Error] Error during scheduled campaign check:', error);
            // --- Sentry: Capture top-level scheduler errors ---
            Sentry.captureException(error);
            // --- END Sentry ---
        }
    });

    logger.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
// emailxp/backend/utils/campaignScheduler.js

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
const List = require('../models/List'); // Ensure List model is imported if you need list details
const Subscriber = require('../models/Subscriber');
const { sendEmail } = require('../services/emailService');
// Removed cheerio as it's no longer directly used for tracking content modification here.
// If you use cheerio for other purposes in this file, keep it.
// const cheerio = require('cheerio'); // You can remove this line if it's not used elsewhere.

// BACKEND_URL for unsubscribe links
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
    let campaign;
    let successfulSends = 0;
    let failedSends = 0;

    logger.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`);

    try {
        campaign = await Campaign.findById(campaignId).populate('list');

        if (!campaign) {
            logger.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' (not found).`);
            return { success: false, message: 'Campaign not found.' };
        }

        logger.log(`[Scheduler] Campaign status check: ${campaign.status}`);

        if (campaign.status === 'sent' || campaign.status === 'failed') {
            logger.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has status '${campaign.status}'. Skipping re-send.`);
            return { success: false, message: `Campaign status is '${campaign.status}'. Cannot send.` };
        }

        campaign.status = 'sending';
        await campaign.save();

        const subscribers = await Subscriber.find({
            list: campaign.list._id,
            status: 'subscribed'
        });

        if (subscribers.length === 0) {
            logger.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no 'subscribed' members in list ${campaign.list.name}.`);
            campaign.status = 'sent';
            campaign.sentAt = new Date();
            campaign.emailsSuccessfullySent = 0; // Set to 0 if no subscribers to send to
            await campaign.save();
            return { success: true, message: 'No active subscribers found for this campaign. Campaign marked as sent.', successfulSends: 0 };
        }

        logger.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} active subscribers.`);

        try {
            const sendPromises = subscribers.map(async (subscriber) => {
                let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                let personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
                let personalizedSubject = campaign.subject.replace(/\{\{name\}\}/g, subscriber.name || 'there');

                const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}?campaignId=${campaign._id}`;

                // Append unsubscribe link to HTML and plain text.
                // SendGrid's native tracking will handle open/click tracking.
                personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
                personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

                logger.log(`[Scheduler] Prepare to call sendEmail for subscriber: ${subscriber.email}`);

                // --- UPDATED sendEmail call to include listId ---
                const result = await sendEmail(
                    subscriber.email,
                    personalizedSubject,
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id,
                    subscriber._id,
                    campaign.list._id // Pass the list ID here
                );
                // --- END UPDATED sendEmail call ---

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
                    }
                } else if (outcome.status === 'rejected') {
                    failedSends++;
                    logger.error(`[Scheduler] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
                }
            });

            campaign.status = successfulSends > 0 ? 'sent' : 'failed';
            campaign.sentAt = new Date();
            campaign.emailsSuccessfullySent = successfulSends;
            await campaign.save();

            logger.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
            return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

        } catch (innerSendingError) {
            logger.error(`[Scheduler] ERROR within sendPromises processing for campaign ID ${campaignId}:`, innerSendingError);
            campaign.status = 'failed';
            campaign.emailsSuccessfullySent = successfulSends;
            await campaign.save();
            logger.log(`[Scheduler] Campaign ${campaignId} status set to 'failed' due to inner sending error.`);
            return { success: false, message: `Error during email sending phase: ${innerSendingError.message}` };
        }

    } catch (outerCriticalError) {
        logger.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, outerCriticalError);

        if (campaignId) {
            try {
                if (campaign) {
                    campaign.status = 'failed';
                    campaign.emailsSuccessfullySent = successfulSends;
                    await campaign.save();
                } else {
                    await Campaign.findByIdAndUpdate(campaignId, { status: 'failed' });
                }
                logger.log(`[Scheduler] Campaign ${campaignId} status updated to 'failed' due to critical error.`);
            } catch (updateError) {
                logger.error(`[Scheduler] Failed to update campaign status to 'failed' after critical error for ID ${campaignId}:`, updateError);
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
        logger.warn('[Scheduler] Running scheduled campaign check...');
        const now = new Date();

        try {
            const campaignsToSend = await Campaign.find({
                status: 'scheduled',
                scheduledAt: { $lte: now }
            });

            if (campaignsToSend.length === 0) {
                logger.warn('[Scheduler] No campaigns due for sending.');
                return;
            }

            logger.warn(`[Scheduler] Found ${campaignsToSend.length} campaigns to send.`);

            for (const campaign of campaignsToSend) {
                campaign.status = 'sending';
                await campaign.save();
                logger.warn(`[Scheduler] Processing campaign: ${campaign.name} (ID: ${campaign._id})`);

                try {
                    await exports.executeSendCampaign(campaign._id);
                } catch (executionError) {
                    logger.error(`[Scheduler Error] Failed to execute send for campaign ID ${campaign._id}:`, executionError);
                    try {
                        const failedCampaign = await Campaign.findById(campaign._id);
                        if (failedCampaign) {
                            failedCampaign.status = 'failed';
                            await failedCampaign.save();
                            logger.log(`[Scheduler] Campaign ${campaign._id} status set to 'failed' due to execution error.`);
                        }
                    } catch (dbUpdateError) {
                        logger.error(`[Scheduler] Failed to update status to 'failed' for campaign ${campaign._id}:`, dbUpdateError);
                    }
                }
            }
        } catch (error) {
            logger.error('[Scheduler Error] Error during scheduled campaign check:', error);
        }
    });

    logger.warn('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
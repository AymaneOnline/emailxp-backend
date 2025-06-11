// emailxp/backend/utils/campaignScheduler.js

const cron = require('node-cron');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const { sendEmail } = require('../services/emailService'); // Your email service (sendEmail function)
const cheerio = require('cheerio'); // For HTML parsing in sendCampaign

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

const executeSendCampaign = async (campaignId) => {
    console.log(`[Scheduler] Attempting to execute send for campaign ID: ${campaignId}`);
    try {
        const campaign = await Campaign.findById(campaignId).populate('list');

        if (!campaign) {
            console.error(`[Scheduler Error] Campaign with ID ${campaignId} not found.`);
            return { success: false, message: 'Campaign not found.' };
        }

        if (campaign.status === 'sent' || campaign.status === 'sending') {
            console.warn(`[Scheduler Warn] Campaign ${campaign.name} (ID: ${campaign._id}) has status '${campaign.status}'. Skipping send execution.`);
            return { success: false, message: `Campaign status is '${campaign.status}'.` };
        }
        
        if (campaign.status === 'scheduled' && (!campaign.scheduledAt || campaign.scheduledAt > new Date())) {
            console.log(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) is scheduled for a future time. Skipping.`);
            return { success: false, message: 'Campaign not yet due.' };
        }

        const subscribers = await Subscriber.find({ list: campaign.list._id });

        if (subscribers.length === 0) {
            console.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no subscribers in list ${campaign.list.name}.`);
            campaign.status = 'sent'; 
            campaign.sentAt = new Date();
            await campaign.save();
            return { success: true, message: 'No subscribers found for this campaign. Campaign marked as sent.' };
        }

        campaign.status = 'sending';
        await campaign.save();
        console.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} subscribers.`);

        const sendPromises = subscribers.map(async (subscriber) => {
            let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            const personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

            const unsubscribeUrl = `${BACKEND_URL}/api/track/unsubscribe/${subscriber._id}/${campaign.list._id}`;
            personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
            personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

            try {
                // ADDED LOG: Log just before calling sendEmail to confirm execution reaches this point
                console.log(`[Scheduler] Prepare to call sendEmail for subscriber: ${subscriber.email} (Campaign: ${campaign._id})`);
                
                const result = await sendEmail(
                    subscriber.email,
                    campaign.subject,
                    personalizedHtml,
                    personalizedPlain,
                    campaign._id,
                    subscriber._id
                );
                // ADDED LOG: Log the result received back from sendEmail
                console.log(`[Scheduler] sendEmail for ${subscriber.email} returned:`, result);
                return result; // Return the result object directly for Promise.allSettled
            } catch (emailError) {
                // This catch block handles any synchronous errors within this map callback
                // or rejections from the sendEmail promise itself.
                console.error(`[Scheduler] Uncaught error while attempting to send email to ${subscriber.email} for campaign ${campaign._id}:`, emailError);
                return { success: false, message: 'Uncaught error during email send.', error: emailError.message };
            }
        });

        const results = await Promise.allSettled(sendPromises); 

        let successfulSends = 0;
        let failedSends = 0;

        // Iterate through results to correctly count successes and failures
        results.forEach(outcome => {
            if (outcome.status === 'fulfilled') {
                if (outcome.value && outcome.value.success) {
                    successfulSends++;
                } else {
                    // This covers cases where sendEmail returned success: false
                    failedSends++;
                    const errorMsg = outcome.value && outcome.value.message ? outcome.value.message : 'Unknown failure';
                    const errorObj = outcome.value && outcome.value.error ? outcome.value.error : 'No detailed error object from sendEmail';
                    console.error(`[Scheduler] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                }
            } else if (outcome.status === 'rejected') {
                // This covers cases where the promise itself was rejected (e.g., uncaught error in sendEmail)
                failedSends++;
                console.error(`[Scheduler] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
            }
        });

        campaign.status = successfulSends > 0 ? 'sent' : 'failed';
        campaign.sentAt = new Date();
        await campaign.save();

        console.log(`[Scheduler] Campaign "${campaign.name}" (ID: ${campaign._id}) sending completed. Sent: ${successfulSends}, Failed: ${failedSends}`);
        return { success: successfulSends > 0, message: 'Campaign sending completed.', totalSubscribers: subscribers.length, successfulSends, failedSends };

    } catch (error) {
        console.error(`[Scheduler] Critical error during executeSendCampaign for ID ${campaignId}:`, error);
        try {
            const campaign = await Campaign.findById(campaignId);
            if (campaign && campaign.status === 'sending') {
                 campaign.status = 'failed';
                 await campaign.save();
                 console.log(`[Scheduler] Campaign ${campaignId} status reverted to 'failed' due to critical error.`);
            }
        } catch (dbError) {
            console.error(`[Scheduler] Failed to update campaign status after critical error:`, dbError);
        }
        return { success: false, message: `An unexpected critical error occurred: ${error.message}` };
    }
};

module.exports.executeSendCampaign = executeSendCampaign;

const startCampaignScheduler = () => {
    cron.schedule('* * * * *', async () => {
        console.log('[Scheduler] Running scheduled campaign check...');
        const now = new Date();

        try {
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
                campaign.status = 'sending';
                await campaign.save();
                await executeSendCampaign(campaign._id);
            }
        } catch (error) {
            console.error('[Scheduler Error] Error during scheduled campaign check:', error);
        }
    });

    console.log('[Scheduler] Campaign scheduler started. Checking for campaigns every minute.');
};

module.exports.startCampaignScheduler = startCampaignScheduler;
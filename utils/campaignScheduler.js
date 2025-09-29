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
const Group = require('../models/Group'); // Ensure Group model is imported if you need group details
const Subscriber = require('../models/Subscriber');
const Segment = require('../models/Segment');
const { sendEmail } = require('../services/emailService');
const { addEmailJob, addCampaignBatchJob } = require('../services/queueServiceWrapper');
const { groupSubscribersByTimezone, calculateSendTime, getDefaultTimezone } = require('./timezoneService');
const { personalizeDynamicContent } = require('../services/personalizationService');
const domainAuthService = require('../services/domainAuthService');
const DomainAuthentication = require('../models/DomainAuthentication');
const { buildFromAddress } = require('./fromAddress');

// BACKEND_URL for unsubscribe links
const BACKEND_URL = process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';


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
        campaign = await Campaign.findById(campaignId).populate('group');

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

        // Re-validate primary sending domain before proceeding
        let primaryDomainAuth = await DomainAuthentication.findOne({ user: campaign.user, isPrimary: true }).lean();
        if (primaryDomainAuth) {
            try {
                primaryDomainAuth = await domainAuthService.verifyDns(primaryDomainAuth);
            } catch (e) {
                logger.warn('[Scheduler] DNS re-check failed', { domain: primaryDomainAuth?.domain, error: e.message });
            }
        }
        if (!primaryDomainAuth || primaryDomainAuth.status !== 'verified') {
            campaign.status = 'failed';
            campaign.domainRetry = campaign.domainRetry || {};
            if (!campaign.domainRetry.firstBlockedAt) campaign.domainRetry.firstBlockedAt = new Date();
            campaign.domainRetry.lastBlockedCode = 'DOMAIN_NOT_VERIFIED';
            campaign.domainRetry.pendingAutoRetry = true;
            await campaign.save();
            return { success: false, message: 'Primary sending domain is not verified. Re-verify DNS records before sending.', errorCode: 'DOMAIN_NOT_VERIFIED', autoRetry: true };
        }

        // Ensure campaign.fromEmail matches current verified primary domain
        if (!campaign.fromEmail || !campaign.fromEmail.endsWith(`@${primaryDomainAuth.domain}`)) {
            try {
                const fromData = await buildFromAddress(campaign.user);
                campaign.fromEmail = fromData.email;
                if (!campaign.fromName && fromData.from) {
                    campaign.fromName = fromData.from.split('<')[0].trim();
                }
            } catch (e) {
                campaign.status = 'failed';
                await campaign.save();
                return { success: false, message: e.message || 'Unable to derive verified From address.', errorCode: 'DOMAIN_BUILD_FROM_FAILED' };
            }
        }
        campaign.status = 'sending';
        await campaign.save();

        // Build recipient query from groups, segments, and individual subscribers
        const selectedGroupIds = (Array.isArray(campaign.groups) && campaign.groups.length > 0)
            ? campaign.groups
            : [campaign.group && campaign.group._id ? campaign.group._id : campaign.group].filter(Boolean);
        const primaryGroupId = selectedGroupIds[0] || null;
        const individualIds = Array.isArray(campaign.individualSubscribers) ? campaign.individualSubscribers : [];
        const segmentIds = Array.isArray(campaign.segments) ? campaign.segments : [];

        // Load segments to translate their filters into query clauses
        const segments = segmentIds.length > 0
            ? await Segment.find({ _id: { $in: segmentIds }, user: campaign.user })
            : [];

        // Build $or sub-clauses
        const orClauses = [];
        if (selectedGroupIds.length > 0) {
            orClauses.push({ groups: { $in: selectedGroupIds } });
        }
        if (individualIds.length > 0) {
            orClauses.push({ _id: { $in: individualIds } });
        }
        if (segments.length > 0) {
            for (const segment of segments) {
                const segmentQuery = segment.buildQuery();
                if (segmentQuery && Object.keys(segmentQuery).length > 0) {
                    orClauses.push(segmentQuery);
                }
            }
        }

        // Validate at least one category selected
        if (orClauses.length === 0) {
            logger.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) has no recipient categories selected.`);
            campaign.status = 'draft';
            campaign.totalRecipients = 0;
            await campaign.save();
            return { success: false, message: 'No recipients selected. Please choose groups, segments, or subscribers before sending.' };
        }

        // Final query applying base conditions to all recipients
        const finalQuery = {
            user: campaign.user,
            status: 'subscribed', // Excludes 'pending' double opt-in
            isDeleted: false,
            $or: orClauses
        };

        const totalRecipients = await Subscriber.countDocuments(finalQuery);
        campaign.totalRecipients = totalRecipients;
        await campaign.save();

        if (totalRecipients === 0) {
            logger.warn(`[Scheduler] Campaign ${campaign.name} (ID: ${campaign._id}) resolved 0 recipients.`);
            campaign.status = 'draft';
            campaign.sentAt = null;
            campaign.emailsSuccessfullySent = 0;
            await campaign.save();
            return { success: false, message: 'No active subscribers matched the selection. Sending aborted.', successfulSends: 0 };
        }

        // Fetch recipients (projection to reduce memory)
        const subscribers = await Subscriber.find(finalQuery).select('_id email name').lean();
        logger.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} active subscribers.`);

        logger.log(`[Scheduler] Initiating send for campaign: "${campaign.name}" (ID: ${campaign._id}) to ${subscribers.length} active subscribers.`);

        // Check if this is subscriber-local timezone scheduling
        const isSubscriberLocal = campaign.scheduleType === 'subscriber_local';
        
        if (isSubscriberLocal) {
            // Group subscribers by timezone and queue batches
            const timezoneGroups = groupSubscribersByTimezone(subscribers);
            logger.log(`[Scheduler] Subscriber-local scheduling: ${timezoneGroups.size} timezone groups`);
            
            for (const [timezone, timezoneSubscribers] of timezoneGroups) {
                const sendTime = calculateSendTime(
                    campaign.scheduledAt || new Date(),
                    timezone,
                    campaign.scheduleTimezone || 'UTC'
                );
                
                // Prepare batch data
                const batchData = {
                    campaignId: campaign._id,
                    subscribers: timezoneSubscribers,
                    timezone,
                    subject: campaign.subject,
                    htmlContent: campaign.htmlContent,
                    plainTextContent: campaign.plainTextContent,
                    groupId: primaryGroupId,
                    fromEmail: campaign.fromEmail,
                    fromName: campaign.fromName,
                };
                
                // Calculate delay for this timezone
                const delay = Math.max(0, sendTime.getTime() - Date.now());
                
                try {
                    await addCampaignBatchJob(batchData, { delay });
                    logger.log(`[Scheduler] Queued batch for timezone ${timezone}: ${timezoneSubscribers.length} subscribers, delay: ${delay}ms`);
                } catch (error) {
                    logger.error(`[Scheduler] Failed to queue batch for timezone ${timezone}:`, error);
                    failedSends += timezoneSubscribers.length;
                }
            }
            
            successfulSends = subscribers.length - failedSends;
        } else {
            // Standard immediate sending - use Redis queue for better reliability
            const emailJobs = subscribers.map(subscriber => {
                // Safety: skip any subscriber that might no longer be subscribed
                if (subscriber.status && subscriber.status !== 'subscribed') return null;
                // Get subscriber's custom fields and location data
                const subscriberData = {
                    name: subscriber.name || '',
                    email: subscriber.email,
                    firstName: subscriber.name ? subscriber.name.split(' ')[0] : '',
                    lastName: subscriber.name && subscriber.name.split(' ').length > 1 ? subscriber.name.split(' ').slice(1).join(' ') : '',
                    location: subscriber.location || {},
                    customFields: subscriber.customFields || {}
                };
                
                let personalizedHtml = campaign.htmlContent;
                let personalizedPlain = campaign.plainTextContent;
                let personalizedSubject = campaign.subject;
                
                // Apply standard personalization
                personalizedSubject = personalizedSubject.replace(/\{\{name\}\}/g, subscriberData.name || 'there');
                
                // Apply dynamic content personalization
                // Extract dynamic blocks from campaign template if available
                let dynamicBlocks = [];
                if (campaign.template && campaign.template.structure && campaign.template.structure.blocks) {
                    dynamicBlocks = campaign.template.structure.blocks.filter(block => block.type === 'dynamic');
                }
                
                personalizedHtml = personalizeDynamicContent(personalizedHtml, subscriberData, dynamicBlocks);
                
                return {
                    toEmail: subscriber.email, // Send to actual subscriber email
                    subject: personalizedSubject,
                    htmlContent: personalizedHtml,
                    plainTextContent: personalizedPlain,
                    campaignId: campaign._id,
                    subscriberId: subscriber._id,
                    groupId: primaryGroupId,
                    fromEmail: campaign.fromEmail,
                    fromName: campaign.fromName || 'EmailXP',
                };
            });
            
            // Queue all email jobs
            const filteredJobs = emailJobs.filter(Boolean);
            const sendResults = await Promise.allSettled(
                filteredJobs.map(emailData => addEmailJob(emailData))
            );
            
            // Count successful queuing (not actual sending)
            sendResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    successfulSends++;
                } else {
                    failedSends++;
                    logger.error(`[Scheduler] Failed to queue email:`, result.reason);
                }
            });
        }

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




// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const OpenEvent = require('../models/OpenEvent'); // Make sure OpenEvent model is correctly imported
const ClickEvent = require('../models/ClickEvent'); // Make sure ClickEvent model is correctly imported
const Template = require('../models/Template');

const mongoose = require('mongoose');

const { executeSendCampaign } = require('../utils/campaignScheduler');

const sgMail = require('@sendgrid/mail'); // <--- NEW: Import SendGrid Mail
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // <--- NEW: Set SendGrid API Key from environment variable

// @desc    Get all campaigns for the authenticated user
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
    const campaigns = await Campaign.find({ user: req.user.id })
        .populate('list', 'name')
        .populate('template', 'name subject');
    res.status(200).json(campaigns);
});

// @desc    Create a new campaign
// @route   POST /api/campaigns
// @access  Private
const createCampaign = asyncHandler(async (req, res) => {
    const { name, subject, htmlContent, plainTextContent, list: listId, status, scheduledAt, templateId } = req.body;

    if (!name || !listId) {
        res.status(400);
        throw new Error('Please include campaign name and target list.');
    }

    const targetList = await List.findById(listId);
    if (!targetList) {
        res.status(404);
        throw new Error('Target list not found');
    }
    if (targetList.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to use this list for campaigns');
    }

    let finalSubject = subject;
    let finalHtmlContent = htmlContent;
    let finalPlainTextContent = plainTextContent;
    let usedTemplateId = null;

    if (templateId) {
        const template = await Template.findById(templateId);
        if (!template) {
            res.status(404);
            throw new Error('Selected template not found');
        }
        usedTemplateId = template._id;
        finalSubject = template.subject;
        finalHtmlContent = template.htmlContent;
        finalPlainTextContent = template.plainTextContent || '';
    } else {
        if (!subject || !htmlContent) {
            res.status(400);
            throw new Error('Please provide subject and HTML content for the campaign, or select a template.');
        }
    }

    const campaign = await Campaign.create({
        user: req.user.id,
        list: listId,
        name,
        subject: finalSubject,
        htmlContent: finalHtmlContent,
        plainTextContent: finalPlainTextContent,
        status: status || 'draft',
        scheduledAt: scheduledAt || null,
        template: usedTemplateId,
    });

    res.status(201).json(campaign);
});

// @desc    Get a single campaign by ID for the authenticated user
// @route   GET /api/campaigns/:id
// @access  Private
const getCampaignById = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id)
        .populate('list', 'name')
        .populate('template', 'name subject htmlContent plainTextContent');

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view this campaign');
    }

    res.status(200).json(campaign);
});

// @desc    Update a campaign
// @route   PUT /api/campaigns/:id
// @access  Private
const updateCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update this campaign');
    }

    const { list: listId, templateId, ...updateFields } = req.body;

    // Handle list update
    if (listId) {
        const newList = await List.findById(listId);
        if (!newList || newList.user.toString() !== req.user.id) {
            res.status(400);
            throw new Error('Invalid or unauthorized target list provided');
        }
        campaign.list = listId;
    }

    // Handle template update and apply content
    if (templateId !== undefined) {
        if (templateId === null || templateId === '') {
            campaign.template = null;
        } else {
            const template = await Template.findById(templateId);
            if (!template) {
                res.status(404);
                throw new Error('Selected template not found');
            }
            campaign.template = template._id;
            campaign.subject = template.subject;
            campaign.htmlContent = template.htmlContent;
            campaign.plainTextContent = template.plainTextContent || '';
        }
    }

    // Apply other direct update fields (name, subject, htmlContent, plainTextContent)
    if (updateFields.name !== undefined) campaign.name = updateFields.name;

    if (templateId === null || templateId === '' || updateFields.subject !== undefined) {
        campaign.subject = updateFields.subject !== undefined ? updateFields.subject : campaign.subject;
    }
    if (templateId === null || templateId === '' || updateFields.htmlContent !== undefined) {
        campaign.htmlContent = updateFields.htmlContent !== undefined ? updateFields.htmlContent : campaign.htmlContent;
    }
    if (templateId === null || templateId === '' || updateFields.plainTextContent !== undefined) {
        campaign.plainTextContent = updateFields.plainTextContent !== undefined ? updateFields.plainTextContent : campaign.plainTextContent;
    }


    // --- CRITICAL LOGIC FOR STATUS AND SCHEDULED_AT ---
    if (updateFields.scheduledAt !== undefined) {
        campaign.scheduledAt = updateFields.scheduledAt;
    }

    const now = new Date();
    const currentScheduledAt = campaign.scheduledAt ? new Date(campaign.scheduledAt) : null;

    if (currentScheduledAt && currentScheduledAt > now) {
        campaign.status = 'scheduled';
    } else if (campaign.status === 'scheduled' || campaign.status === 'draft') {
        campaign.status = 'draft';
    }
    else if (updateFields.status !== undefined &&
        !['scheduled', 'draft'].includes(updateFields.status) &&
        !['sent', 'sending', 'cancelled', 'failed'].includes(campaign.status)) {
        campaign.status = updateFields.status;
    }
    // --- END CRITICAL LOGIC FOR STATUS AND SCHEDULED_AT ---

    const updatedCampaign = await campaign.save();

    res.status(200).json(updatedCampaign);
});

// @desc    Delete a campaign
// @route   DELETE /api/campaigns/:id
// @access  Private
const deleteCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete this campaign');
    }

    await campaign.deleteOne();

    res.status(200).json({ id: req.params.id, message: 'Campaign deleted successfully' });
});

// @desc    Manually send a campaign to its associated list subscribers immediately
// @route   POST /api/campaigns/:id/send
// @access  Private
const sendCampaignManually = asyncHandler(async (req, res) => {
    const campaignId = req.params.id;

    const campaign = await Campaign.findById(campaignId).populate('list'); // Populate list to get subscribers

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to send this campaign');
    }

    if (campaign.status === 'sent' || campaign.status === 'sending' || campaign.status === 'failed' || campaign.status === 'cancelled') {
        res.status(400);
        throw new Error(`Campaign cannot be sent because its current status is '${campaign.status}'.`);
    }

    // Get subscribers from the associated list
    const subscribers = await Subscriber.find({ list: campaign.list._id, status: 'subscribed' });

    if (subscribers.length === 0) {
        res.status(400);
        throw new Error('No active subscribers found in the target list to send the campaign to.');
    }

    campaign.status = 'sending';
    campaign.lastSentAt = new Date(); // Record when sending started
    campaign.totalRecipients = subscribers.length; // Set total recipients
    await campaign.save();

    let successfulSends = 0;
    const messages = subscribers.map(subscriber => {
        // --- IMPORTANT: ADD CUSTOM_ARGS FOR WEBHOOK TRACKING ---
        // These custom_args will be included in the SendGrid webhook event payload
        // This is how you link a webhook event back to a specific campaign in your DB
        const customArgs = {
            campaign_id: campaignId.toString(),
            subscriber_id: subscriber._id.toString(),
            list_id: campaign.list._id.toString()
        };

        return {
            to: subscriber.email,
            from: process.env.SENDGRID_SENDER_EMAIL, // Ensure this is set in your .env
            subject: campaign.subject,
            html: campaign.htmlContent,
            text: campaign.plainTextContent || '',
            // Add custom arguments to the email
            custom_args: customArgs,
            // Enable click tracking (already likely enabled in SendGrid settings, but good to be explicit)
            trackingSettings: {
                clickTracking: {
                    enable: true,
                    enableText: true,
                },
                openTracking: {
                    enable: true,
                },
            },
        };
    });

    try {
        const [response] = await sgMail.send(messages);
        console.log('SendGrid API Response:', response.statusCode);

        if (response.statusCode >= 200 && response.statusCode < 300) {
            successfulSends = messages.length; // Assume all were accepted by SendGrid API
            campaign.status = 'sent';
            campaign.emailsSent = successfulSends; // Update emailsSent count
            await campaign.save();
            res.status(200).json({
                message: 'Campaign sending initiated successfully!',
                totalSubscribers: subscribers.length,
                emailsSent: successfulSends,
            });
        } else {
            console.error('SendGrid API returned a non-2xx status:', response.body);
            campaign.status = 'failed';
            await campaign.save();
            res.status(response.statusCode).json({
                message: 'SendGrid API failed to accept emails.',
                error: response.body,
            });
        }
    } catch (sendgridError) {
        console.error('Error sending campaign via SendGrid:', sendgridError.response?.body || sendgridError.message);
        campaign.status = 'failed';
        await campaign.save();
        res.status(500).json({
            message: 'Failed to send campaign due to SendGrid error.',
            error: sendgridError.response?.body || sendgridError.message,
        });
    }
});


// @desc    Get Open Statistics for a Specific Campaign
// @route   GET /api/campaigns/:id/opens
// @access  Private
const getCampaignOpenStats = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return res.status(400).json({ message: 'Invalid Campaign ID format.' });
    }

    const campaign = await Campaign.findOne({ _id: campaignId, user: req.user.id });

    if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found or unauthorized.' });
    }

    const totalOpens = await OpenEvent.countDocuments({ campaign: campaignId });
    const uniqueOpens = (await OpenEvent.distinct('subscriber', { campaign: campaignId })).length;

    res.status(200).json({
        campaignId: campaignId,
        totalOpens: totalOpens,
        uniqueOpens: uniqueOpens,
    });
});

// @desc    Get click statistics for a campaign
// @route   GET /api/campaigns/:id/clicks
// @access  Private
const getCampaignClickStats = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return res.status(400).json({ message: 'Invalid Campaign ID format.' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found.' });
    }
    if (campaign.user.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized to view stats for this campaign.' });
    }

    const totalClicks = await ClickEvent.countDocuments({ campaign: campaignId });
    const uniqueClicks = (await ClickEvent.distinct('subscriber', { campaign: campaignId })).length;

    res.status(200).json({
        campaignId: campaignId,
        totalClicks,
        uniqueClicks
    });
});

// @desc    Get aggregate dashboard statistics for the authenticated user
// @route   GET /api/campaigns/dashboard-stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Total Campaigns Sent
        const totalCampaignsSent = await Campaign.countDocuments({
            user: userId,
            status: 'sent'
        });

        // 2. Total Emails Sent (accurate by summing 'emailsSent' from Campaign model)
        const allSentCampaigns = await Campaign.find({ user: userId, status: 'sent' }).select('emailsSent').lean();
        const totalEmailsSent = allSentCampaigns.reduce((sum, campaign) => sum + (campaign.emailsSent || 0), 0);

        // 3. Overall Unique Opens (from Campaign model aggregate)
        const totalUniqueOpens = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } }, // Match campaigns for the user
            { $group: { _id: null, total: { $sum: "$opens" } } } // Sum the 'opens' field from Campaign model
        ]))[0]?.total || 0;


        // 4. Overall Unique Clicks (from Campaign model aggregate)
        const totalUniqueClicks = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } }, // Match campaigns for the user
            { $group: { _id: null, total: { $sum: "$clicks" } } } // Sum the 'clicks' field from Campaign model
        ]))[0]?.total || 0;


        // --- NEW: Include bounced, unsubscribed, complaint counts in dashboard stats ---
        const totalBounced = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } }, // No status filter here, count bounces regardless if campaign is 'sent'
            { $group: { _id: null, total: { $sum: "$bouncedCount" } } }
        ]))[0]?.total || 0;

        const totalUnsubscribed = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, total: { $sum: "$unsubscribedCount" } } }
        ]))[0]?.total || 0;

        const totalComplaints = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, total: { $sum: "$complaintCount" } } }
        ]))[0]?.total || 0;
        // --- END NEW ---

        // Calculate rates
        const overallOpenRate = totalEmailsSent > 0 ? ((totalUniqueOpens / totalEmailsSent) * 100).toFixed(2) : '0.00';
        const overallClickRate = totalEmailsSent > 0 ? ((totalUniqueClicks / totalEmailsSent) * 100).toFixed(2) : '0.00';

        res.status(200).json({
            totalCampaignsSent,
            totalEmailsSent,
            totalUniqueOpens,
            totalUniqueClicks,
            overallOpenRate,
            overallClickRate,
            totalBounced,
            totalUnsubscribed,
            totalComplaints,
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server Error: Failed to fetch dashboard statistics' });
    }
});

// --- NEW: Get detailed analytics for a specific campaign ---
// @desc    Get detailed analytics for a specific campaign
// @route   GET /api/campaigns/:id/analytics
// @access  Private
const getCampaignAnalytics = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        return res.status(400).json({ message: 'Invalid Campaign ID format.' });
    }

    const campaign = await Campaign.findById(campaignId);

    if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found.' });
    }

    // Check authorization
    if (campaign.user.toString() !== req.user.id) {
        return res.status(401).json({ message: 'Not authorized to view analytics for this campaign.' });
    }

    const totalEmailsSent = campaign.emailsSent || 0; // Use the stored count from Campaign model

    // Fetch counts from Campaign model (updated by webhook)
    const totalOpens = campaign.opens || 0;
    const uniqueOpens = campaign.opens || 0; // For now, assuming campaign.opens represents unique for simplicity. Refine if needed.

    const totalClicks = campaign.clicks || 0;
    const uniqueClicks = campaign.clicks || 0; // For now, assuming campaign.clicks represents unique for simplicity. Refine if needed.

    // --- NEW: Include bounced, unsubscribed, complaint counts for a specific campaign ---
    const bouncedCount = campaign.bouncedCount || 0;
    const unsubscribedCount = campaign.unsubscribedCount || 0;
    const complaintCount = campaign.complaintCount || 0;
    // --- END NEW ---

    // Calculate rates, ensuring no division by zero
    const openRate = totalEmailsSent > 0 ? ((uniqueOpens / totalEmailsSent) * 100).toFixed(2) : "0.00";
    const clickRate = totalEmailsSent > 0 ? ((uniqueClicks / totalEmailsSent) * 100).toFixed(2) : "0.00";
    // Click-Through Rate (CTR): unique clicks / unique opens
    const clickThroughRate = uniqueOpens > 0 ? ((uniqueClicks / uniqueOpens) * 100).toFixed(2) : "0.00";

    res.status(200).json({
        campaignId: campaign._id,
        campaignName: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        sentAt: campaign.lastSentAt,
        totalEmailsSent,
        totalOpens,
        uniqueOpens,
        totalClicks,
        uniqueClicks,
        openRate,
        clickRate,
        clickThroughRate,
        bouncedCount,
        unsubscribedCount,
        complaintCount,
    });
});
// --- END NEW ---

// @desc    Handle SendGrid Event Webhooks
// @route   POST /api/campaigns/webhooks/sendgrid
// @access  Public (called by SendGrid)
const handleSendGridWebhook = asyncHandler(async (req, res) => {
    // SendGrid sends an array of event objects
    const events = req.body;
    console.log(`[Webhook] Received SendGrid events: ${events.length} events`);

    for (const event of events) {
        try {
            const email = event.email;
            const eventType = event.event;
            // SendGrid custom_args payload comes as an object, extract from it
            // Ensure these match the keys sent in custom_args in sendCampaignManually
            const campaignId = event.campaign_id;
            const subscriberId = event.subscriber_id;
            const listId = event.list_id;

            console.log(`[Webhook] Processing event: ${eventType} for ${email}, Campaign ID: ${campaignId}, Subscriber ID: ${subscriberId}, List ID: ${listId}`);

            // Find the subscriber using subscriberId and listId for precision
            const subscriber = await Subscriber.findOne({ _id: subscriberId, list: listId });

            if (!subscriber) {
                console.log(`[Webhook] Subscriber with ID ${subscriberId} not found for list ${listId}. Skipping event.`);
                continue; // Skip to the next event
            }

            // Find the campaign (if campaignId is available and valid)
            let campaign = null;
            if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
                campaign = await Campaign.findById(campaignId);
            } else {
                console.log(`[Webhook] Invalid or missing campaignId for event: ${JSON.stringify(event)}. Campaign stats will not be updated.`);
            }

            switch (eventType) {
                case 'bounce':
                    subscriber.status = 'bounced';
                    if (campaign) campaign.bouncedCount = (campaign.bouncedCount || 0) + 1;
                    console.log(`[Webhook] Subscriber ${email} marked as bounced.`);
                    break;
                case 'spamreport':
                    subscriber.status = 'complaint';
                    if (campaign) campaign.complaintCount = (campaign.complaintCount || 0) + 1;
                    console.log(`[Webhook] Subscriber ${email} marked as spam complaint.`);
                    break;
                case 'unsubscribe':
                    subscriber.status = 'unsubscribed';
                    if (campaign) campaign.unsubscribedCount = (campaign.unsubscribedCount || 0) + 1;
                    console.log(`[Webhook] Subscriber ${email} marked as unsubscribed.`);
                    break;
                case 'click':
                    // These fields should be incremented via the webhook to stay real-time
                    if (campaign) campaign.clicks = (campaign.clicks || 0) + 1;
                    // You might also want to log ClickEvent here if you were not previously doing so via middleware
                    console.log(`[Webhook] Subscriber ${email} clicked.`);
                    break;
                case 'open':
                    // These fields should be incremented via the webhook to stay real-time
                    if (campaign) campaign.opens = (campaign.opens || 0) + 1;
                    // You might also want to log OpenEvent here if you were not previously doing so via middleware
                    console.log(`[Webhook] Subscriber ${email} opened.`);
                    break;
                case 'delivered':
                    // You could track delivery count here if needed
                    console.log(`[Webhook] Email to ${email} delivered.`);
                    break;
                // Add other event types you want to track, e.g., 'processed', 'dropped', 'deferred'
                default:
                    console.log(`[Webhook] Unhandled event type: ${eventType}`);
                    break;
            }

            await subscriber.save();
            if (campaign) await campaign.save();

        } catch (error) {
            console.error(`[Webhook Error] Failed to process event: ${JSON.stringify(event)}. Error: ${error.message}`);
            // Do not res.status(500) here. SendGrid expects a 200 OK for successful receipt of the batch.
            // Any other status code will cause SendGrid to retry, potentially leading to duplicates.
        }
    }

    // SendGrid expects a 200 OK response to confirm successful receipt of events.
    res.status(200).send('Event Webhook received');
});

// Make sure to export all functions that are used in your routes
module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually, // Exporting the renamed function
    getCampaignOpenStats,
    getCampaignClickStats,
    getDashboardStats,
    getCampaignAnalytics,
    handleSendGridWebhook, // The new webhook handler
};
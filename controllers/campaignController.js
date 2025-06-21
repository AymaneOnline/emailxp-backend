// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');

// REMOVED: OpenEvent and ClickEvent imports as these models do not exist
// const OpenEvent = require('../models/OpenEvent');
// const ClickEvent = require('../models/ClickEvent');

const Template = require('../models/Template');

const mongoose = require('mongoose');

// Import emailService.js here
const { sendEmail } = require('../services/emailService');

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
    let finalPlainTextContent = plainTextContent; // Keep this variable name consistent for clarity
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
    // --- END CRITICAL LOGIC FOR STATUS AND SCHEDULEED_AT ---

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

    // REMOVED: Deletion of OpenEvent and ClickEvent records
    // since these models do not exist and analytics are stored directly on Campaign model.
    await campaign.deleteOne();

    res.status(200).json({ id: req.params.id, message: 'Campaign deleted successfully' });
});

// @desc    Manually send a campaign to its associated list subscribers immediately
// @route   POST /api/campaigns/:id/send
// @access  Private
const sendCampaignManually = asyncHandler(async (req, res) => {
    const campaignId = req.params.id;

    // Populate list to get subscribers from it
    const campaign = await Campaign.findById(campaignId).populate('list');

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

    console.log(`[DEBUG - CampaignController] Attempting to send campaign "${campaign.name}" (ID: ${campaignId})`);
    console.log(`[DEBUG - CampaignController] Campaign's target list: ${campaign.list ? campaign.list.name : 'N/A'} (ID: ${campaign.list ? campaign.list._id : 'N/A'})`);

    if (!process.env.SENDGRID_SENDER_EMAIL || process.env.SENDGRID_SENDER_EMAIL.trim() === '') {
        console.error(`[ERROR] SENDGRID_SENDER_EMAIL is not configured or is empty. Current value: "${process.env.SENDGRID_SENDER_EMAIL}"`);
        res.status(500);
        throw new Error('SendGrid sender email (SENDGRID_SENDER_EMAIL) is not configured in environment variables. Please set it.');
    }
    console.log(`[DEBUG - CampaignController] SENDGRID_SENDER_EMAIL env var: "${process.env.SENDGRID_SENDER_EMAIL}"`);

    // Get subscribers from the associated list with status 'subscribed'
    const subscribers = await Subscriber.find({ list: campaign.list._id, status: 'subscribed' });

    console.log(`[DEBUG - CampaignController] Found ${subscribers.length} subscribers with status 'subscribed' for list ID: ${campaign.list._id}`);
    if (subscribers.length === 0) {
        res.status(400);
        throw new Error(`The list "${campaign.list.name}" has no active subscribers. Please add subscribers to the list before sending this campaign.`);
    }

    // Update campaign status to 'sending' and save immediately
    campaign.status = 'sending';
    campaign.lastSentAt = new Date();
    campaign.totalRecipients = subscribers.length;
    await campaign.save();

    let successfulSends = 0;
    let failedSends = 0;

    try {
        const sendPromises = subscribers.map(async (subscriber) => {
            // Personalize content
            const personalizedSubject = campaign.subject.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            let personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

            // Add unsubscribe link dynamically
            const unsubscribeUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/track/unsubscribe/${subscriber._id}?campaignId=${campaign._id}`;
            personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
            personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

            // --- CRITICAL CALL TO emailService.sendEmail ---
            console.log('############# BEFORE CALLING emailService.sendEmail IN CONTROLLER #############');
            console.log(`[Controller Caller] Subscriber Email: ${subscriber.email}`);
            console.log(`[Controller Caller] HTML Content length (after personalization): ${personalizedHtml ? personalizedHtml.length : 'N/A'}`);
            console.log(`[Controller Caller] Plain Text Content length (after personalization, before emailService): ${personalizedPlain ? personalizedPlain.length : 'N/A'}`);
            // Log the actual function's source as seen by this controller
            console.log('[Controller Caller] Source of emailService.sendEmail function:\n', sendEmail.toString());
            console.log('###################################################################');

            const result = await sendEmail(
                subscriber.email,
                personalizedSubject,
                personalizedHtml,
                personalizedPlain, // Pass the personalized content, emailService will handle fallback if still empty
                campaign._id,
                subscriber._id,
                campaign.list._id // Pass the list ID for SendGrid custom_args
            );

            console.log(`[DEBUG - CampaignController] sendEmail for ${subscriber.email} returned:`, result);
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
                    console.error(`[CampaignController] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                }
            } else if (outcome.status === 'rejected') {
                failedSends++;
                console.error(`[CampaignController] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
            }
        });

        campaign.status = successfulSends > 0 ? 'sent' : 'failed';
        campaign.emailsSent = successfulSends;
        await campaign.save();

        res.status(200).json({
            message: 'Campaign sending initiated. Check logs for details.',
            totalSubscribers: subscribers.length,
            successfulSends: successfulSends,
            failedSends: failedSends,
        });

    } catch (error) {
        console.error('[CampaignController] Error sending campaign:', error.response?.body || error.message);
        campaign.status = 'failed';
        await campaign.save();
        res.status(500).json({
            message: 'Failed to send campaign.',
            error: error.response?.body || error.message,
        });
    }
});


// REMOVED: getCampaignOpenStats and getCampaignClickStats functions
// These were relying on the old OpenEvent/ClickEvent models.
// Analytics are now directly derived from the Campaign model's 'opens' and 'clicks' fields,
// which are updated by the SendGrid webhook handler.


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
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, total: { $sum: "$opens" } } }
        ]))[0]?.total || 0;


        // 4. Overall Unique Clicks (from Campaign model aggregate)
        const totalUniqueClicks = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: null, total: { $sum: "$clicks" } } }
        ]))[0]?.total || 0;


        // --- NEW: Include bounced, unsubscribed, complaint counts in dashboard stats ---
        const totalBounced = (await Campaign.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
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
        totalOpens, // assuming uniqueOpens for now as you had it as totalOpens in your example
        totalClicks,
        uniqueClicks, // assuming uniqueClicks for now as you had it as totalClicks in your example
        openRate,
        clickRate,
        clickThroughRate,
        bouncedCount,
        unsubscribedCount,
        complaintCount,
    });
});
// --- END NEW ---

// REMOVED: handleSendGridWebhook function from here.
// This logic now resides in emailxp/backend/controllers/trackingController.js
// which is mounted at /api/track/webhook in server.js.

module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually, // Export the refactored function
    // REMOVED exports for getCampaignOpenStats and getCampaignClickStats
    getDashboardStats,
    getCampaignAnalytics,
    // REMOVED export for handleSendGridWebhook
};
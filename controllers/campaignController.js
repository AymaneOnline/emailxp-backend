// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');
const Template = require('../models/Template');

const mongoose = require('mongoose');

const { executeSendCampaign } = require('../utils/campaignScheduler');

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

    const campaign = await Campaign.findById(campaignId);

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

    campaign.status = 'sending';
    await campaign.save();

    const sendResult = await executeSendCampaign(campaignId);

    if (sendResult.success) {
        res.status(200).json({
            message: sendResult.message,
            totalSubscribers: sendResult.totalSubscribers,
            emailsSent: sendResult.successfulSends,
        });
    } else {
        res.status(500).json({
            message: sendResult.message || 'Failed to send campaign due to an internal error.',
            error: sendResult.error || 'Unknown error during campaign send.',
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

// --- NEW: Get Dashboard Analytics Statistics ---
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

        // 2. Total Emails Sent (accurate by summing 'emailsSuccessfullySent' from Campaign model)
        const allSentCampaigns = await Campaign.find({ user: userId, status: 'sent' }).select('emailsSuccessfullySent').lean();
        const totalEmailsSent = allSentCampaigns.reduce((sum, campaign) => sum + (campaign.emailsSuccessfullySent || 0), 0);

        // 3. Overall Unique Opens
        const totalUniqueOpens = (await OpenEvent.distinct('subscriber', { user: userId })).length;

        // 4. Overall Unique Clicks
        const totalUniqueClicks = (await ClickEvent.distinct('subscriber', { user: userId })).length;

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
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ message: 'Server Error: Failed to fetch dashboard statistics' });
    }
});

module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually,
    getCampaignOpenStats,
    getCampaignClickStats,
    getDashboardStats, // <--- ADDED: Export new dashboard stats function
};
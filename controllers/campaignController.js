// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const OpenEvent = require('../models/OpenEvent'); // Import OpenEvent model for tracking opens
const ClickEvent = require('../models/ClickEvent');
const Template = require('../models/Template'); // <--- NEW: Import Template Model

const mongoose = require('mongoose');

const { executeSendCampaign } = require('../utils/campaignScheduler');

// @desc    Get all campaigns for the authenticated user
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
    // Populate 'list' for list name and 'template' for template details
    const campaigns = await Campaign.find({ user: req.user.id })
        .populate('list', 'name')
        .populate('template', 'name subject'); // <--- UPDATED: Populate template name and subject
    res.status(200).json(campaigns);
});

// @desc    Create a new campaign
// @route   POST /api/campaigns
// @access  Private
const createCampaign = asyncHandler(async (req, res) => {
    // --- UPDATED: Accept templateId in request body ---
    const { name, subject, htmlContent, plainTextContent, list: listId, status, scheduledAt, templateId } = req.body;

    if (!name || !listId) { // htmlContent and subject might come from template, so make them not required here.
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

    // If templateId is provided, fetch template content
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
        // If the user provided subject/content in the request *along with* a templateId,
        // you might decide whether to override template content with user-provided,
        // or prioritize template. For now, template takes precedence if templateId is present.
    } else {
        // If no templateId, then htmlContent and subject are required from the request body
        if (!subject || !htmlContent) {
            res.status(400);
            throw new Error('Please provide subject and HTML content for the campaign, or select a template.');
        }
    }

    const campaign = await Campaign.create({
        user: req.user.id,
        list: listId,
        name,
        subject: finalSubject,         // <--- UPDATED
        htmlContent: finalHtmlContent, // <--- UPDATED
        plainTextContent: finalPlainTextContent, // <--- UPDATED
        status: status || 'draft',
        scheduledAt: scheduledAt || null,
        template: usedTemplateId,      // <--- NEW: Store the template ID
    });

    res.status(201).json(campaign);
});

// @desc    Get a single campaign by ID for the authenticated user
// @route   GET /api/campaigns/:id
// @access  Private
const getCampaignById = asyncHandler(async (req, res) => {
    // --- UPDATED: Populate 'template' field to retrieve its details ---
    const campaign = await Campaign.findById(req.params.id)
        .populate('list', 'name')
        .populate('template', 'name subject htmlContent plainTextContent'); // <--- UPDATED: Populate all relevant template fields

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

    // --- UPDATED: Handle templateId in update ---
    const { list: listId, templateId, ...updateFields } = req.body;

    // Validate and update list if provided
    if (listId) {
        const newList = await List.findById(listId);
        if (!newList || newList.user.toString() !== req.user.id) {
            res.status(400);
            throw new Error('Invalid or unauthorized target list provided');
        }
        campaign.list = listId;
    }

    // If templateId is provided, fetch its content and override campaign content
    if (templateId !== undefined) { // Check if templateId was explicitly passed (can be null for no template)
        if (templateId === null || templateId === '') { // User wants to clear template association
            campaign.template = null;
            // You might want to clear htmlContent/plainTextContent here or keep them as is
            // For now, let's assume if templateId is null, content must be provided in updateFields
        } else {
            const template = await Template.findById(templateId);
            if (!template) {
                res.status(404);
                throw new Error('Selected template not found');
            }
            campaign.template = template._id;
            // Override subject and content with template's content
            campaign.subject = template.subject;
            campaign.htmlContent = template.htmlContent;
            campaign.plainTextContent = template.plainTextContent || '';
        }
    }

    // Apply other direct update fields (name, subject, htmlContent, plainTextContent, status, scheduledAt)
    // These will override template content if templateId was just cleared (templateId === null)
    // or if the user explicitly provided them even with a template.
    // This logic ensures fields from template are populated, but can then be individually overridden.
    if (updateFields.name !== undefined) campaign.name = updateFields.name;
    if (updateFields.subject !== undefined) campaign.subject = updateFields.subject;
    if (updateFields.htmlContent !== undefined) campaign.htmlContent = updateFields.htmlContent;
    if (updateFields.plainTextContent !== undefined) campaign.plainTextContent = updateFields.plainTextContent;
    if (updateFields.status !== undefined) campaign.status = updateFields.status;
    if (updateFields.scheduledAt !== undefined) campaign.scheduledAt = updateFields.scheduledAt;

    const updatedCampaign = await campaign.save(); // Use save() as we're modifying the document directly

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

    await campaign.deleteOne(); // This will trigger the pre-delete hook in the Campaign model

    res.status(200).json({ id: req.params.id, message: 'Campaign deleted successfully' });
});

// @desc    Send a campaign to its associated list subscribers immediately
// @route   POST /api/campaigns/:id/send
// @access  Private
const sendCampaign = asyncHandler(async (req, res) => {
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

    if (campaign.status !== 'draft') {
        res.status(400);
        throw new Error(`Campaign status is '${campaign.status}'. Only 'draft' campaigns can be sent immediately. Scheduled campaigns are handled by the scheduler.`);
    }

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
// @route   GET /api/campaigns/:campaignId/opens
// @access  Private
const getCampaignOpenStats = asyncHandler(async (req, res) => { 
    try {
        const { campaignId } = req.params;

        const campaign = await Campaign.findOne({ _id: campaignId, user: req.user.id });

        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found or unauthorized' });
        }

        const totalOpens = await OpenEvent.countDocuments({ campaign: campaignId });
        const uniqueOpens = (await OpenEvent.distinct('subscriber', { campaign: campaignId })).length;

        res.json({
            campaignId: campaignId,
            totalOpens: totalOpens,
            uniqueOpens: uniqueOpens,
        });

    } catch (error) {
        console.error(`Error fetching open stats for campaign ${req.params.campaignId}:`, error);
        res.status(500).json({ message: 'Server Error: Failed to fetch campaign open stats' });
    }
});

// @desc    Get click statistics for a campaign
// @route   GET /api/campaigns/:campaignId/clicks
// @access  Private
const getCampaignClickStats = asyncHandler(async (req, res) => {
    const campaignId = req.params.campaignId; 

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        res.status(400);
        throw new Error('Invalid Campaign ID');
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view stats for this campaign');
    }

    const totalClicks = await ClickEvent.countDocuments({ campaign: campaignId });
    const uniqueClicks = (await ClickEvent.distinct('subscriber', { campaign: campaignId })).length;

    res.status(200).json({
        campaignId: campaignId,
        totalClicks,
        uniqueClicks
    });
});

module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
    getCampaignOpenStats,
    getCampaignClickStats,
};
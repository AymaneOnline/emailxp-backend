// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
// --- REMOVED: Direct import of sendEmail from here. Its logic is now within executeSendCampaign in campaignScheduler.js. ---
// const { sendEmail } = require('../services/emailService'); 
const OpenEvent = require('../models/OpenEvent'); // Import OpenEvent model for tracking opens
const ClickEvent = require('../models/ClickEvent');
// --- REMOVED: Direct import of cheerio from here. Its logic is now within executeSendCampaign in campaignScheduler.js. ---
// const cheerio = require('cheerio'); 

const mongoose = require('mongoose');

// --- ADDED: Import the refactored campaign sending logic from the scheduler utility ---
// This function handles the actual email sending process for both immediate and scheduled campaigns.
const { executeSendCampaign } = require('../utils/campaignScheduler');
// --- END ADDED ---

// @desc    Get all campaigns for the authenticated user
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
    const campaigns = await Campaign.find({ user: req.user.id }).populate('list', 'name');
    res.status(200).json(campaigns);
});

// @desc    Create a new campaign
// @route   POST /api/campaigns
// @access  Private
const createCampaign = asyncHandler(async (req, res) => {
    const { name, subject, htmlContent, plainTextContent, list: listId, status, scheduledAt } = req.body;

    if (!name || !subject || !htmlContent || !listId) {
        res.status(400);
        throw new Error('Please include all required fields: name, subject, HTML content, and a target list.');
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

    const campaign = await Campaign.create({
        user: req.user.id,
        list: listId,
        name,
        subject,
        htmlContent,
        plainTextContent: plainTextContent || '',
        status: status || 'draft',
        scheduledAt: scheduledAt || null,
    });

    res.status(201).json(campaign);
});

// @desc    Get a single campaign by ID for the authenticated user
// @route   GET /api/campaigns/:id
// @access  Private
const getCampaignById = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id).populate('list', 'name');

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

    if (req.body.list) {
        const newList = await List.findById(req.body.list);
        if (!newList || newList.user.toString() !== req.user.id) {
            res.status(400);
            throw new Error('Invalid or unauthorized target list provided');
        }
    }

    const updatedCampaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
    });

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

    // --- UPDATED LOGIC: Only allow 'draft' campaigns to be sent immediately via this API endpoint ---
    // Scheduled campaigns are handled by the background scheduler.
    if (campaign.status !== 'draft') {
        res.status(400);
        throw new Error(`Campaign status is '${campaign.status}'. Only 'draft' campaigns can be sent immediately. Scheduled campaigns are handled by the scheduler.`);
    }

    // --- UPDATED LOGIC: Call the refactored executeSendCampaign from the scheduler utility ---
    // This centralizes the email sending logic and status updates.
    const sendResult = await executeSendCampaign(campaignId);

    if (sendResult.success) {
        res.status(200).json({
            message: sendResult.message,
            totalSubscribers: sendResult.totalSubscribers,
            emailsSent: sendResult.successfulSends,
        });
    } else {
        // Handle cases where executeSendCampaign reports an error (e.g., no subscribers, send failures)
        res.status(500).json({ // Return 500 for internal send failures reported by executeSendCampaign
            message: sendResult.message || 'Failed to send campaign due to an internal error.',
            error: sendResult.error || 'Unknown error during campaign send.',
        });
    }
    // --- END UPDATED LOGIC ---
});

// @desc    Get Open Statistics for a Specific Campaign
// @route   GET /api/campaigns/:campaignId/opens
// @access  Private
const getCampaignOpenStats = asyncHandler(async (req, res) => { 
    try {
        const { campaignId } = req.params;

        // Ensure the campaign exists and belongs to the authenticated user
        const campaign = await Campaign.findOne({ _id: campaignId, user: req.user.id });

        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found or unauthorized' });
        }

        // Count total opens for this campaign
        const totalOpens = await OpenEvent.countDocuments({ campaign: campaignId });

        // Count unique opens (by distinct subscribers) for this campaign
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
    // --- FIX: Access the parameter name correctly as defined in the route (campaignRoutes.js) ---
    const campaignId = req.params.campaignId; 

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        // You can uncomment diagnostic logs if needed for future debugging:
        // console.error(`[BE Error] Invalid Campaign ID detected by isValid: '${campaignId}'`); 
        res.status(400);
        throw new Error('Invalid Campaign ID');
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        // You can uncomment diagnostic logs if needed for future debugging:
        // console.warn(`[BE Warn] Campaign not found for ID: ${campaignId}. User: ${req.user.id}`); 
        res.status(404);
        throw new Error('Campaign not found');
    }
    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        // You can uncomment diagnostic logs if needed for future debugging:
        // console.warn(`[BE Warn] Unauthorized access attempt for campaign ${campaignId} by user ${req.user.id}`);
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
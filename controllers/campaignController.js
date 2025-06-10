// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const { sendEmail } = require('../services/emailService'); // Import the email sending service
const OpenEvent = require('../models/OpenEvent'); // Import OpenEvent model for tracking opens
const ClickEvent = require('../models/ClickEvent');
const cheerio = require('cheerio'); // --- NEW: Import cheerio for HTML parsing ---

const mongoose = require('mongoose');

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

    await campaign.deleteOne();

    res.status(200).json({ id: req.params.id, message: 'Campaign deleted successfully' });
});

// @desc    Send a campaign to its associated list subscribers
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

    if (campaign.status === 'sent' || campaign.status === 'sending') {
        res.status(400);
        throw new Error(`Campaign already in '${campaign.status}' state. Cannot send again.`);
    }

    // Get the subscribers for the associated list
    const subscribers = await Subscriber.find({ list: campaign.list });

    if (subscribers.length === 0) {
        res.status(400);
        throw new Error('No subscribers found for this campaign\'s list.');
    }

    // Update campaign status to 'sending' before starting the send process
    campaign.status = 'sending';
    await campaign.save();

    // --- IMPORTANT: Define your backend URL here ---
    // This is the base URL where your tracking pixel endpoint is hosted.
    // For local development, it's typically http://localhost:5000
    // For deployment, make sure process.env.BACKEND_URL is set (e.g., https://your-app-backend.com)
    const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';


    const sendPromises = subscribers.map(async (subscriber) => {
        // Basic personalization: Replace {{name}} with subscriber's name
        let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
        const personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

        // --- NEW: Process HTML content for click tracking using cheerio ---
        if (personalizedHtml) {
            const $ = cheerio.load(personalizedHtml); // Load HTML into cheerio
            $('a').each((i, link) => {
                const originalHref = $(link).attr('href');
                // Only rewrite http(s) links, ignore mailto, tel, and internal anchors (#)
                if (originalHref && (originalHref.startsWith('http://') || originalHref.startsWith('https://'))) {
                    // Encode the original URL to safely pass it as a query parameter
                    const encodedOriginalUrl = encodeURIComponent(originalHref);
                    // Construct the click tracking URL
                    const clickTrackingUrl = `${BACKEND_URL}/api/track/click/${campaign._id}/${subscriber._id}?url=${encodedOriginalUrl}`;
                    $(link).attr('href', clickTrackingUrl); // Rewrite the link
                }
            });
            personalizedHtml = $.html(); // Get the modified HTML back from cheerio
        }
        // --- END NEW: Click Tracking HTML processing ---

        console.log(`Processing subscriber: ID=${subscriber._id}, Email=${subscriber.email}`); // <-- ADD THIS LINE

        // --- Existing: INJECT THE TRACKING PIXEL INTO THE HTML CONTENT (after click tracking) ---
        const trackingPixelUrl = `${BACKEND_URL}/api/track/open/${campaign._id}/${subscriber._id}`;
        // Append the invisible 1x1 pixel image to the end of the HTML content
        personalizedHtml = `${personalizedHtml}<img src="${trackingPixelUrl}" width="1" height="1" style="display:block" alt="">`;
        // --- END TRACKING PIXEL INJECTION ---

        // Send email to each subscriber using your emailService
        const result = await sendEmail(
            subscriber.email,
            campaign.subject,
            personalizedHtml, // Now includes rewritten links AND the tracking pixel
            personalizedPlain
        );

        return { subscriber: subscriber.email, success: result.success, message: result.message };
    });

    // Wait for all emails to attempt to send
    const results = await Promise.all(sendPromises);

    // After attempting to send, update campaign status to 'sent'
    campaign.status = 'sent';
    campaign.sentAt = new Date();
    await campaign.save();

    console.log(`Campaign "${campaign.name}" sending attempt completed.`);
    res.status(200).json({
        message: 'Campaign sending process initiated and completed.',
        totalSubscribers: subscribers.length,
        // You can return summary counts if you wish
        // sentCount: results.filter(r => r.success).length,
        // failedCount: results.filter(r => !r.success).length,
        // sentResults: results, // Consider if you want to send all results to frontend
    });
});

// NEW FUNCTION: Get Open Statistics for a Specific Campaign
const getCampaignOpenStats = async (req, res) => {
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
};

// @desc    Get click statistics for a campaign
// @route   GET /api/campaigns/:id/click-stats
// @access  Private
const getCampaignClickStats = asyncHandler(async (req, res) => {
    const campaignId = req.params.id;

    // --- ADD THESE DIAGNOSTIC LOGS ---
    console.log(`[BE Debug] getCampaignClickStats: Received campaignId: '${campaignId}'`);
    console.log(`[BE Debug] getCampaignClickStats: campaignId length: ${campaignId.length}`);
    console.log(`[BE Debug] getCampaignClickStats: isObjectIdValid(${campaignId})? ${mongoose.Types.ObjectId.isValid(campaignId)}`);
    // --- END DIAGNOSTIC LOGS ---

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        console.error(`[BE Error] Invalid Campaign ID detected by isValid: '${campaignId}'`); // Log before throwing
        res.status(400);
        throw new Error('Invalid Campaign ID');
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
        console.warn(`[BE Warn] Campaign not found for ID: ${campaignId}. User: ${req.user.id}`); // Log if not found
        res.status(404);
        throw new Error('Campaign not found');
    }
    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        console.warn(`[BE Warn] Unauthorized access attempt for campaign ${campaignId} by user ${req.user.id}`);
        res.status(401);
        throw new Error('Not authorized to view stats for this campaign');
    }

    const totalClicks = await ClickEvent.countDocuments({ campaign: campaignId });
    const uniqueClicks = (await ClickEvent.distinct('subscriber', { campaign: campaignId })).length;

    console.log(`[BE Debug] getCampaignClickStats: Found ${totalClicks} total clicks and ${uniqueClicks} unique clicks for ${campaignId}`);
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
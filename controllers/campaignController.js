// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const Group = require('../models/Group'); // Assuming you have a Group model
const Subscriber = require('../models/Subscriber'); // Assuming you have a Subscriber model
const Template = require('../models/Template'); // Assuming you have a Template model
const { sendEmail } = require('../utils/resendEmailService'); // NEW: Import Resend email service
// const sendgridEmailService = require('../utils/sendgridEmailService'); // OLD: Remove or comment out if you had this
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');
const { executeSendCampaign } = require('../utils/campaignScheduler');
const domainAuthService = require('../services/domainAuthService');
const moment = require('moment-timezone');


// @desc    Get all campaigns
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { timeframe } = req.query; // Get timeframe from query params

    let query = { user: userId };
    const now = new Date();

    // Implement timeframe logic if needed, otherwise fetch all
    if (timeframe) {
        let startDate;
        switch (timeframe) {
            case 'Last 7 days':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'Last 30 days':
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case 'Last 90 days':
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case 'All Time':
            default:
                // No date filter needed for 'All Time'
                break;
        }
        if (startDate) {
            query.createdAt = { $gte: startDate };
        }
    }

    const campaigns = await Campaign.find(query)
                                    .populate('group', 'name') // Populate group name
                                    .populate('groups', 'name') // Populate multi-groups if present
                                    .populate('template', 'name') // Populate template name
                                    .sort({ createdAt: -1 }); // Sort by newest first

    res.status(200).json(campaigns);
});


// @desc    Create new campaign
// @route   POST /api/campaigns
// @access  Private
const createCampaign = asyncHandler(async (req, res) => {
    const { name, subject, fromEmail, fromName, htmlContent, design, plainTextContent, group, groups = [], segments = [], individualSubscribers = [], scheduledAt, status, template, scheduleType, scheduleTimezone, preferenceCategory } = req.body;

    if (!name || !subject || !htmlContent) {
        res.status(400);
        throw new Error('Please include all required fields: name, subject, and htmlContent');
    }

    // Normalize arrays and dedupe
    const selectedGroups = Array.from(new Set([
        ...(Array.isArray(groups) ? groups : []),
        ...(group ? [group] : [])
    ]));
    const selectedSegments = Array.from(new Set(Array.isArray(segments) ? segments : []));
    const selectedIndividuals = Array.from(new Set(Array.isArray(individualSubscribers) ? individualSubscribers : []));

    // Require at least one recipient category
    if (selectedGroups.length === 0 && selectedSegments.length === 0 && selectedIndividuals.length === 0) {
        res.status(400);
        throw new Error('Please select at least one recipient group, segment, or individual subscriber');
    }

    // Enforce verified domain for fromEmail
    const domainPart = (fromEmail || req.user.email || '').split('@').pop();
    const domainCheck = await domainAuthService.requireVerifiedDomain(domainPart);
    if (!domainCheck.allowed) {
        res.status(400);
        throw new Error(`Sending domain not verified: ${domainCheck.reason}`);
    }

    // Preference category: if provided use it, otherwise try default
    let categoryId = preferenceCategory || null;
    if (!categoryId) {
        try {
            const PreferenceCategory = require('../models/PreferenceCategory');
            const def = await PreferenceCategory.findOne({ user: req.user.id, isDefault: true, isArchived: false });
            if (def) categoryId = def._id;
        } catch (e) { /* silent */ }
    }

    const campaign = await Campaign.create({
        user: req.user.id,
        name,
        subject,
        fromEmail: fromEmail || req.user.email,
        fromName: fromName || req.user.name,
        htmlContent,
        design,
        plainTextContent,
        group: selectedGroups[0] || undefined,
        groups: selectedGroups,
        segments: selectedSegments,
        individualSubscribers: selectedIndividuals,
        scheduledAt: scheduledAt || null,
        scheduleType: scheduleType || 'fixed',
        scheduleTimezone: scheduleTimezone || null,
        status: scheduledAt && new Date(scheduledAt) > new Date() ? 'scheduled' : 'draft',
        template: template || null,
        preferenceCategory: categoryId
    });

    res.status(201).json(campaign);
});

// @desc    Get single campaign by ID
// @route   GET /api/campaigns/:id
// @access  Private
const getCampaignById = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id)
        .populate('group', 'name subscribers') // Populate group name and subscribers
        .populate('groups', 'name') // Populate multi-groups if present
        .populate('template', 'name') // Populate template name
        .populate('preferenceCategory', 'name key');

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view this campaign');
    }

    res.status(200).json(campaign);
});

// @desc    Update campaign
// @route   PUT /api/campaigns/:id
// @access  Private
const updateCampaign = asyncHandler(async (req, res) => {
    const { name, subject, fromEmail, fromName, htmlContent, design, plainTextContent, group, groups = [], segments = [], individualSubscribers = [], scheduledAt, status, template, scheduleType, scheduleTimezone, preferenceCategory } = req.body;

    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update this campaign');
    }

    // Determine new status based on scheduledAt and current status
    let newStatus = status;
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
        newStatus = 'scheduled';
    } else if (campaign.status === 'scheduled' && !scheduledAt) {
        // If it was scheduled but now no schedule time, revert to draft
        newStatus = 'draft';
    }
    // Prevent changing status if it's already in a final state (sent, sending, cancelled, failed)
    if (!['scheduled', 'draft'].includes(newStatus) && ['sent', 'sending', 'cancelled', 'failed'].includes(campaign.status)) {
        newStatus = campaign.status;
    }


    // Normalize arrays
    const selectedGroups = Array.from(new Set([
        ...(Array.isArray(groups) ? groups : []),
        ...(group ? [group] : [])
    ]));
    const selectedSegments = Array.from(new Set(Array.isArray(segments) ? segments : []));
    const selectedIndividuals = Array.from(new Set(Array.isArray(individualSubscribers) ? individualSubscribers : []));

    // Enforce verified domain if fromEmail is changing
    if (fromEmail) {
        const updDomain = fromEmail.split('@').pop();
        const check = await domainAuthService.requireVerifiedDomain(updDomain);
        if (!check.allowed) {
            res.status(400);
            throw new Error(`Sending domain not verified: ${check.reason}`);
        }
    }
    const updatePayload = {
            name,
            subject,
            fromEmail: fromEmail || req.user.email,
            fromName: fromName || req.user.name,
            htmlContent,
            design,
            plainTextContent,
            group: selectedGroups[0] || campaign.group,
            groups: selectedGroups.length > 0 ? selectedGroups : campaign.groups,
            segments: selectedSegments.length > 0 ? selectedSegments : campaign.segments,
            individualSubscribers: selectedIndividuals.length > 0 ? selectedIndividuals : campaign.individualSubscribers,
            scheduledAt: scheduledAt || null,
            scheduleType: scheduleType || campaign.scheduleType || 'fixed',
            scheduleTimezone: scheduleTimezone || campaign.scheduleTimezone || null,
            status: newStatus,
            template: template || null
    };
    if (preferenceCategory !== undefined) {
        updatePayload.preferenceCategory = preferenceCategory || null;
    }

    const updatedCampaign = await Campaign.findByIdAndUpdate(
        req.params.id,
        updatePayload,
        { new: true, runValidators: true }
    );

    // Ensure at least one category is present after update
    const hasAnyRecipients = (updatedCampaign.groups && updatedCampaign.groups.length > 0) || (updatedCampaign.segments && updatedCampaign.segments.length > 0) || (updatedCampaign.individualSubscribers && updatedCampaign.individualSubscribers.length > 0);
    if (!hasAnyRecipients) {
        res.status(400);
        throw new Error('Please select at least one recipient group, segment, or individual subscriber');
    }

    res.status(200).json(updatedCampaign);
});

// @desc    Delete campaign
// @route   DELETE /api/campaigns/:id
// @access  Private
const deleteCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete this campaign');
    }

    await campaign.deleteOne(); // Use deleteOne() instead of remove()

    res.status(200).json({ message: 'Campaign removed' });
});

// @desc    Send a test email for a campaign
// @route   POST /api/campaigns/:id/send-test
// @access  Private
const sendTestEmail = asyncHandler(async (req, res) => {
    const { recipientEmail } = req.body;
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to send test email for this campaign');
    }

    if (!recipientEmail) {
        res.status(400);
        throw new Error('Recipient email is required for a test send.');
    }

    try {
        // Rebuild fromEmail with current primary domain to avoid stale stored value
        const { buildFromAddress } = require('../utils/fromAddress');
        try {
            const fromData = await buildFromAddress(req.user.id);
            campaign.fromEmail = fromData.email;
            if (!campaign.fromName) campaign.fromName = fromData.from?.split('<')[0].trim();
            await campaign.save();
        } catch (e) {
            res.status(400);
            e.code = e.code || 'DOMAIN_NOT_VERIFIED';
            throw e;
        }
        await sendEmail({
            to: recipientEmail, // Use user-specified test recipient
            subject: `[TEST] ${campaign.subject}`,
            html: campaign.htmlContent,
            text: campaign.plainTextContent,
            from: campaign.fromEmail,
            fromName: campaign.fromName
        });
        res.status(200).json({ message: 'Test email sent successfully!' });
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500);
        throw new Error(`Failed to send test email: ${error.message}`);
    }
});

// @desc    Send a campaign to its group
// @route   POST /api/campaigns/:id/send
// @access  Private
const sendCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    // Ensure user owns the campaign
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to send this campaign');
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
        res.status(400);
        throw new Error('Campaign has already been sent or is currently sending.');
    }

    // Build / enforce From via verified primary domain
    const { buildFromAddress } = require('../utils/fromAddress');
    try {
        const fromData = await buildFromAddress(req.user.id);
        campaign.fromEmail = fromData.email; // ensure stored
        await campaign.save();
    } catch (e) {
        res.status(400); throw new Error(e.message || 'Verified domain required');
    }
    // Delegate sending to the unified tracked/filtered scheduler path
    const result = await executeSendCampaign(campaign._id);

    res.status(200).json({ message: result.message || 'Campaign sending started.', result });
});


// @desc    Get dashboard statistics for campaigns
// @route   GET /api/campaigns/dashboard-stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { timeframe } = req.query; // e.g., 'Last 30 days', 'All Time'

    let query = { user: userId };
    const now = new Date();

    if (timeframe) {
        let startDate;
        switch (timeframe) {
            case 'Last 7 days':
                startDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case 'Last 30 days':
                startDate = new Date(now.setDate(now.getDate() - 30));
                break;
            case 'Last 90 days':
                startDate = new Date(now.setDate(now.getDate() - 90));
                break;
            case 'All Time':
            default:
                // No date filter needed for 'All Time'
                break;
        }
        if (startDate) {
            query.createdAt = { $gte: startDate };
        }
    }

    const campaigns = await Campaign.find(query);

    let emailsSent = 0;
    let opens = 0;
    let clicks = 0;
    let uniqueOpens = 0;
    let uniqueClicks = 0;
    let totalUnsubscribed = 0;

    for (const campaign of campaigns) {
        emailsSent += campaign.emailsSuccessfullySent || 0;
        opens += campaign.opens || 0;
        clicks += campaign.clicks || 0;
        uniqueOpens += campaign.opens || 0; // Using opens as uniqueOpens for now
        uniqueClicks += campaign.clicks || 0; // Using clicks as uniqueClicks for now
        totalUnsubscribed += campaign.unsubscribedCount || 0;
    }

    // Fetch total active subscribers across all groups for the user
    const userGroups = await Group.find({ user: userId }).populate('subscribers');
    let totalActiveSubscribers = 0;
    userGroups.forEach(group => {
        totalActiveSubscribers += group.subscribers.filter(sub => sub.status === 'subscribed').length;
    });


    // Calculate rates
    const openRate = emailsSent > 0 ? ((uniqueOpens / emailsSent) * 100).toFixed(2) : 0;
    const clickRate = emailsSent > 0 ? ((uniqueClicks / emailsSent) * 100).toFixed(2) : 0;
    const CTOR = uniqueOpens > 0 ? ((uniqueClicks / uniqueOpens) * 100).toFixed(2) : 0; // Click-to-Open Rate

    res.status(200).json({
        emailsSent,
        opens,
        clicks,
        uniqueOpens,
        uniqueClicks,
        openRate,
        clickRate,
        CTOR,
        totalActiveSubscribers,
        totalUnsubscribed,
        // Add other relevant stats as needed
    });
});

// @desc    Get analytics for a specific campaign
// @route   GET /api/campaigns/:id/analytics
// @access  Private
const getCampaignAnalytics = asyncHandler(async (req, res) => {
    const campaignId = req.params.id;
    const userId = req.user.id;
    
    // Verify campaign ownership
    const campaign = await Campaign.findOne({ _id: campaignId, user: userId });
    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }
    
    // Get analytics from analytics service
    const analyticsService = require('../services/analyticsService');
    const analytics = await analyticsService.getCampaignAnalytics(userId, campaignId);
    
    res.json(analytics);
});

// @desc    Get time-series analytics for a specific campaign
// @route   GET /api/campaigns/:id/analytics-timeseries
// @access  Private
const getCampaignAnalyticsTimeSeries = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view analytics for this campaign');
    }
    const { timeframe } = req.query; // e.g., '7days', '30days', '90days', 'alltime'
    let days = 7;
    if (timeframe === '30days') days = 30;
    else if (timeframe === '90days') days = 90;
    // Calculate date range
    let endDate = new Date();
    let startDate;
    if (timeframe === 'alltime') {
        startDate = new Date(campaign.createdAt || new Date());
        days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    } else {
        startDate = new Date();
        startDate.setDate(endDate.getDate() - (days - 1));
    }
    // Aggregate opens by day
    const openAgg = await OpenEvent.aggregate([
        { $match: { campaign: campaign._id, timestamp: { $gte: startDate, $lte: endDate } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
    ]);
    // Aggregate clicks by day
    const clickAgg = await ClickEvent.aggregate([
        { $match: { campaign: campaign._id, timestamp: { $gte: startDate, $lte: endDate } } },
        { $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
            count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
    ]);
    // Prepare labels and fill missing days
    const labels = [];
    const opens = [];
    const clicks = [];
    for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const label = d.toISOString().slice(0, 10);
        labels.push(label);
        const openObj = openAgg.find(o => o._id === label);
        const clickObj = clickAgg.find(c => c._id === label);
        opens.push(openObj ? openObj.count : 0);
        clicks.push(clickObj ? clickObj.count : 0);
    }
    // Emails sent: use campaign.emailsSuccessfullySent if available, or estimate
    const emailsSent = Array(days).fill(campaign.emailsSuccessfullySent || 0);
    res.status(200).json({ labels, emailsSent, opens, clicks });
});


// @desc    Cancel a scheduled campaign (only if scheduled in the future)
// @route   POST /api/campaigns/:id/cancel
// @access  Private
const cancelCampaign = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }
    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to cancel this campaign');
    }
    const now = new Date();
    if (campaign.status !== 'scheduled' || !campaign.scheduledAt || campaign.scheduledAt <= now) {
        res.status(400);
        throw new Error('Only future scheduled campaigns can be cancelled');
    }
    campaign.status = 'cancelled';
    campaign.scheduledAt = null;
    await campaign.save();
    res.json(campaign);
});



module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendTestEmail,
    sendCampaign,
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries,
    cancelCampaign,
};

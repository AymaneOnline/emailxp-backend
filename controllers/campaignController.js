// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const Template = require('../models/Template');
const OpenEvent = require('../models/OpenEvent'); // Added import
const ClickEvent = require('../models/ClickEvent'); // Added import
const mongoose = require('mongoose'); // Make sure mongoose is imported for ObjectId

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

    if (listId) {
        const newList = await List.findById(listId);
        if (!newList || newList.user.toString() !== req.user.id) {
            res.status(400);
            throw new Error('Invalid or unauthorized target list provided');
        }
        campaign.list = listId;
    }

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

    if (!process.env.SENDGRID_SENDER_EMAIL || process.env.SENDGRID_SENDER_EMAIL.trim() === '') {
        console.error(`[ERROR] SENDGRID_SENDER_EMAIL is not configured or is empty. Current value: "${process.env.SENDGRID_SENDER_EMAIL}"`);
        res.status(500);
        throw new Error('SendGrid sender email (SENDGRID_SENDER_EMAIL) is not configured in environment variables. Please set it.');
    }

    const subscribers = await Subscriber.find({ list: campaign.list._id, status: 'subscribed' });

    if (subscribers.length === 0) {
        res.status(400);
        throw new Error(`The list "${campaign.list.name}" has no active subscribers. Please add subscribers to the list before sending this campaign.`);
    }

    campaign.status = 'sending';
    campaign.lastSentAt = new Date();
    campaign.totalRecipients = subscribers.length;
    await campaign.save();

    let successfulSends = 0;
    let failedSends = 0;

    try {
        const sendPromises = subscribers.map(async (subscriber) => {
            const personalizedSubject = campaign.subject.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            let personalizedHtml = campaign.htmlContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');
            let personalizedPlain = campaign.plainTextContent.replace(/\{\{name\}\}/g, subscriber.name || 'there');

            const unsubscribeUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/track/unsubscribe/${subscriber._id}?campaignId=${campaign._id}`;
            personalizedHtml = `${personalizedHtml}<p style="text-align:center; font-size:10px; color:#aaa; margin-top:30px;">If you no longer wish to receive these emails, <a href="${unsubscribeUrl}" style="color:#aaa;">unsubscribe here</a>.</p>`;
            personalizedPlain = `${personalizedPlain}\n\n---\nIf you no longer wish to receive these emails, unsubscribe here: ${unsubscribeUrl}`;

            const result = await sendEmail(
                subscriber.email,
                personalizedSubject,
                personalizedHtml,
                personalizedPlain,
                campaign._id,
                subscriber._id,
                campaign.list._id
            );

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

// @desc    Get aggregate dashboard statistics for the authenticated user
// @route   GET /api/campaigns/dashboard-stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Total Campaigns owned by the user
    const totalCampaigns = await Campaign.countDocuments({ user: userId });

    // Total Lists owned by the user
    const totalLists = await List.countDocuments({ user: userId });

    // Total Subscribers for lists owned by the user
    // This requires aggregation across lists
    const userLists = await List.find({ user: userId }).select('_id');
    const userListIds = userLists.map(list => list._id);
    const totalSubscribers = await Subscriber.countDocuments({ list: { $in: userListIds } });

    // Campaigns Sent
    const campaignsSent = await Campaign.countDocuments({ user: userId, status: 'sent' });

    // Recent Campaigns (last 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const recentCampaigns = await Campaign.find({
        user: userId,
        lastSentAt: { $gte: sevenDaysAgo }
    }).sort({ lastSentAt: -1 }).limit(5);


    // --- NEW AGGREGATION FOR PERFORMANCE STATS FROM EVENT COLLECTIONS ---
    // Get all campaigns sent by the user to use as a filter for events
    const sentCampaignsByUser = await Campaign.find({ user: userId, status: 'sent' }).select('_id');
    const sentCampaignIds = sentCampaignsByUser.map(campaign => campaign._id);

    let totalEmailsSent = 0;
    // Sum emailsSent from Campaign documents for sent campaigns
    if (sentCampaignIds.length > 0) {
        const sentEmailsResult = await Campaign.aggregate([
            { $match: { _id: { $in: sentCampaignIds } } },
            { $group: { _id: null, total: { $sum: '$emailsSent' } } }
        ]);
        totalEmailsSent = sentEmailsResult.length > 0 ? sentEmailsResult[0].total : 0;
    }

    // Aggregate total opens from OpenEvent collection for user's sent campaigns
    const totalOpensAggregate = await OpenEvent.aggregate([
        { $match: { campaign: { $in: sentCampaignIds } } },
        { $count: 'total' }
    ]);
    const totalOpens = totalOpensAggregate.length > 0 ? totalOpensAggregate[0].total : 0;

    // Aggregate unique opens from OpenEvent collection for user's sent campaigns
    const uniqueOpensAggregate = await OpenEvent.aggregate([
        { $match: { campaign: { $in: sentCampaignIds } } },
        { $group: { _id: '$subscriber' } }, // Group by subscriber to count unique ones across all sent campaigns
        { $count: 'uniqueCount' }
    ]);
    const uniqueOpens = uniqueOpensAggregate.length > 0 ? uniqueOpensAggregate[0].uniqueCount : 0;

    // Aggregate total clicks from ClickEvent collection for user's sent campaigns
    const totalClicksAggregate = await ClickEvent.aggregate([
        { $match: { campaign: { $in: sentCampaignIds } } },
        { $count: 'total' }
    ]);
    const totalClicks = totalClicksAggregate.length > 0 ? totalClicksAggregate[0].total : 0;

    // Aggregate unique clicks from ClickEvent collection for user's sent campaigns
    const uniqueClicksAggregate = await ClickEvent.aggregate([
        { $match: { campaign: { $in: sentCampaignIds } } },
        { $group: { _id: '$subscriber' } }, // Group by subscriber to count unique ones across all sent campaigns
        { $count: 'uniqueCount' }
    ]);
    const uniqueClicks = uniqueClicksAggregate.length > 0 ? uniqueClicksAggregate[0].uniqueCount : 0;

    // For bounced, unsubscribed, and complaints, we can still use the Campaign model's aggregated counts
    // as these are updated via direct interactions or the old webhook logic.
    // However, if you plan to introduce specific BounceEvent/ComplaintEvent models later, these will need updating too.
    const overallCampaignStats = await Campaign.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: null,
                totalBounced: { $sum: '$bouncedCount' },
                totalUnsubscribed: { $sum: '$unsubscribedCount' },
                totalComplaints: { $sum: '$complaintCount' }
            }
        },
        {
            $project: {
                _id: 0,
                totalBounced: 1,
                totalUnsubscribed: 1,
                totalComplaints: 1
            }
        }
    ]);

    const performance = overallCampaignStats.length > 0 ? overallCampaignStats[0] : {
        totalBounced: 0,
        totalUnsubscribed: 0,
        totalComplaints: 0
    };

    const openRate = totalEmailsSent > 0 ? (uniqueOpens / totalEmailsSent * 100) : 0;
    const clickRate = totalEmailsSent > 0 ? (uniqueClicks / totalEmailsSent * 100) : 0;


    res.status(200).json({
        totalCampaigns,
        totalLists,
        totalSubscribers,
        campaignsSent,
        recentCampaigns,
        performance: {
            totalEmailsSent: totalEmailsSent,
            totalOpens: totalOpens,
            uniqueOpens: uniqueOpens,
            totalClicks: totalClicks,
            uniqueClicks: uniqueClicks,
            totalBounced: performance.totalBounced,
            totalUnsubscribed: performance.totalUnsubscribed,
            totalComplaints: performance.totalComplaints,
            openRate: parseFloat(openRate.toFixed(2)),
            clickRate: parseFloat(clickRate.toFixed(2))
        }
    });
});

// @desc    Get analytics for a specific campaign (e.g., opens, clicks over time)
// @route   GET /api/campaigns/:id/analytics
// @access  Private
const getCampaignAnalytics = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params; // Destructure and rename id to campaignId for clarity

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        res.status(400);
        throw new Error('Invalid campaign ID');
    }

    const campaign = await Campaign.findById(campaignId);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view analytics for this campaign');
    }

    try {
        // Calculate Total Opens
        const totalOpens = await OpenEvent.countDocuments({ campaign: campaignId });

        // Calculate Unique Opens
        const uniqueOpens = await OpenEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            { $group: { _id: '$subscriber' } }, // Group by subscriber to count unique ones
            { $count: 'uniqueCount' }
        ]);
        const uniqueOpensCount = uniqueOpens.length > 0 ? uniqueOpens[0].uniqueCount : 0;

        // Calculate Total Clicks
        const totalClicks = await ClickEvent.countDocuments({ campaign: campaignId });

        // Calculate Unique Clicks
        const uniqueClicks = await ClickEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            { $group: { _id: '$subscriber' } }, // Group by subscriber to count unique ones
            { $count: 'uniqueCount' }
        ]);
        const uniqueClicksCount = uniqueClicks.length > 0 ? uniqueClicks[0].uniqueCount : 0;

        const emailsSent = campaign.emailsSent || 0;
        const openRate = emailsSent > 0 ? (uniqueOpensCount / emailsSent * 100) : 0;
        const clickRate = emailsSent > 0 ? (uniqueClicksCount / emailsSent * 100) : 0;


        res.status(200).json({
            campaignId: campaignId,
            name: campaign.name, // Include campaign name for context
            emailsSent: emailsSent, // Number of emails attempted to send
            totalOpens: totalOpens,
            uniqueOpens: uniqueOpensCount,
            totalClicks: totalClicks,
            uniqueClicks: uniqueClicksCount,
            // You can add other stats from campaign model if relevant and updated
            bounced: campaign.bouncedCount || 0,
            unsubscribed: campaign.unsubscribedCount || 0,
            complaints: campaign.complaintCount || 0,
            status: campaign.status,
            lastSentAt: campaign.lastSentAt,
            openRate: openRate, // Calculated from unique opens
            clickRate: clickRate // Calculated from unique clicks
        });

    } catch (error) {
        console.error(`Error fetching analytics for campaign ${campaignId}:`, error);
        res.status(500).json({ message: 'Error fetching campaign analytics', error: error.message });
    }
});


// @desc    Get time-series analytics (daily/weekly opens and clicks) for a specific campaign
// @route   GET /api/campaigns/:id/analytics/time-series?period=daily || weekly
// @access  Private
const getCampaignAnalyticsTimeSeries = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params;
    const { period = 'daily' } = req.query; // Default to daily, can be 'weekly'

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        res.status(400);
        throw new Error('Invalid campaign ID');
    }

    const campaign = await Campaign.findById(campaignId);

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view analytics for this campaign');
    }

    try {
        let groupByFormat;
        if (period === 'weekly') {
            // Group by year and week number
            groupByFormat = {
                year: { $year: '$timestamp' },
                week: { $week: '$timestamp' }
            };
        } else { // default to daily
            // Group by year, month, day
            groupByFormat = {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
            };
        }

        // Aggregate Open Events
        const opensTimeSeries = await OpenEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            {
                $group: {
                    _id: groupByFormat,
                    count: { $sum: 1 },
                    // Get the first timestamp for sorting and date reconstruction
                    firstTimestamp: { $min: '$timestamp' }
                }
            },
            { $sort: { 'firstTimestamp': 1 } }, // Sort by date
            {
                $project: {
                    _id: 0,
                    date: {
                        $cond: {
                            if: { $eq: [period, 'weekly'] },
                            then: { $dateToString: { format: '%Y-W%V', date: '$firstTimestamp' } }, // ISO week date format
                            else: { $dateToString: { format: '%Y-%m-%d', date: '$firstTimestamp' } } // YYYY-MM-DD
                        }
                    },
                    count: 1
                }
            }
        ]);

        // Aggregate Click Events
        const clicksTimeSeries = await ClickEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            {
                $group: {
                    _id: groupByFormat,
                    count: { $sum: 1 },
                     // Get the first timestamp for sorting and date reconstruction
                    firstTimestamp: { $min: '$timestamp' }
                }
            },
            { $sort: { 'firstTimestamp': 1 } }, // Sort by date
            {
                $project: {
                    _id: 0,
                    date: {
                        $cond: {
                            if: { $eq: [period, 'weekly'] },
                            then: { $dateToString: { format: '%Y-W%V', date: '$firstTimestamp' } }, // ISO week date format
                            else: { $dateToString: { format: '%Y-%m-%d', date: '$firstTimestamp' } } // YYYY-MM-DD
                        }
                    },
                    count: 1
                }
            }
        ]);

        // Combine opens and clicks into a single time-series array
        const combinedData = {};

        opensTimeSeries.forEach(item => {
            combinedData[item.date] = {
                date: item.date,
                opens: item.count,
                clicks: 0
            };
        });

        clicksTimeSeries.forEach(item => {
            if (combinedData[item.date]) {
                combinedData[item.date].clicks = item.count;
            } else {
                combinedData[item.date] = {
                    date: item.date,
                    opens: 0,
                    clicks: item.count
                };
            }
        });

        // Convert to array and sort by date again to ensure correct order
        const timeSeries = Object.values(combinedData).sort((a, b) => {
            if (period === 'weekly') {
                // Custom sort for YYYY-WVV format
                const [yearA, weekA] = a.date.split('-W').map(Number);
                const [yearB, weekB] = b.date.split('-W').map(Number);
                if (yearA !== yearB) return yearA - yearB;
                return weekA - weekB;
            } else {
                // Standard date string comparison
                return new Date(a.date) - new Date(b.date);
            }
        });


        res.status(200).json(timeSeries);

    } catch (error) {
        console.error(`Error fetching time-series analytics for campaign ${campaignId}:`, error);
        res.status(500).json({ message: 'Error fetching time-series analytics', error: error.message });
    }
});


module.exports = {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually,
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries, // Export the new function
};
// emailxp/backend/controllers/campaignController.js

const asyncHandler = require('express-async-handler');
const Campaign = require('../models/Campaign');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');
const Template = require('../models/Template');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');
const mongoose = require('mongoose');

const { sendEmail } = require('../services/emailService');

// Helper function to calculate date ranges for filtering
const getDateRange = (timeframe) => {
    const now = new Date();
    let startDate;

    switch (timeframe) {
        case 'Last 7 days':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
        case 'Last 30 days':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            break;
        case 'Last 90 days':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 90);
            break;
        case 'All Time': // Add an 'All Time' option if you want to fetch everything
            startDate = null; // No start date, fetch all
            break;
        default: // Default to Last 30 days if no valid timeframe
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 30);
            break;
    }
    return startDate;
};


// @desc    Get all campaigns for the authenticated user
// @route   GET /api/campaigns
// @access  Private
const getCampaigns = asyncHandler(async (req, res) => {
    const { timeframe } = req.query; // Get timeframe from query params
    const userId = req.user.id;

    let query = { user: userId };
    if (timeframe && timeframe !== 'All Time') {
        const startDate = getDateRange(timeframe);
        if (startDate) {
            query.createdAt = { $gte: startDate }; // Filter by creation date
        }
    }

    const campaigns = await Campaign.find(query)
        .populate('list', 'name')
        .populate('template', 'name subject')
        .sort({ createdAt: -1 }); // Sort by newest first
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
    const currentScheduledAt = campaign.scheduledAt ? new Date(campaign.scheduledAt) : null; // Corrected variable name

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

// @desc Send a test email for a campaign
// @route POST /api/campaigns/:id/send-test
// @access Private
const sendTestEmail = asyncHandler(async (req, res) => {
    const campaign = await Campaign.findById(req.params.id);
    const { recipientEmail } = req.body;

    if (!campaign) {
        res.status(404);
        throw new Error('Campaign not found');
    }

    if (campaign.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('User not authorized');
    }

    if (!recipientEmail) {
        res.status(400);
        throw new Error('Please provide a recipient email for the test.');
    }

    // TODO: Implement actual email sending logic here (e.g., using Nodemailer)
    // For now, simulate success
    console.log(`[EmailService] Simulating sending test email for campaign "${campaign.name}" to ${recipientEmail}`);
    res.status(200).json({ message: 'Test email simulated successfully!' });
});


// @desc    Manually send a campaign to its associated list subscribers immediately
// @route   POST /api/campaigns/:id/send
// @access  Private
const sendCampaign = asyncHandler(async (req, res) => {
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
    console.log(`[SendCampaign] Campaign ${campaign._id} initiated send, status: 'sending', totalRecipients: ${campaign.totalRecipients}`);

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
                    console.error(`[SendCampaign] Email send fulfilled but failed for a subscriber. Message: ${errorMsg}. Error:`, errorObj);
                }
            } else if (outcome.status === 'rejected') {
                failedSends++;
                console.error(`[SendCampaign] Email send promise rejected for a subscriber. Reason:`, outcome.reason);
            }
        });

        console.log(`[SendCampaign] After all emails processed: successfulSends = ${successfulSends}, failedSends = ${failedSends}`);

        campaign.status = successfulSends > 0 ? 'sent' : 'failed';
        campaign.emailsSuccessfullySent = successfulSends;
        campaign.sentAt = new Date();

        try {
            await campaign.save();
            console.log(`[SendCampaign] Campaign ${campaign._id} final status updated to ${campaign.status}, emailsSuccessfullySent: ${campaign.emailsSuccessfullySent}, sentAt: ${campaign.sentAt}`);
        } catch (saveError) {
            console.error(`[SendCampaign] CRITICAL ERROR: Failed to save final campaign status and emailsSuccessfullySent for ${campaign._id}:`, saveError);
        }

        res.status(200).json({
            message: 'Campaign sending initiated. Check backend logs for details.',
            totalSubscribers: subscribers.length,
            successfulSends: successfulSends,
            failedSends: failedSends,
        });

    } catch (error) {
        console.error('[SendCampaign] Error during campaign sending process (outer catch):', error.response?.body || error.message || error);
        if (campaign.status === 'sending') {
            campaign.status = 'failed';
            try {
                await campaign.save();
                console.log(`[SendCampaign] Campaign ${campaign._id} status set to 'failed' due to outer error.`);
            } catch (failSaveError) {
                console.error(`[SendCampaign] Failed to save 'failed' status for campaign ${campaign._id} in outer catch:`, failSaveError);
            }
        }
        res.status(500).json({
            message: 'Failed to send campaign.',
            error: error.response?.body || error.message || error,
        });
    }
});

// @desc    Get aggregate dashboard statistics for the authenticated user
// @route   GET /api/campaigns/dashboard-stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { timeframe } = req.query; // Get timeframe from query params

    let campaignMatchQuery = { user: new mongoose.Types.ObjectId(userId) };
    let subscriberMatchQuery = { user: new mongoose.Types.ObjectId(userId) }; // For lists owned by user
    let eventMatchQuery = {}; // For Open/Click events

    if (timeframe && timeframe !== 'All Time') {
        const startDate = getDateRange(timeframe);
        if (startDate) {
            campaignMatchQuery.createdAt = { $gte: startDate }; // Filter campaigns by creation
            // For dashboard stats, we usually want to filter by when the campaign was sent
            campaignMatchQuery.lastSentAt = { $gte: startDate, $ne: null }; // Only consider sent campaigns within timeframe

            // For subscribers, filter by their creation date (subscribed date)
            subscriberMatchQuery.createdAt = { $gte: startDate };

            // For open/click events, filter by their timestamp
            eventMatchQuery.timestamp = { $gte: startDate };
        }
    }

    // Total Campaigns (filtered by timeframe if applicable)
    const totalCampaigns = await Campaign.countDocuments(campaignMatchQuery);

    // Total Lists (filtered by timeframe if applicable)
    const totalLists = await List.countDocuments(subscriberMatchQuery); // Re-using subscriberMatchQuery for lists

    // Total Active Subscribers (across all lists owned by user, filtered by subscription date if applicable)
    const totalSubscribersAggregate = await List.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } }, // Match lists owned by the user
        {
            $lookup: {
                from: 'subscribers',
                localField: '_id',
                foreignField: 'list',
                as: 'subscribersInList'
            }
        },
        { $unwind: '$subscribersInList' }, // Unwind to process each subscriber
        {
            $match: {
                'subscribersInList.status': 'subscribed',
                ...(timeframe && timeframe !== 'All Time' && getDateRange(timeframe) ? { 'subscribersInList.createdAt': { $gte: getDateRange(timeframe) } } : {})
            }
        },
        { $group: { _id: '$subscribersInList.email' } }, // Group by email to count unique subscribers
        { $count: 'total' }
    ]);
    const totalActiveSubscribers = totalSubscribersAggregate.length > 0 ? totalSubscribersAggregate[0].total : 0;

    // Campaigns Sent (filtered by timeframe)
    const campaignsSent = await Campaign.countDocuments({ ...campaignMatchQuery, status: 'sent' });

    // Recent Campaigns (already filtered by lastSentAt in your original code, keep this specific 7-day logic)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentCampaigns = await Campaign.find({
        user: userId,
        lastSentAt: { $gte: sevenDaysAgo, $ne: null } // Ensure lastSentAt exists
    }).sort({ lastSentAt: -1 }).limit(5);

    // Get IDs of campaigns sent by the user within the selected timeframe
    const sentCampaignIdsByUser = await Campaign.find({
        user: userId,
        status: 'sent',
        ...(timeframe && timeframe !== 'All Time' && getDateRange(timeframe) ? { lastSentAt: { $gte: getDateRange(timeframe) } } : {})
    }).select('_id');
    const sentCampaignObjectIds = sentCampaignIdsByUser.map(campaign => new mongoose.Types.ObjectId(campaign._id));

    let totalEmailsSent = 0;
    let totalUnsubscribed = 0;

    if (sentCampaignObjectIds.length > 0) {
        const overallCampaignPerformance = await Campaign.aggregate([
            { $match: { _id: { $in: sentCampaignObjectIds } } },
            {
                $group: {
                    _id: null,
                    sumEmailsSent: { $sum: '$emailsSuccessfullySent' },
                    sumUnsubscribed: { $sum: '$unsubscribedCount' },
                }
            },
            {
                $project: {
                    _id: 0,
                    totalEmailsSent: '$sumEmailsSent',
                    totalUnsubscribed: '$sumUnsubscribed',
                }
            }
        ]);

        if (overallCampaignPerformance.length > 0) {
            totalEmailsSent = overallCampaignPerformance[0].totalEmailsSent || 0;
            totalUnsubscribed = overallCampaignPerformance[0].totalUnsubscribed || 0;
        }
    }

    // Opens and Clicks stats (filtered by timeframe)
    const opensStats = await OpenEvent.aggregate([
        { $match: { ...eventMatchQuery, campaign: { $in: sentCampaignObjectIds } } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                unique: { $addToSet: '$subscriber' }
            }
        },
        {
            $project: {
                _id: 0,
                total: 1,
                unique: { $size: '$unique' }
            }
        }
    ]);
    const totalOpens = opensStats.length > 0 ? opensStats[0].total : 0;
    const uniqueOpens = opensStats.length > 0 ? opensStats[0].unique : 0;

    const clicksStats = await ClickEvent.aggregate([
        { $match: { ...eventMatchQuery, campaign: { $in: sentCampaignObjectIds } } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                unique: { $addToSet: '$subscriber' }
            }
        },
        {
            $project: {
                _id: 0,
                total: 1,
                unique: { $size: '$unique' }
            }
        }
    ]);
    const totalClicks = clicksStats.length > 0 ? clicksStats[0].total : 0;
    const uniqueClicks = clicksStats.length > 0 ? clicksStats[0].unique : 0;

    const CTOR = uniqueOpens > 0 ? (uniqueClicks / uniqueOpens * 100) : 0; // Click-to-Open Rate

    res.status(200).json({
        totalCampaigns,
        totalLists,
        totalActiveSubscribers, // Renamed for clarity on frontend
        campaignsSent,
        recentCampaigns,
        emailsSent: totalEmailsSent, // Direct top-level fields for dashboard
        opens: totalOpens,
        clicks: totalClicks,
        CTOR: parseFloat(CTOR.toFixed(2)), // Ensure CTOR is calculated and formatted
        // You can keep the performance object if other parts of your frontend use it
        // performance: {
        //     totalEmailsSent: totalEmailsSent,
        //     totalOpens: totalOpens,
        //     uniqueOpens: uniqueOpens,
        //     totalClicks: totalClicks,
        //     uniqueClicks: uniqueClicks,
        //     totalUnsubscribed: totalUnsubscribed,
        //     openRate: parseFloat(openRate.toFixed(2)),
        //     clickRate: parseFloat(clickRate.toFixed(2))
        // }
    });
});


// @desc    Get analytics for a specific campaign (e.g., opens, clicks over time)
// @route   GET /api/campaigns/:id/analytics
// @access  Private
const getCampaignAnalytics = asyncHandler(async (req, res) => {
    const { id: campaignId } = req.params;

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
        const totalOpens = await OpenEvent.countDocuments({ campaign: campaignId });
        const uniqueOpens = await OpenEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            { $group: { _id: '$subscriber' } },
            { $count: 'uniqueCount' }
        ]);
        const uniqueOpensCount = uniqueOpens.length > 0 ? uniqueOpens[0].uniqueCount : 0;

        const totalClicks = await ClickEvent.countDocuments({ campaign: campaignId });
        const uniqueClicks = await ClickEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            { $group: { _id: '$subscriber' } },
            { $count: 'uniqueCount' }
        ]);
        const uniqueClicksCount = uniqueClicks.length > 0 ? uniqueClicks[0].uniqueCount : 0;

        const emailsSent = campaign.emailsSuccessfullySent || 0;
        const openRate = emailsSent > 0 ? (uniqueOpensCount / emailsSent * 100) : 0;
        const clickRate = emailsSent > 0 ? (uniqueClicksCount / emailsSent * 100) : 0;


        res.status(200).json({
            campaignId: campaignId,
            name: campaign.name,
            emailsSent: emailsSent,
            totalOpens: totalOpens,
            uniqueOpens: uniqueOpensCount,
            totalClicks: totalClicks,
            uniqueClicks: uniqueClicksCount,
            bounced: campaign.bouncedCount || 0,
            unsubscribed: campaign.unsubscribedCount || 0,
            complaints: campaign.complaintCount || 0,
            status: campaign.status,
            lastSentAt: campaign.lastSentAt,
            openRate: parseFloat(openRate.toFixed(2)),
            clickRate: parseFloat(clickRate.toFixed(2))
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
            groupByFormat = {
                year: { $year: '$timestamp' },
                week: { $week: '$timestamp' }
            };
        } else {
            groupByFormat = {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
            };
        }

        const opensTimeSeries = await OpenEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            {
                $group: {
                    _id: groupByFormat,
                    count: { $sum: 1 },
                    firstTimestamp: { $min: '$timestamp' }
                }
            },
            { $sort: { 'firstTimestamp': 1 } },
            {
                $project: {
                    _id: 0,
                    date: {
                        $cond: {
                            if: { $eq: [period, 'weekly'] },
                            then: { $dateToString: { format: '%Y-W%V', date: '$firstTimestamp' } },
                            else: { $dateToString: { format: '%Y-%m-%d', date: '$firstTimestamp' } }
                        }
                    },
                    count: 1
                }
            }
        ]);

        const clicksTimeSeries = await ClickEvent.aggregate([
            { $match: { campaign: new mongoose.Types.ObjectId(campaignId) } },
            {
                $group: {
                    _id: groupByFormat,
                    count: { $sum: 1 },
                    firstTimestamp: { $min: '$timestamp' }
                }
            },
            { $sort: { 'firstTimestamp': 1 } },
            {
                $project: {
                    _id: 0,
                    date: {
                        $cond: {
                            if: { $eq: [period, 'weekly'] },
                            then: { $dateToString: { format: '%Y-W%V', date: '$firstTimestamp' } },
                            else: { $dateToString: { format: '%Y-%m-%d', date: '$firstTimestamp' } }
                        }
                    },
                    count: 1
                }
            }
        ]);

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

        const timeSeries = Object.values(combinedData).sort((a, b) => {
            if (period === 'weekly') {
                const [yearA, weekA] = a.date.split('-W').map(Number);
                const [yearB, weekB] = b.date.split('-W').map(Number);
                if (yearA !== yearB) return yearA - yearB;
                return weekA - weekB;
            } else {
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
    sendTestEmail,
    sendCampaign,
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries,
};
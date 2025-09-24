const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');
const Subscriber = require('../models/Subscriber');
const Group = require('../models/Group');
// tag cleanup removed

// @desc    Get subscriber activity history (unified opens, clicks, status entries) with pagination
// @route   GET /api/subscribers/:id/activity?page=1&limit=50
// @access  Private
const getSubscriberActivity = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit || '50', 10)));
    const skip = (page - 1) * limit;

    // Fetch a reasonable window of opens/clicks to build the unified list
    // We fetch up to 2000 items from each collection to ensure we can paginate reliably
    const fetchLimit = 2000;
    const [opens, clicks, subscriberDoc] = await Promise.all([
        OpenEvent.find({ subscriber: id })
            .sort({ timestamp: -1 })
            .limit(fetchLimit)
            .populate('campaign', 'name')
            .select('campaign timestamp email ipAddress userAgent'),
        ClickEvent.find({ subscriber: id })
            .sort({ timestamp: -1 })
            .limit(fetchLimit)
            .populate('campaign', 'name')
            .select('campaign url timestamp email ipAddress userAgent'),
        Subscriber.findById(id).select('status createdAt updatedAt unsubscribedAt')
    ]);

    // Normalize to unified activity items
    const normalized = [];

    opens.forEach(o => normalized.push({
        type: 'open',
        date: o.timestamp || o.createdAt || null,
        campaign: o.campaign && (o.campaign.name || o.campaign.toString()),
        campaignId: o.campaign && (o.campaign._id ? o.campaign._id : (typeof o.campaign === 'string' ? o.campaign : null)),
        ipAddress: o.ipAddress,
        userAgent: o.userAgent,
        raw: o
    }));

    clicks.forEach(c => normalized.push({
        type: 'click',
        date: c.timestamp || c.createdAt || null,
        campaign: c.campaign && (c.campaign.name || c.campaign.toString()),
        campaignId: c.campaign && (c.campaign._id ? c.campaign._id : (typeof c.campaign === 'string' ? c.campaign : null)),
        url: c.url,
        ipAddress: c.ipAddress,
        userAgent: c.userAgent,
        raw: c
    }));

    // Add a status entry for current status
    if (subscriberDoc) {
        normalized.push({
            type: 'status',
            date: subscriberDoc.updatedAt || subscriberDoc.createdAt || null,
            status: subscriberDoc.status,
            unsubscribedAt: subscriberDoc.unsubscribedAt || null
        });
    }

    // Sort unified list by date desc
    const unifiedSorted = normalized
        .filter(i => i.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Paginate
    const total = unifiedSorted.length;
    const totalPages = Math.ceil(total / limit);
    const paged = unifiedSorted.slice(skip, skip + limit);

    // Compute unique campaign count across opens+clicks
    const campaignSet = new Set();
    normalized.forEach(i => {
        if (i.campaignId) campaignSet.add(String(i.campaignId));
        else if (i.campaign && typeof i.campaign === 'string') campaignSet.add(i.campaign);
    });
    const campaignCount = campaignSet.size;

    res.json({ activities: paged, pagination: { page, limit, total, totalPages }, campaignCount });
});
// @desc    Segment subscribers by groups, status, signup date (tags removed)
// @route   POST /api/subscribers/segment
// @access  Private
const segmentSubscribers = asyncHandler(async (req, res) => {
    const { groupIds = [], status, signupFrom, signupTo, search, page = 1, limit = 20 } = req.body;
    const query = { user: req.user.id };
    // tags removed from segmentation
    if (Array.isArray(groupIds) && groupIds.length > 0) {
        query.groups = { $in: groupIds };
    }
    if (status) {
        query.status = status;
    }
    if (signupFrom || signupTo) {
        query.createdAt = {};
        if (signupFrom) query.createdAt.$gte = new Date(signupFrom);
        if (signupTo) query.createdAt.$lte = new Date(signupTo);
    }
    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { email: searchRegex },
            { name: searchRegex }
        ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [subscribers, total] = await Promise.all([
        Subscriber.find(query)
            .populate('groups', 'name')
            // tags population removed
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        Subscriber.countDocuments(query)
    ]);
    res.json({
        subscribers,
        pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            hasNext: skip + subscribers.length < total,
            hasPrev: parseInt(page) > 1
        }
    });
});
// tag add/remove endpoints removed

// @desc    Get all subscribers with filtering, searching, and pagination
// @route   GET /api/subscribers
// @access  Private
const getSubscribers = asyncHandler(async (req, res) => {
    const {
        groupId,
        status,
        search,
    // tag removed
        signupFrom,
        signupTo,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    console.log('Get subscribers request:', { groupId, status, search, page, limit, sortBy, sortOrder });
    console.log('User ID:', req.user.id);

    // Build query for user's subscribers
    const query = { user: req.user.id };

    if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        query.groups = groupId;
    }

    // Default to excluding unsubscribed users unless status filter is explicitly provided
    if (status) {
        query.status = status;
    } else {
        query.status = { $ne: 'unsubscribed' }; // Exclude unsubscribed by default
    }

    // tag filter removed

    if (signupFrom || signupTo) {
        query.createdAt = {};
        if (signupFrom) query.createdAt.$gte = new Date(signupFrom);
        if (signupTo) query.createdAt.$lte = new Date(signupTo);
    }

    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { email: searchRegex },
            { name: searchRegex }
        ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [subscribers, total] = await Promise.all([
        Subscriber.find(query)
            .populate('groups', 'name')
            // tags population removed
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        Subscriber.countDocuments(query)
    ]);

    res.json({
        subscribers,
        pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            hasNext: skip + subscribers.length < total,
            hasPrev: parseInt(page) > 1
        }
    });
});

// @desc    Get subscribers by group (for backward compatibility)
// @route   GET /api/subscribers/group/:groupId
// @access  Private
const getSubscribersByGroup = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { status, search, page = 1, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
        res.status(400);
        throw new Error('Invalid group ID');
    }

    // Verify group ownership
    const group = await Group.findOne({ _id: groupId, user: req.user.id });
    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    const query = { groups: groupId, user: req.user.id };

    // Default to excluding unsubscribed users unless status filter is explicitly provided
    if (status) {
        query.status = status;
    } else {
        query.status = { $ne: 'unsubscribed' }; // Exclude unsubscribed by default
    }

    if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { email: searchRegex },
            { name: searchRegex }
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [subscribers, total] = await Promise.all([
        Subscriber.find(query)
            .populate('groups', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        Subscriber.countDocuments(query)
    ]);

    res.json({
        subscribers,
        group: {
            id: group._id,
            name: group.name
        },
        pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            hasNext: skip + subscribers.length < total,
            hasPrev: parseInt(page) > 1
        }
    });
});

// @desc    Get single subscriber
// @route   GET /api/subscribers/:id
// @access  Private
const getSubscriber = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }

    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id })
        .populate('groups', 'name description');

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Compute opens/clicks counts and simple percent deltas (current vs previous period)
    try {
        // Define periods: last 30 days vs previous 30 days
        const now = new Date();
        const periodDays = parseInt(process.env.SUBSCRIBER_STATS_PERIOD_DAYS || '30', 10);
        const periodStart = new Date(now.getTime() - periodDays * 24 * 3600 * 1000);
        const prevPeriodStart = new Date(periodStart.getTime() - periodDays * 24 * 3600 * 1000);

        // We will compute event rates (events per day) for the current and previous period
        const [opensCurrentCount, opensPrevCount, clicksCurrentCount, clicksPrevCount, openCampaigns, clickCampaigns] = await Promise.all([
            OpenEvent.countDocuments({ subscriber: id, timestamp: { $gte: periodStart, $lte: now } }),
            OpenEvent.countDocuments({ subscriber: id, timestamp: { $gte: prevPeriodStart, $lt: periodStart } }),
            ClickEvent.countDocuments({ subscriber: id, timestamp: { $gte: periodStart, $lte: now } }),
            ClickEvent.countDocuments({ subscriber: id, timestamp: { $gte: prevPeriodStart, $lt: periodStart } }),
            OpenEvent.aggregate([
                { $match: { subscriber: mongoose.Types.ObjectId(id), campaign: { $exists: true, $ne: null } } },
                { $group: { _id: '$campaign' } }
            ]),
            ClickEvent.aggregate([
                { $match: { subscriber: mongoose.Types.ObjectId(id), campaign: { $exists: true, $ne: null } } },
                { $group: { _id: '$campaign' } }
            ])
        ]);

        const periodDaysFloat = Math.max(1, periodDays);
        const opensRateCurrent = opensCurrentCount / periodDaysFloat;
        const opensRatePrev = opensPrevCount / periodDaysFloat;
        const clicksRateCurrent = clicksCurrentCount / periodDaysFloat;
        const clicksRatePrev = clicksPrevCount / periodDaysFloat;

        const calcRateDelta = (currentRate, prevRate) => {
            if (prevRate === 0 && currentRate === 0) return 0;
            if (prevRate === 0) return 100;
            return ((currentRate - prevRate) / Math.max(1e-6, prevRate)) * 100;
        };

        // Unique campaign count across opens and clicks
        const campaignIds = new Set();
        (openCampaigns || []).forEach(c => c && c._id && campaignIds.add(String(c._id)));
        (clickCampaigns || []).forEach(c => c && c._id && campaignIds.add(String(c._id)));
        const campaignCountCombined = campaignIds.size;

        const subscriberWithStats = subscriber.toObject ? subscriber.toObject() : Object.assign({}, subscriber);
        subscriberWithStats.opensCount = opensCurrentCount;
        subscriberWithStats.clicksCount = clicksCurrentCount;
        subscriberWithStats.campaignCount = campaignCountCombined;
        subscriberWithStats.opensDelta = Number(calcRateDelta(opensRateCurrent, opensRatePrev).toFixed(1));
        subscriberWithStats.clicksDelta = Number(calcRateDelta(clicksRateCurrent, clicksRatePrev).toFixed(1));

        return res.json(subscriberWithStats);
    } catch (err) {
        console.error('Failed to compute subscriber stats:', err.message);
        // fallback: return subscriber without extra stats
        return res.json(subscriber);
    }
});

// @desc    Create new subscriber
// @route   POST /api/subscribers
// @access  Private
const createSubscriber = asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
        res.status(400);
        throw new Error(errors.array().map(err => err.msg).join(', '));
    }

    const { email, firstName, lastName, status, customFields, groupIds, groupId, doubleOptIn } = req.body;
    
    
    console.log('Create subscriber request:', { email, firstName, lastName, status, customFields, groupIds, groupId });
    // Handle backward compatibility
    let validGroupIds = [];
    if (groupIds && Array.isArray(groupIds)) {
        validGroupIds = groupIds;
    } else if (groupId) {
        validGroupIds = [groupId];
    }

    // Check if subscriber already exists for this user
    const existingSubscriber = await Subscriber.findOne({
        email: email.toLowerCase(),
        user: req.user.id
    });

    if (existingSubscriber) {
        res.status(400);
        throw new Error('Subscriber with this email already exists');
    }

    // Validate group IDs if provided
    let finalGroupIds = [];
    if (validGroupIds.length > 0) {
        const groups = await Group.find({
            _id: { $in: validGroupIds },
            user: req.user.id
        });
        finalGroupIds = groups.map(group => group._id);
        // Deduplicate group IDs
        finalGroupIds = [...new Set(finalGroupIds.map(id => id.toString()))];
    }

    let initialStatus = status || 'subscribed';
    let confirmationToken;
    let confirmationExpiresAt;
    if (doubleOptIn) {
        initialStatus = 'pending';
        confirmationToken = require('crypto').randomBytes(24).toString('hex');
        const ttlHours = parseInt(process.env.DOUBLE_OPT_IN_TOKEN_TTL_HOURS || '48', 10);
        confirmationExpiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    }
    const subscriber = await Subscriber.create({
        user: req.user.id,
        groups: finalGroupIds,
        email: email.toLowerCase(),
        name: `${firstName || ''} ${lastName || ''}`.trim(),
        status: initialStatus,
    // tags removed
        customFields: customFields || {},
        source: 'manual',
        confirmationToken,
        confirmationSentAt: doubleOptIn ? new Date() : undefined,
        confirmationExpiresAt
    });

    // Add subscriber to groups
    if (finalGroupIds.length > 0) {
        await Group.updateMany(
            { _id: { $in: finalGroupIds } },
            { $addToSet: { subscribers: subscriber._id } }
        );
        // Update subscriberCount for affected groups
        for (const gId of finalGroupIds) {
            const grp = await Group.findById(gId);
            if (grp) await grp.updateSubscriberCount();
        }
    }

    const populatedSubscriber = await Subscriber.findById(subscriber._id)
        .populate('groups', 'name');

    if (doubleOptIn) {
        try {
            const emailService = require('../services/emailService');
            const confirmUrl = `${process.env.FRONTEND_URL || ''}/confirm?token=${confirmationToken}`;
            await emailService.sendEmail({
                to: subscriber.email,
                subject: 'Confirm your subscription',
                html: `<p>Please confirm your subscription by clicking <a href="${confirmUrl}">here</a>.</p>`
            });
        } catch (e) {
            console.error('Failed to send confirmation email', e.message);
        }
    }

    res.status(201).json(populatedSubscriber);
});

// @desc Confirm subscriber via token
// @route GET /api/subscribers/confirm/:token
// @access Public
const confirmSubscriber = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const subscriber = await Subscriber.findOne({ confirmationToken: token, status: 'pending' });
    if (!subscriber) { res.status(404); throw new Error('Invalid or expired token'); }
    if (subscriber.confirmationExpiresAt && subscriber.confirmationExpiresAt < new Date()) {
        res.status(400); throw new Error('Confirmation token expired');
    }
    subscriber.status = 'subscribed';
    subscriber.confirmedAt = new Date();
    subscriber.confirmationToken = undefined;
    subscriber.confirmationExpiresAt = undefined;
    await subscriber.save();
    try {
        const ConsentRecord = require('../models/ConsentRecord');
        await ConsentRecord.create({
            subscriber: subscriber._id,
            email: subscriber.email,
            user: subscriber.user,
            type: 'signup',
            method: 'double-opt-in',
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
    } catch(err) {
        console.error('Failed to record consent', err.message);
    }
    res.json({ message: 'Subscription confirmed' });
});

// @desc Resend confirmation email
// @route POST /api/subscribers/:id/resend-confirmation
// @access Private
const resendConfirmation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) { res.status(400); throw new Error('Invalid subscriber ID'); }
    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) { res.status(404); throw new Error('Subscriber not found'); }
    if (subscriber.status !== 'pending') { res.status(400); throw new Error('Subscriber is not pending confirmation'); }
    subscriber.confirmationToken = require('crypto').randomBytes(24).toString('hex');
    subscriber.confirmationSentAt = new Date();
    const ttlHours = parseInt(process.env.DOUBLE_OPT_IN_TOKEN_TTL_HOURS || '48', 10);
    subscriber.confirmationExpiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    await subscriber.save();
    try {
        const emailService = require('../services/emailService');
        const confirmUrl = `${process.env.FRONTEND_URL || ''}/confirm?token=${subscriber.confirmationToken}`;
        await emailService.sendEmail({
            to: subscriber.email,
            subject: 'Confirm your subscription',
            html: `<p>Please confirm your subscription by clicking <a href="${confirmUrl}">here</a>.</p>`
        });
    } catch(e) {
        console.error('Failed to resend confirmation email', e.message);
    }
    res.json({ message: 'Confirmation email resent' });
});

// @desc    Update subscriber
// @route   PUT /api/subscribers/:id
// @access  Private
const updateSubscriber = asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400);
        throw new Error(errors.array().map(err => err.msg).join(', '));
    }

    const { id } = req.params;
    const { email, firstName, lastName, status, customFields, groupIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }

    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Check if email is being changed and if it already exists
    if (email && email.toLowerCase() !== subscriber.email) {
        const existingSubscriber = await Subscriber.findOne({
            email: email.toLowerCase(),
            user: req.user.id,
            _id: { $ne: id }
        });

        if (existingSubscriber) {
            res.status(400);
            throw new Error('Another subscriber with this email already exists');
        }
    }

    // Update basic fields
    if (email !== undefined) subscriber.email = email.toLowerCase();
    if (firstName !== undefined) subscriber.name = firstName;
    if (lastName !== undefined) subscriber.name = subscriber.name ? `${subscriber.name} ${lastName}` : lastName;
    // tags removed
    if (customFields !== undefined) subscriber.customFields = customFields;

    // Handle status changes
    if (status !== undefined && status !== subscriber.status) {
        subscriber.status = status;
        if (status === 'unsubscribed') {
            subscriber.unsubscriptionDate = new Date();
        } else if (status === 'subscribed' && subscriber.status === 'unsubscribed') {
            subscriber.unsubscriptionDate = undefined;
        }
    }

    // Handle group changes
    if (groupIds !== undefined) {
        const oldGroupIds = subscriber.groups.map(id => id.toString());
        
        // Validate new group IDs
        let validGroupIds = [];
        if (groupIds.length > 0) {
            const groups = await Group.find({
                _id: { $in: groupIds },
                user: req.user.id
            });
            validGroupIds = groups.map(group => group._id.toString());
        }

        subscriber.groups = validGroupIds;

        // Update group relationships
        const groupsToRemove = oldGroupIds.filter(id => !validGroupIds.includes(id));
        const groupsToAdd = validGroupIds.filter(id => !oldGroupIds.includes(id));

        if (groupsToRemove.length > 0) {
            await Group.updateMany(
                { _id: { $in: groupsToRemove } },
                { $pull: { subscribers: subscriber._id } }
            );
        }

        if (groupsToAdd.length > 0) {
            await Group.updateMany(
                { _id: { $in: groupsToAdd } },
                { $addToSet: { subscribers: subscriber._id } }
            );
        }

        // Update subscriberCount for affected groups
        const affectedGroupIds = [...new Set([...groupsToRemove, ...groupsToAdd])];
        for (const gId of affectedGroupIds) {
            const grp = await Group.findById(gId);
            if (grp) await grp.updateSubscriberCount();
        }
    }

    await subscriber.save();

    const updatedSubscriber = await Subscriber.findById(id)
        .populate('groups', 'name');

    res.json(updatedSubscriber);
});

// @desc    Delete subscriber
// @route   DELETE /api/subscribers/:id
// @access  Private
const deleteSubscriber = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }

    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Remove from all groups
    if (subscriber.groups && subscriber.groups.length > 0) {
        await Group.updateMany(
            { _id: { $in: subscriber.groups } },
            { $pull: { subscribers: subscriber._id } }
        );
        for (const gId of subscriber.groups) {
            const grp = await Group.findById(gId);
            if (grp) await grp.updateSubscriberCount();
        }
    }

    // Clean up any tags that were only used by this subscriber
    // tag cleanup removed

    await subscriber.deleteOne();

    res.json({ message: 'Subscriber deleted successfully' });
});

// @desc    Bulk import subscribers
// @route   POST /api/subscribers/import
// @access  Private
const bulkImportSubscribers = asyncHandler(async (req, res) => {
    console.log('Starting bulk import...');
    const { subscribers, overwriteExisting = false, groupIds = [] } = req.body;

    const results = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: []
    };

    // Get existing emails to check for duplicates
    const existingEmails = new Map(
        (await Subscriber.find({ 
            user: req.user.id,
            email: { $in: subscribers.map(s => s.email.toLowerCase()) }
    }).select('email')).map(s => [s.email, s])
    );

    // Validate group IDs if provided
    let validGroupIds = [];
    if (groupIds.length > 0) {
        const groups = await Group.find({
            _id: { $in: groupIds },
            user: req.user.id
        });
        validGroupIds = groups.map(group => group._id);
    }

    // Resolve per-row group names to group IDs (create missing) before tag processing
    const allGroupNames = new Set();
    subscribers.forEach(s => {
        if (Array.isArray(s.groups)) {
            s.groups.forEach(name => {
                const n = String(name).trim();
                if (n) allGroupNames.add(n);
            });
        }
    });
    const groupNameToId = new Map();
    if (allGroupNames.size > 0) {
        const existingGroupsByName = await Group.find({
            user: req.user.id,
            name: { $in: Array.from(allGroupNames) }
        });
        existingGroupsByName.forEach(g => groupNameToId.set(g.name, g._id));
        const missingGroupNames = Array.from(allGroupNames).filter(n => !groupNameToId.has(n));
        if (missingGroupNames.length > 0) {
            const newGroups = await Group.insertMany(
                missingGroupNames.map(name => ({ user: req.user.id, name }))
            );
            newGroups.forEach(g => groupNameToId.set(g.name, g._id));
        }
    }
    // Track groups to update across the import
    const groupsToUpdate = new Set(validGroupIds.map(id => id.toString()));

    // Tag model removed

    // Process each subscriber's tags and create missing ones
    // Tag resolution removed

    // Process subscribers in batches
    const batchSize = 100;
    for (let i = 0; i < subscribers.length; i += batchSize) {
        const batch = subscribers.slice(i, i + batchSize);
        const operations = batch.map(subscriber => {
            try {
                const email = subscriber.email.toLowerCase();
                const existingSubscriber = existingEmails.get(email);

                if (existingSubscriber && !overwriteExisting) {
                    results.skipped++;
                    return null;
                }

                // Convert subscriber's tag names to tag IDs
                // tags removed

                // Resolve per-row group names to IDs and combine with global groupIds
                const rowGroupIds = Array.isArray(subscriber.groups)
                    ? subscriber.groups.map(n => groupNameToId.get(String(n).trim())).filter(Boolean)
                    : [];
                const combinedGroupIds = Array.from(new Set([...(validGroupIds || []), ...rowGroupIds]));
                combinedGroupIds.forEach(id => groupsToUpdate.add(id.toString()));

                const subscriberData = {
                    user: req.user.id,
                    email,
                    name: `${subscriber.firstName || ''} ${subscriber.lastName || ''}`.trim(),
                    status: subscriber.status || 'subscribed',
                    groups: combinedGroupIds,
                    // tags removed
                    customFields: subscriber.customFields || {},
                    source: 'import'
                };

                if (existingSubscriber) {
                    return {
                        updateOne: {
                            filter: { user: req.user.id, email: email },
                            update: { $set: subscriberData },
                            upsert: false
                        }
                    };
                }

                return {
                    insertOne: {
                        document: subscriberData
                    }
                };
            } catch (error) {
                results.errors.push(`Error processing subscriber ${subscriber.email}: ${error.message}`);
                return null;
            }
        }).filter(op => op !== null);

        if (operations.length > 0) {
            try {
                const result = await Subscriber.bulkWrite(operations);
                results.imported += result.insertedCount || 0;
                results.updated += result.modifiedCount || 0;
            } catch (error) {
                results.errors.push(`Batch processing error: ${error.message}`);
            }
        }
    }

    // Update groups with new subscribers (both global and per-row)
    try {
        const allGroupIdsToUpdate = Array.from(groupsToUpdate).map(id => new mongoose.Types.ObjectId(id));
        if (allGroupIdsToUpdate.length > 0) {
            const emails = subscribers.map(s => s.email.toLowerCase());
            const importedSubs = await Subscriber.find({ user: req.user.id, email: { $in: emails } }).select('_id');
            const ids = importedSubs.map(s => s._id);
            if (ids.length > 0) {
                await Group.updateMany(
                    { _id: { $in: allGroupIdsToUpdate } },
                    { $addToSet: { subscribers: { $each: ids } } }
                );
                // Update subscriberCount for all affected groups
                for (const gId of allGroupIdsToUpdate) {
                    const grp = await Group.findById(gId);
                    if (grp) await grp.updateSubscriberCount();
                }
            }
        }
    } catch (error) {
        results.errors.push(`Group update error: ${error.message}`);
    }

    results.total = subscribers.length;
    res.status(200).json(results);
});

// @desc    Get subscriber statistics
// @route   GET /api/subscribers/stats
// @access  Private
const getSubscriberStats = asyncHandler(async (req, res) => {
    const stats = await Subscriber.getStats(req.user.id);
    const total = await Subscriber.countDocuments({ user: req.user.id });

    const formattedStats = {
        total,
        subscribed: 0,
        unsubscribed: 0,
    // simplified: only subscribed/unsubscribed tracked now
    };

    stats.forEach(stat => {
        formattedStats[stat._id] = stat.count;
    });

    res.json(formattedStats);
});


// @desc    Add subscriber to group
// @route   POST /api/subscribers/:id/groups/:groupId
// @access  Private
const addSubscriberToGroup = asyncHandler(async (req, res) => {
    const { id, groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(groupId)) {
        res.status(400);
        throw new Error('Invalid ID format');
    }

    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    const group = await Group.findOne({ _id: groupId, user: req.user.id });
    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    // Use idempotent updates to avoid duplicates
    await Subscriber.updateOne(
        { _id: id, user: req.user.id },
        { $addToSet: { groups: groupId } }
    );
    await Group.updateOne(
        { _id: groupId, user: req.user.id },
        { $addToSet: { subscribers: id } }
    );
    // Update subscriberCount
    await group.updateSubscriberCount();

    res.json({ message: 'Subscriber added to group successfully' });
});

// @desc    Remove subscriber from group
// @route   DELETE /api/subscribers/:id/groups/:groupId
// @access  Private
const removeSubscriberFromGroup = asyncHandler(async (req, res) => {
    const { id, groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(groupId)) {
        res.status(400);
        throw new Error('Invalid ID format');
    }

    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }
    // Validate group ownership
    const group = await Group.findOne({ _id: groupId, user: req.user.id });
    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    await Subscriber.updateOne(
        { _id: id, user: req.user.id },
        { $pull: { groups: groupId } }
    );

    await Group.updateOne(
        { _id: groupId, user: req.user.id },
        { $pull: { subscribers: id } }
    );
    await group.updateSubscriberCount();

    res.json({ message: 'Subscriber removed from group successfully' });
});

// @desc    Delete multiple subscribers
// @route   DELETE /api/subscribers/bulk
// @access  Private
const bulkDeleteSubscribers = asyncHandler(async (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids)) {
        res.status(400);
        throw new Error('Invalid request: ids must be an array');
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
        res.status(400);
        throw new Error('No valid subscriber IDs provided');
    }

    // Find all subscribers that belong to the user
    const subscribers = await Subscriber.find({
        _id: { $in: validIds },
        user: req.user.id
    });

    if (subscribers.length === 0) {
        res.status(404);
        throw new Error('No subscribers found');
    }

    // Track affected groups to update counts once at the end
    const affectedGroupIds = new Set();

    // Process each subscriber
    for (const subscriber of subscribers) {
        // Clean up groups
        if (subscriber.groups && subscriber.groups.length > 0) {
            await Group.updateMany(
                { _id: { $in: subscriber.groups } },
                { $pull: { subscribers: subscriber._id } }
            );
            subscriber.groups.forEach(g => affectedGroupIds.add(g.toString()));
        }

    // tags already removed; no tag cleanup necessary
    }

    // Delete all subscribers at once
    await Subscriber.deleteMany({
        _id: { $in: subscribers.map(s => s._id) }
    });

    // Update subscriberCount for affected groups
    for (const gId of affectedGroupIds) {
        const grp = await Group.findById(gId);
        if (grp) await grp.updateSubscriberCount();
    }

    res.json({ 
        message: 'Subscribers deleted successfully',
        count: subscribers.length
    });
});

module.exports = {
    getSubscribers,
    getSubscribersByGroup,
    getSubscriber,
    createSubscriber,
    updateSubscriber,
    deleteSubscriber,
    bulkImportSubscribers,
    getSubscriberStats,
    addSubscriberToGroup,
    removeSubscriberFromGroup,
    segmentSubscribers,
    bulkDeleteSubscribers,
    getSubscriberActivity,
    confirmSubscriber,
    resendConfirmation,
    // Added below after export
};

// --- Added Bulk Status Update & Export Selected (appending exports for clarity) ---

// @desc    Bulk update status for multiple subscribers
// @route   POST /api/subscribers/bulk/status
// @access  Private
const bulkUpdateSubscriberStatus = asyncHandler(async (req, res) => {
    const { ids, status } = req.body;
    const allowed = ['subscribed', 'unsubscribed', 'pending'];
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400); throw new Error('ids array required'); }
    if (!allowed.includes(status)) { res.status(400); throw new Error('Invalid status'); }
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) { res.status(400); throw new Error('No valid IDs'); }
    const result = await Subscriber.updateMany(
        { _id: { $in: validIds }, user: req.user.id },
        { $set: { status } }
    );
    res.json({ message: 'Status updated', matched: result.matchedCount || result.n, modified: result.modifiedCount || result.nModified });
});

// @desc    Export selected subscribers as CSV
// @route   POST /api/subscribers/bulk/export
// @access  Private
const exportSelectedSubscribers = asyncHandler(async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400); throw new Error('ids array required'); }
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) { res.status(400); throw new Error('No valid IDs'); }
    const subscribers = await Subscriber.find({ _id: { $in: validIds }, user: req.user.id })
        .populate('groups', 'name')
        .lean();
    const rows = subscribers.map(s => ({
        email: s.email,
        status: s.status,
        groups: (s.groups || []).map(g => g.name).join(';'),
        createdAt: s.createdAt ? s.createdAt.toISOString() : '',
        updatedAt: s.updatedAt ? s.updatedAt.toISOString() : ''
    }));
    const header = 'email,status,groups,createdAt,updatedAt';
    const csv = [header, ...rows.map(r => `${escapeCsv(r.email)},${escapeCsv(r.status)},${escapeCsv(r.groups)},${escapeCsv(r.createdAt)},${escapeCsv(r.updatedAt)}`)].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="subscribers_export.csv"');
    return res.status(200).send(csv);
});

// @desc    Unsubscribe subscriber from all campaigns
// @route   POST /api/subscribers/unsubscribe
// @access  Public (no auth required for unsubscribe links)
const unsubscribeSubscriber = asyncHandler(async (req, res) => {
    const { email, campaignId, subscriberId } = req.body;

    if (!email && !subscriberId) {
        res.status(400);
        throw new Error('Email or subscriber ID is required');
    }

    let subscriber;
    if (subscriberId) {
        if (!mongoose.Types.ObjectId.isValid(subscriberId)) {
            res.status(400);
            throw new Error('Invalid subscriber ID');
        }
        subscriber = await Subscriber.findById(subscriberId);
    } else {
        subscriber = await Subscriber.findOne({ email: email.toLowerCase() });
    }

    if (!subscriber) {
        // Return success even if subscriber not found to prevent email enumeration
        return res.status(200).json({
            success: true,
            message: 'Successfully unsubscribed'
        });
    }

    // Mark as unsubscribed
    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();

    // Log the unsubscribe event if campaignId is provided
    if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
        // You could add an UnsubscribeEvent model here if needed for tracking
        console.log(`Subscriber ${subscriber._id} unsubscribed from campaign ${campaignId}`);
    }

    res.status(200).json({
        success: true,
        message: 'Successfully unsubscribed'
    });
});

// @desc    Handle unsubscribe link clicks (GET request for email links)
// @route   GET /api/subscribers/unsubscribe/:subscriberId/:campaignId?
// @access  Public
const handleUnsubscribeLink = asyncHandler(async (req, res) => {
    const { subscriberId, campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(subscriberId)) {
        return res.status(400).send('Invalid unsubscribe link');
    }

    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
        return res.status(200).send('Successfully unsubscribed');
    }

    // Mark as unsubscribed (industry standard - don't delete for compliance)
    subscriber.status = 'unsubscribed';
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();

    // Log the unsubscribe event
    if (campaignId && mongoose.Types.ObjectId.isValid(campaignId)) {
        console.log(`Subscriber ${subscriber._id} unsubscribed via link from campaign ${campaignId}`);
    }

    // Return a simple HTML page confirming unsubscribe
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Unsubscribed</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                h1 { color: #333; margin-bottom: 20px; }
                p { color: #666; line-height: 1.6; }
                .footer { margin-top: 30px; font-size: 12px; color: #999; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>You've been unsubscribed</h1>
                <p>You will no longer receive emails from this sender.</p>
                <p>If you change your mind, you can always resubscribe through our website.</p>
                <div class="footer">
                    <p>Powered by <strong>EmailXP</strong></p>
                </div>
            </div>
        </body>
        </html>
    `);
});

function escapeCsv(value) {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// Re-export with new handlers (keeping existing export behavior)
module.exports.bulkUpdateSubscriberStatus = bulkUpdateSubscriberStatus;
module.exports.exportSelectedSubscribers = exportSelectedSubscribers;
module.exports.unsubscribeSubscriber = unsubscribeSubscriber;
module.exports.handleUnsubscribeLink = handleUnsubscribeLink;

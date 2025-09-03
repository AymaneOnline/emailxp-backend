const asyncHandler = require('express-async-handler');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const OpenEvent = require('../models/OpenEvent');
const ClickEvent = require('../models/ClickEvent');
const Subscriber = require('../models/Subscriber');
const Group = require('../models/Group');
const { cleanupTagsForSubscriber } = require('../utils/tagCleanup');

// @desc    Get subscriber activity history (opens, clicks, status)
// @route   GET /api/subscribers/:id/activity
// @access  Private
const getSubscriberActivity = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }
    // Fetch opens
    const opens = await OpenEvent.find({ subscriber: id })
        .sort({ timestamp: -1 })
        .limit(50)
        .select('campaign timestamp email ipAddress userAgent');
    // Fetch clicks
    const clicks = await ClickEvent.find({ subscriber: id })
        .sort({ timestamp: -1 })
        .limit(50)
        .select('campaign url timestamp email ipAddress userAgent');
    // Fetch status changes (from subscriber doc history)
    const subscriber = await Subscriber.findById(id).select('status createdAt updatedAt unsubscribedAt');
    res.json({
        opens,
        clicks,
        statusHistory: {
            status: subscriber.status,
            createdAt: subscriber.createdAt,
            updatedAt: subscriber.updatedAt,
            unsubscribedAt: subscriber.unsubscribedAt || null
        }
    });
});
// @desc    Segment subscribers by tags, groups, status, signup date
// @route   POST /api/subscribers/segment
// @access  Private
const segmentSubscribers = asyncHandler(async (req, res) => {
    const { tagIds = [], groupIds = [], status, signupFrom, signupTo, search, page = 1, limit = 20 } = req.body;
    const query = { user: req.user.id };
    if (Array.isArray(tagIds) && tagIds.length > 0) {
        query.tags = { $in: tagIds };
    }
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
            .populate('tags', 'name color')
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
// @desc    Add tag(s) to a subscriber
// @route   POST /api/subscribers/:id/tags
// @access  Private
const addTagsToSubscriber = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { tagIds } = req.body; // array of tag ObjectIds
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
        res.status(400);
        throw new Error('No tag IDs provided');
    }
    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }
    // Add tags, avoiding duplicates
    subscriber.tags = Array.from(new Set([...subscriber.tags.map(t => t.toString()), ...tagIds]));
    await subscriber.save();
    res.json(subscriber);
});

// @desc    Remove tag(s) from a subscriber
// @route   DELETE /api/subscribers/:id/tags
// @access  Private
const removeTagsFromSubscriber = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { tagIds } = req.body; // array of tag ObjectIds
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400);
        throw new Error('Invalid subscriber ID');
    }
    if (!Array.isArray(tagIds) || tagIds.length === 0) {
        res.status(400);
        throw new Error('No tag IDs provided');
    }
    const subscriber = await Subscriber.findOne({ _id: id, user: req.user.id });
    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }
    subscriber.tags = subscriber.tags.filter(tag => !tagIds.includes(tag.toString()));
    await subscriber.save();
    res.json(subscriber);
});

// @desc    Get all subscribers with filtering, searching, and pagination
// @route   GET /api/subscribers
// @access  Private
const getSubscribers = asyncHandler(async (req, res) => {
    const {
        groupId,
        status,
        search,
        tag,
        signupFrom,
        signupTo,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    console.log('Get subscribers request:', { groupId, status, search, tag, page, limit, sortBy, sortOrder });
    console.log('User ID:', req.user.id);

    // Build query for user's subscribers
    const query = { user: req.user.id };

    if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        query.groups = groupId;
    }

    if (status) {
        query.status = status;
    }

    if (tag) {
        query.tags = { $in: [tag] };
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

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [subscribers, total] = await Promise.all([
        Subscriber.find(query)
            .populate('groups', 'name')
            .populate('tags', 'name color')  // Add this line to populate tags
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

    if (status) {
        query.status = status;
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
            .populate('tags', 'name color')  // Add this line to populate tags
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

    res.json(subscriber);
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

    const { email, firstName, lastName, status, tags, customFields, groupIds, groupId } = req.body;
    
    
    console.log('Create subscriber request:', { email, firstName, lastName, status, tags, customFields, groupIds, groupId });
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

    const subscriber = await Subscriber.create({
        user: req.user.id,
        groups: finalGroupIds,
        email: email.toLowerCase(),
        name: `${firstName || ''} ${lastName || ''}`.trim(),
        status: status || 'subscribed',
        tags: tags || [],
        customFields: customFields || {},
        source: 'manual'
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

    res.status(201).json(populatedSubscriber);
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
    const { email, firstName, lastName, status, tags, customFields, groupIds } = req.body;

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
    if (tags !== undefined) subscriber.tags = tags;
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
    await cleanupTagsForSubscriber(subscriber._id);

    await subscriber.deleteOne();

    res.json({ message: 'Subscriber deleted successfully' });
});

// @desc    Bulk import subscribers
// @route   POST /api/subscribers/import
// @access  Private
const bulkImportSubscribers = asyncHandler(async (req, res) => {
    console.log('Starting bulk import...');
    const { subscribers, overwriteExisting = false, groupIds = [], tagNames = [], tagIds = [] } = req.body;

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
        }).select('email tags')).map(s => [s.email, s])
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

    // Import Tag model at the top level
    const Tag = require('../models/Tag');

    // Process each subscriber's tags and create missing ones
    const allTagNames = new Set(Array.isArray(tagNames) ? tagNames.map(n => String(n).trim()) : []);
    subscribers.forEach(subscriber => {
        if (Array.isArray(subscriber.tags)) {
            subscriber.tags.forEach(tag => allTagNames.add(String(tag).trim()));
        }
    });

    // Get existing tags
    const existingTags = await Tag.find({
        user: req.user.id,
        name: { $in: Array.from(allTagNames) }
    });

    // Create map of tag name to tag ID
    const tagNameToId = new Map();
    existingTags.forEach(tag => tagNameToId.set(tag.name, tag._id));

    // Create missing tags
    const missingTagNames = Array.from(allTagNames).filter(name => !tagNameToId.has(name));
    if (missingTagNames.length > 0) {
        const newTags = await Tag.insertMany(
            missingTagNames.map(name => ({
                user: req.user.id,
                name,
                color: '#' + Math.floor(Math.random()*16777215).toString(16)
            }))
        );
        newTags.forEach(tag => tagNameToId.set(tag.name, tag._id));
    }

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
                const baseTagIds = Array.isArray(tagNames) ? tagNames.map(n => tagNameToId.get(n)).filter(Boolean) : [];
                const subscriberTagIds = new Set([...(tagIds || []), ...baseTagIds]);
                if (Array.isArray(subscriber.tags)) {
                    subscriber.tags.forEach(tagName => {
                        const tagId = tagNameToId.get(tagName.trim());
                        if (tagId) subscriberTagIds.add(tagId);
                    });
                }

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
                    tags: Array.from(subscriberTagIds),
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
        bounced: 0,
        complained: 0
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

        // Clean up tags
        await cleanupTagsForSubscriber(subscriber._id);
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
    addTagsToSubscriber,
    removeTagsFromSubscriber,
    segmentSubscribers,
    bulkDeleteSubscribers,
    getSubscriberActivity
};

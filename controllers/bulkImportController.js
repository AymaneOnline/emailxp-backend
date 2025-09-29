const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Subscriber = require('../models/Subscriber');
const Group = require('../models/Group');
const Tag = require('../models/Tag');

const processImportRows = async ({ rows, userId, overwriteExisting = false, groupIds = [], tagNames = [] }) => {
    console.log('Starting bulk import with:', { subscriberCount: rows.length, overwriteExisting, groupIds, tagNames });

    const results = {
        imported: 0,
        updated: 0,
        skipped: 0,
        errors: []
    };

    // Normalize emails list for lookup
    const emails = rows.map(r => (r.email || '').toString().toLowerCase()).filter(Boolean);

    // Get existing emails to check for duplicates
    const existingEmails = new Map(
        (await Subscriber.find({ 
            user: userId,
            email: { $in: emails },
            isDeleted: false
        }).select('email tags')).map(s => [s.email, s])
    );

    // Validate group IDs if provided (global groups)
    let validGroupIds = [];
    if (Array.isArray(groupIds) && groupIds.length > 0) {
        const groups = await Group.find({
            _id: { $in: groupIds },
            user: userId
        });
        validGroupIds = groups.map(group => group._id);
    }

    // Collect per-row group names (to create/resolve) and tag names from CSV rows
    const allGroupNames = new Set();
    const allTagNamesFromRows = new Set(tagNames || []);
    rows.forEach(r => {
        // rows may already be normalized objects or raw strings
        if (r && r.groups) {
            if (Array.isArray(r.groups)) {
                r.groups.forEach(g => { if (g && String(g).trim()) allGroupNames.add(String(g).trim()); });
            } else if (typeof r.groups === 'string') {
                String(r.groups).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach(g => allGroupNames.add(g));
            }
        }
        if (r && r.tags) {
            if (Array.isArray(r.tags)) r.tags.forEach(t => allTagNamesFromRows.add(String(t).trim()));
            else if (typeof r.tags === 'string') String(r.tags).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach(t => allTagNamesFromRows.add(t));
        }
    });

    // Resolve or create groups referenced in rows
    const groupNameToId = new Map();
    if (allGroupNames.size > 0) {
        const existingGroupsByName = await Group.find({ user: userId, name: { $in: Array.from(allGroupNames) } });
        existingGroupsByName.forEach(g => groupNameToId.set(g.name, g._id));
        const missingGroupNames = Array.from(allGroupNames).filter(n => !groupNameToId.has(n));
        if (missingGroupNames.length > 0) {
            const newGroups = await Group.insertMany(missingGroupNames.map(name => ({ user: userId, name })));
            newGroups.forEach(g => groupNameToId.set(g.name, g._id));
        }
    }

    // Process tags - combine provided tagNames with tags from rows
    const Tag = require('../models/Tag');
    const combinedTagNames = Array.from(allTagNamesFromRows);
    const existingTags = combinedTagNames.length > 0 ? await Tag.find({ user: userId, name: { $in: combinedTagNames } }) : [];
    const tagsByName = new Map(existingTags.map(tag => [tag.name, tag]));
    const tagIds = new Set();

    // Create missing tags found in CSV rows or passed as global tagNames
    const tagsToCreate = combinedTagNames.filter(name => !tagsByName.has(name));
    if (tagsToCreate.length > 0) {
        const newTags = await Tag.insertMany(
            tagsToCreate.map(name => ({
                user: userId,
                name,
                color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
            }))
        );
        newTags.forEach(tag => {
            tagsByName.set(tag.name, tag);
            tagIds.add(tag._id);
        });
    }
    existingTags.forEach(tag => tagIds.add(tag._1d));

    // Track groups to update after import
    const groupsToUpdate = new Set(validGroupIds.map(id => id.toString()));

    // Process subscribers in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const operations = batch.map((rawSubscriber, index) => {
            try {
                const subscriber = rawSubscriber || {};

                if (!subscriber || !subscriber.email) {
                    results.errors.push(`Missing email for row at index ${i + index}`);
                    return null;
                }

                const email = (subscriber.email || '').toString().toLowerCase();
                const existingSubscriber = existingEmails.get(email);

                if (existingSubscriber && !overwriteExisting) {
                    results.skipped++;
                    return null;
                }

                // Build subscriber-specific tag IDs
                const subscriberTagIds = new Set();
                (Array.from(tagsByName.keys()) || []).forEach(tagName => {
                    const tag = tagsByName.get(tagName);
                    if (tag) subscriberTagIds.add(tag._id);
                });
                if (Array.isArray(subscriber.tags)) {
                    subscriber.tags.forEach(tagName => {
                        const tag = tagsByName.get(tagName.trim());
                        if (tag) subscriberTagIds.add(tag._id);
                    });
                } else if (typeof subscriber.tags === 'string' && subscriber.tags.trim()) {
                    String(subscriber.tags).split(/[,;|]/).map(t => t.trim()).filter(Boolean).forEach(tagName => {
                        const tag = tagsByName.get(tagName);
                        if (tag) subscriberTagIds.add(tag._id);
                    });
                }

                // Resolve per-row group IDs
                const rowGroupIds = [];
                if (subscriber.groups) {
                    if (Array.isArray(subscriber.groups)) {
                        subscriber.groups.forEach(name => {
                            const n = String(name).trim();
                            const gid = groupNameToId.get(n);
                            if (gid) rowGroupIds.push(gid);
                        });
                    } else if (typeof subscriber.groups === 'string') {
                        String(subscriber.groups).split(/[,;|]/).map(s => s.trim()).filter(Boolean).forEach(name => {
                            const gid = groupNameToId.get(name);
                            if (gid) rowGroupIds.push(gid);
                        });
                    }
                }

                const combinedGroupIds = Array.from(new Set([...(validGroupIds || []), ...rowGroupIds]));
                combinedGroupIds.forEach(id => groupsToUpdate.add(id.toString()));

                const subscriberData = {
                    user: userId,
                    email,
                    firstName: subscriber.firstName || '',
                    lastName: subscriber.lastName || '',
                    status: subscriber.status || 'subscribed',
                    groups: combinedGroupIds,
                    tags: Array.from(subscriberTagIds),
                    customFields: subscriber.customFields || {},
                    source: 'import'
                };

                if (existingSubscriber) {
                    return {
                        updateOne: {
                            filter: { user: userId, email: email },
                            update: { $set: subscriberData },
                            upsert: false
                        }
                    };
                }

                return { insertOne: { document: subscriberData } };
            } catch (error) {
                results.errors.push(`Error processing subscriber ${rawSubscriber && rawSubscriber.email}: ${error.message}`);
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

    // Update groups with imported subscriber IDs
    try {
        const allGroupIdsToUpdate = Array.from(groupsToUpdate).map(id => new mongoose.Types.ObjectId(id));
        if (allGroupIdsToUpdate.length > 0) {
            const emailsAll = rows.map(r => (r.email || '').toString().toLowerCase());
            const importedSubs = await Subscriber.find({ user: userId, email: { $in: emailsAll } }).select('_id');
            const ids = importedSubs.map(s => s._id);
            if (ids.length > 0) {
                await Group.updateMany(
                    { _id: { $in: allGroupIdsToUpdate } },
                    { $addToSet: { subscribers: { $each: ids } } }
                );
                for (const gId of allGroupIdsToUpdate) {
                    const grp = await Group.findById(gId);
                    if (grp) await grp.updateSubscriberCount();
                }
            }
        }
    } catch (error) {
        results.errors.push(`Group update error: ${error.message}`);
    }

    return results;
};

const bulkImportSubscribers = asyncHandler(async (req, res) => {
    try {
        const { subscribers, overwriteExisting = false, groupIds = [], tagNames = [] } = req.body;
        const results = await processImportRows({ rows: subscribers, userId: req.user.id, overwriteExisting, groupIds, tagNames });
        res.status(200).json(results);
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({
            message: 'Failed to import subscribers',
            error: error.message
        });
    }
});

// CSV upload handler
const importCsvSubscribers = asyncHandler(async (req, res) => {
    try {
        console.log('[importCsvSubscribers] invoked by user:', req.user && req.user.id ? req.user.id : 'unknown');
        let parse;
        try {
            ({ parse } = require('csv-parse/sync'));
        } catch (err) {
            console.error('csv-parse not installed:', err.message);
            return res.status(500).json({ message: 'CSV parser not available. Please run `npm install csv-parse` in the backend.' });
        }
        if (!req.file || !req.file.buffer) {
            console.warn('[importCsvSubscribers] missing req.file or buffer');
            return res.status(400).json({ message: 'CSV file is required' });
        }
        console.log('[importCsvSubscribers] received file:', { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size });
        const csv = req.file.buffer.toString('utf8');
        const records = parse(csv, { columns: true, skip_empty_lines: true });
        console.log(`[importCsvSubscribers] parsed ${records.length} CSV records`);
        // Normalize column names (handle headers like "First Name", "first_name", etc.)
        const subscribers = records.map(raw => {
            // Build a normalized record keyed by header normalized form
            const normalized = {};
            Object.keys(raw || {}).forEach(key => {
                const k = String(key).replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                normalized[k] = raw[key];
            });

            return {
                email: normalized.email || normalized.e_mail || normalized.em || raw.email || raw.Email,
                firstName: normalized.firstname || normalized.first || raw.firstName || raw.FirstName || '',
                lastName: normalized.lastname || normalized.last || raw.lastName || raw.LastName || '',
                status: (normalized.status || raw.status || 'subscribed'),
                tags: (normalized.tags || raw.tags) ? String(normalized.tags || raw.tags).split(/[,;|]/).map(t => t.trim()).filter(Boolean) : [],
                groups: (normalized.groups || raw.groups) ? String(normalized.groups || raw.groups).split(/[,;|]/).map(g => g.trim()).filter(Boolean) : [],
                customFields: {}
            };
        });

        const results = await processImportRows({ rows: subscribers, userId: req.user.id, overwriteExisting: req.body.overwriteExisting || false, groupIds: req.body.groupIds || [], tagNames: req.body.tagNames || [] });
        console.log('[importCsvSubscribers] import results:', results);
        res.status(200).json(results);
    } catch (error) {
        console.error('CSV import error:', error);
        res.status(500).json({ message: 'CSV import failed', error: error.message });
    }
});

module.exports = { bulkImportSubscribers, importCsvSubscribers, processImportRows };

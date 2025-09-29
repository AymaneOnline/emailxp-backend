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

    // Validate group IDs if provided
    let validGroupIds = [];
    if (Array.isArray(groupIds) && groupIds.length > 0) {
        const groups = await Group.find({
            _id: { $in: groupIds },
            user: userId
        });
        validGroupIds = groups.map(group => group._id);
    }

    // Process tags
    const Tag = require('../models/Tag');
    const existingTags = await Tag.find({
        user: userId,
        name: { $in: tagNames }
    });

    // Create map of existing tags
    const tagsByName = new Map(existingTags.map(tag => [tag.name, tag]));
    const tagIds = new Set();

    // Create missing tags
    const tagsToCreate = (tagNames || []).filter(name => !tagsByName.has(name));
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

    // Add existing tag IDs to the set
    existingTags.forEach(tag => tagIds.add(tag._id));

    // Process subscribers in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const operations = batch.map(subscriber => {
            try {
                if (!subscriber || !subscriber.email) {
                    results.errors.push(`Missing email for row at index ${i}`);
                    return null;
                }

                const email = (subscriber.email || '').toString().toLowerCase();
                const existingSubscriber = existingEmails.get(email);

                if (existingSubscriber && !overwriteExisting) {
                    results.skipped++;
                    return null;
                }

                // Get tag IDs for this subscriber
                const subscriberTagIds = new Set();
                
                // Add global tag names
                (tagNames || []).forEach(tagName => {
                    const tag = tagsByName.get(tagName.trim());
                    if (tag) subscriberTagIds.add(tag._id);
                });

                // Add subscriber-specific tags
                if (Array.isArray(subscriber.tags)) {
                    subscriber.tags.forEach(tagName => {
                        const tag = tagsByName.get(tagName.trim());
                        if (tag) subscriberTagIds.add(tag._id);
                    });
                }

                const subscriberData = {
                    user: userId,
                    email: email,
                    firstName: subscriber.firstName || '',
                    lastName: subscriber.lastName || '',
                    status: subscriber.status || 'subscribed',
                    groups: validGroupIds,
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
        let parse;
        try {
            ({ parse } = require('csv-parse/sync'));
        } catch (err) {
            console.error('csv-parse not installed:', err.message);
            return res.status(500).json({ message: 'CSV parser not available. Please run `npm install csv-parse` in the backend.' });
        }
        if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'CSV file is required' });
        const csv = req.file.buffer.toString('utf8');
        const records = parse(csv, { columns: true, skip_empty_lines: true });
        // Normalize column names to expected keys (email, firstName, lastName, status, tags)
        const subscribers = records.map(r => ({
            email: r.email || r.Email || r.E_MAIL || r.e_mail,
            firstName: r.firstName || r.first_name || r.FirstName || r.first,
            lastName: r.lastName || r.last_name || r.LastName || r.last,
            status: r.status || 'subscribed',
            tags: r.tags ? r.tags.split(/[,;|]/).map(t => t.trim()) : [],
            customFields: {}
        }));

        const results = await processImportRows({ rows: subscribers, userId: req.user.id, overwriteExisting: req.body.overwriteExisting || false, groupIds: req.body.groupIds || [], tagNames: req.body.tagNames || [] });
        res.status(200).json(results);
    } catch (error) {
        console.error('CSV import error:', error);
        res.status(500).json({ message: 'CSV import failed', error: error.message });
    }
});

module.exports = { bulkImportSubscribers, importCsvSubscribers, processImportRows };

const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Subscriber = require('../models/Subscriber');
const Group = require('../models/Group');
const Tag = require('../models/Tag');

const bulkImportSubscribers = asyncHandler(async (req, res) => {
    try {
        const { subscribers, overwriteExisting = false, groupIds = [], tagNames = [] } = req.body;
        console.log('Starting bulk import with:', { subscriberCount: subscribers.length, overwriteExisting, groupIds, tagNames });

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

        // Process tags
        const Tag = require('../models/Tag');
        const existingTags = await Tag.find({
            user: req.user.id,
            name: { $in: tagNames }
        });

        // Create map of existing tags
        const tagsByName = new Map(existingTags.map(tag => [tag.name, tag]));
        const tagIds = new Set();

        // Create missing tags
        const tagsToCreate = tagNames.filter(name => !tagsByName.has(name));
        if (tagsToCreate.length > 0) {
            const newTags = await Tag.insertMany(
                tagsToCreate.map(name => ({
                    user: req.user.id,
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

                    // Get tag IDs for this subscriber
                    const subscriberTagIds = new Set();
                    
                    // Add global tag names
                    tagNames.forEach(tagName => {
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
                        user: req.user.id,
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

        res.status(200).json(results);
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({
            message: 'Failed to import subscribers',
            error: error.message
        });
    }
});

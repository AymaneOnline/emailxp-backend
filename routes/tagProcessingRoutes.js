const express = require('express');
const router = express.Router();
const Tag = require('../models/Tag');
const { protect } = require('../middleware/authMiddleware');

// Utility function to process tags
const processTagNames = async (user, tagNames) => {
    // Get existing tags
    const existingTags = await Tag.find({
        user: user.id,
        name: { $in: tagNames }
    });

    const existingTagNames = new Set(existingTags.map(t => t.name));
    const existingTagIds = existingTags.map(t => t._id);

    // Create new tags for any that don't exist
    const newTagNames = tagNames.filter(name => !existingTagNames.has(name));
    if (newTagNames.length > 0) {
        const newTags = await Tag.insertMany(
            newTagNames.map(name => ({
                user: user.id,
                name,
                color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
            }))
        );
        existingTagIds.push(...newTags.map(t => t._id));
    }

    return existingTagIds;
};

// Route to process tags
router.post('/process', protect, async (req, res) => {
    try {
        const { tagNames } = req.body;
        if (!Array.isArray(tagNames)) {
            return res.status(400).json({ message: 'tagNames must be an array' });
        }

        const tagIds = await processTagNames(req.user, tagNames);
        res.json({ tagIds });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = {
    router,
    processTagNames
};

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const Tag = require('../models/Tag');

// All routes are protected
router.use(protect);

// Get all tags for the user
router.get('/', async (req, res) => {
  const tags = await Tag.find({ user: req.user.id });
  res.json(tags);
});

// Create a new tag
router.post('/', async (req, res) => {
  const { name, color, description } = req.body;
  const tag = new Tag({ user: req.user.id, name, color, description });
  await tag.save();
  res.status(201).json(tag);
});

// Update a tag
router.put('/:id', async (req, res) => {
  const { name, color, description } = req.body;
  const tag = await Tag.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    { name, color, description },
    { new: true }
  );
  if (!tag) return res.status(404).json({ message: 'Tag not found' });
  res.json(tag);
});

// Clean up unused tags
router.delete('/cleanup', async (req, res) => {
  try {
    // Get all tags for the user
    const tags = await Tag.find({ user: req.user.id });
    
    // Get all subscribers for the user to check their tags
    const Subscriber = require('../models/Subscriber');
    const subscribers = await Subscriber.find({ user: req.user.id }).select('tags');
    
    // Create a Set of all tags currently in use
    const usedTagIds = new Set();
    subscribers.forEach(subscriber => {
      subscriber.tags?.forEach(tagId => {
        usedTagIds.add(tagId.toString());
      });
    });
    
    // Find unused tags
    const unusedTags = tags.filter(tag => !usedTagIds.has(tag._id.toString()));
    
    // Delete unused tags
    const deletePromises = unusedTags.map(tag => Tag.findByIdAndDelete(tag._id));
    await Promise.all(deletePromises);
    
    res.json({ 
      message: `Cleaned up ${unusedTags.length} unused tags`,
      removedTags: unusedTags
    });
  } catch (error) {
    console.error('Tag cleanup error:', error);
    res.status(500).json({ message: 'Failed to cleanup tags', error: error.message });
  }
});

// Delete a tag
router.delete('/:id', async (req, res) => {
  const tag = await Tag.findOneAndDelete({ _id: req.params.id, user: req.user.id });
  if (!tag) return res.status(404).json({ message: 'Tag not found' });
  res.json({ message: 'Tag deleted' });
});

module.exports = router;

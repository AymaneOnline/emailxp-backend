const express = require('express');
const router = express.Router();
const Subscriber = require('../models/Subscriber');
const PreferenceCategory = require('../models/PreferenceCategory');

// Get current preferences by unsubscribe token
router.get('/:unsubscribeToken', async (req, res) => {
  const subscriber = await Subscriber.findOne({ unsubscribeToken: req.params.unsubscribeToken, isDeleted: false })
    .select('email unsubscribedCategories');
  if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });

  // Categories belong to same user (owner)
  const categories = await PreferenceCategory.find({ user: subscriber.user, isArchived: false })
    .select('name key description isDefault');

  const unsubscribedSet = new Set((subscriber.unsubscribedCategories || []).map(id => id.toString()));
  const mapped = categories.map(c => ({
    id: c._id,
    name: c.name,
    key: c.key,
    description: c.description,
    isDefault: c.isDefault,
    unsubscribed: unsubscribedSet.has(c._id.toString())
  }));

  res.json({ email: subscriber.email, categories: mapped });
});

// Update preferences (replace unsubscribed set)
router.post('/:unsubscribeToken', async (req, res) => {
  const { categories } = req.body; // array of category IDs user wants to unsubscribe from
  const subscriber = await Subscriber.findOne({ unsubscribeToken: req.params.unsubscribeToken, isDeleted: false });
  if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });

  // Validate category ownership
  const owned = await PreferenceCategory.find({ _id: { $in: categories || [] }, user: subscriber.user, isArchived: false }).select('_id');
  subscriber.unsubscribedCategories = owned.map(c => c._id);
  await subscriber.save();

  res.json({ message: 'Preferences updated' });
});

module.exports = router;

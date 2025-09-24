const express = require('express');
const router = express.Router();
const PreferenceCategory = require('../models/PreferenceCategory');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// List categories
router.get('/', async (req, res) => {
  const cats = await PreferenceCategory.find({ user: req.user.id, isArchived: false }).sort({ createdAt: 1 });
  res.json(cats);
});

// Create
router.post('/', async (req, res) => {
  const { name, key, description, isDefault } = req.body;
  const exists = await PreferenceCategory.findOne({ user: req.user.id, key });
  if (exists) return res.status(400).json({ message: 'Key already exists' });
  if (isDefault) {
    await PreferenceCategory.updateMany({ user: req.user.id, isDefault: true }, { $set: { isDefault: false } });
  }
  const cat = await PreferenceCategory.create({ user: req.user.id, name, key, description, isDefault: !!isDefault });
  res.status(201).json(cat);
});

// Update
router.put('/:id', async (req, res) => {
  const { name, description, isDefault } = req.body;
  const cat = await PreferenceCategory.findOne({ _id: req.params.id, user: req.user.id });
  if (!cat) return res.status(404).json({ message: 'Not found' });
  cat.name = name ?? cat.name;
  cat.description = description ?? cat.description;
  if (isDefault === true) {
    await PreferenceCategory.updateMany({ user: req.user.id, isDefault: true }, { $set: { isDefault: false } });
    cat.isDefault = true;
  } else if (isDefault === false && cat.isDefault) {
    cat.isDefault = false;
  }
  await cat.save();
  res.json(cat);
});

// Archive (soft delete)
router.delete('/:id', async (req, res) => {
  const cat = await PreferenceCategory.findOne({ _id: req.params.id, user: req.user.id });
  if (!cat) return res.status(404).json({ message: 'Not found' });
  cat.isArchived = true;
  await cat.save();
  res.json({ message: 'Archived' });
});

module.exports = router;

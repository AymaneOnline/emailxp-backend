// emailxp/backend/routes/segments.js

const express = require('express');
const router = express.Router();
const Segment = require('../models/Segment');
const { protect } = require('../middleware/authMiddleware');

// Protect all segment routes
router.use(protect);

// Get all segments for the authenticated user
router.get('/', async (req, res) => {
  try {
    const segments = await Segment.find({ 
      user: req.user.id, 
      isActive: true 
    }).sort({ createdAt: -1 });
    
    res.json(segments);
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific segment by ID
router.get('/:id', async (req, res) => {
  try {
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    res.json(segment);
  } catch (error) {
    console.error('Error fetching segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new segment
router.post('/', async (req, res) => {
  try {
    const { name, description, filters, logic } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Segment name is required' });
    }
    
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ message: 'At least one filter is required' });
    }
    
    // Check for duplicate name
    const existingSegment = await Segment.findOne({
      user: req.user.id,
      name: name.trim(),
      isActive: true
    });
    
    if (existingSegment) {
      return res.status(400).json({ message: 'A segment with this name already exists' });
    }
    
    // Create segment
    const segment = new Segment({
      name: name.trim(),
      description: description?.trim(),
      user: req.user.id,
      filters,
      logic: logic || 'AND'
    });
    
    await segment.save();
    
    // Calculate initial subscriber count
    await segment.countSubscribers();
    
    res.status(201).json(segment);
  } catch (error) {
    console.error('Error creating segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a segment
router.put('/:id', async (req, res) => {
  try {
    const { name, description, filters, logic } = req.body;
    
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Segment name is required' });
    }
    
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ message: 'At least one filter is required' });
    }
    
    // Check for duplicate name (excluding current segment)
    const existingSegment = await Segment.findOne({
      user: req.user.id,
      name: name.trim(),
      isActive: true,
      _id: { $ne: req.params.id }
    });
    
    if (existingSegment) {
      return res.status(400).json({ message: 'A segment with this name already exists' });
    }
    
    // Update segment
    segment.name = name.trim();
    segment.description = description?.trim();
    segment.filters = filters;
    segment.logic = logic || 'AND';
    
    await segment.save();
    
    // Recalculate subscriber count
    await segment.countSubscribers();
    
    res.json(segment);
  } catch (error) {
    console.error('Error updating segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a segment (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    segment.isActive = false;
    await segment.save();
    
    res.json({ message: 'Segment deleted successfully' });
  } catch (error) {
    console.error('Error deleting segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Preview segment (get subscriber count without saving)
router.post('/preview', async (req, res) => {
  try {
    const { filters, logic } = req.body;
    
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ message: 'Filters are required for preview' });
    }
    
    // Create temporary segment for preview
    const tempSegment = new Segment({
      name: 'temp',
      user: req.user.id,
      filters,
      logic: logic || 'AND'
    });
    
    const count = await tempSegment.countSubscribers();
    
    res.json({ 
      subscriberCount: count,
      query: tempSegment.buildQuery()
    });
  } catch (error) {
    console.error('Error previewing segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get subscribers for a segment
router.get('/:id/subscribers', async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    const subscribers = await segment.getSubscribers(
      parseInt(limit), 
      parseInt(skip)
    );
    
    res.json({
      subscribers,
      total: segment.subscriberCount,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error fetching segment subscribers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Preview a saved segment (count + sample) without altering cached counts
router.get('/:id/preview', async (req, res) => {
  try {
    const { sample = 20 } = req.query;
    const segment = await Segment.findOne({ _id: req.params.id, user: req.user.id });
    if (!segment) return res.status(404).json({ message: 'Segment not found' });
    const query = { user: req.user.id, ...segment.buildQuery() };
    const Subscriber = require('../models/Subscriber');
    const count = await Subscriber.countDocuments(query);
    const docs = await Subscriber.find(query).limit(parseInt(sample,10)).select('email name status tags createdAt');
    res.json({ count, sample: docs, query });
  } catch (e) {
    console.error('Error previewing saved segment:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get available filter fields and operators
router.get('/meta/fields', async (req, res) => {
  try {
    const fields = Segment.getFilterFields();
    res.json(fields);
  } catch (error) {
    console.error('Error fetching filter fields:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh subscriber count for a segment
router.post('/:id/refresh', async (req, res) => {
  try {
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    const count = await segment.countSubscribers();
    
    res.json({ 
      subscriberCount: count,
      lastCalculated: segment.lastCalculated
    });
  } catch (error) {
    console.error('Error refreshing segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
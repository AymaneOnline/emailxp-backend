// emailxp/backend/routes/advancedSegmentation.js

const express = require('express');
const router = express.Router();
const Segment = require('../models/Segment');
const Subscriber = require('../models/Subscriber');
const { protect } = require('../middleware/authMiddleware');
const advancedSegmentationService = require('../services/advancedSegmentationService');

// Protect all advanced segmentation routes
router.use(protect);

// Get segment analytics
router.get('/:id/analytics', async (req, res) => {
  try {
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    // Generate analytics using the service
    const analytics = await advancedSegmentationService.generateSegmentAnalytics(req.user, req.params.id);
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching segment analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create dynamic segment based on behavior
router.post('/dynamic', async (req, res) => {
  try {
    const { name, description, behaviorRules, timeframe } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Segment name is required' });
    }
    
    if (!behaviorRules || !Array.isArray(behaviorRules) || behaviorRules.length === 0) {
      return res.status(400).json({ message: 'At least one behavior rule is required' });
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
    
    // Create behavioral segment using the service
    const segment = await advancedSegmentationService.createBehavioralSegment(req.user, {
      name,
      description,
      behaviorRules,
      timeframe
    });
    
    res.status(201).json(segment);
  } catch (error) {
    console.error('Error creating dynamic segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get segment overlap analysis
router.post('/overlap', async (req, res) => {
  try {
    const { segmentIds } = req.body;
    
    if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length < 2) {
      return res.status(400).json({ message: 'At least two segment IDs are required' });
    }
    
    // Calculate overlap using the service
    const overlapData = await advancedSegmentationService.calculateSegmentOverlap(req.user, segmentIds);
    
    res.json(overlapData);
  } catch (error) {
    console.error('Error calculating segment overlap:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export segment data
router.get('/:id/export', async (req, res) => {
  try {
    const segment = await Segment.findOne({
      _id: req.params.id,
      user: req.user.id
    });
    
    if (!segment) {
      return res.status(404).json({ message: 'Segment not found' });
    }
    
    // Export data using the service
    const exportData = await advancedSegmentationService.exportSegmentData(req.user, req.params.id);
    
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting segment data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a segment based on custom query
router.post('/custom-query', async (req, res) => {
  try {
    const { name, description, customQuery } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Segment name is required' });
    }
    
    if (!customQuery || typeof customQuery !== 'object') {
      return res.status(400).json({ message: 'Valid custom query is required' });
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
    
    // Create segment with custom query
    const segment = new Segment({
      name: name.trim(),
      description: description?.trim(),
      user: req.user.id,
      filters: [], // No filters since we're using a custom query
      logic: 'AND',
      customQuery // Store the custom query
    });
    
    await segment.save();
    
    // Calculate initial subscriber count
    await segment.countSubscribers();
    
    res.status(201).json(segment);
  } catch (error) {
    console.error('Error creating custom query segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create RFM segment
router.post('/rfm', async (req, res) => {
  try {
    const { name, description, recency, frequency, monetary } = req.body;
    
    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Segment name is required' });
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
    
    // Create RFM segment using the service
    const segment = await advancedSegmentationService.createRFMSegment(req.user, {
      name,
      description,
      recency,
      frequency,
      monetary
    });
    
    res.status(201).json(segment);
  } catch (error) {
    console.error('Error creating RFM segment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
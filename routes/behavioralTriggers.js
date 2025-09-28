// emailxp/backend/routes/behavioralTriggers.js

const express = require('express');
const router = express.Router();
const BehavioralTrigger = require('../models/BehavioralTrigger');
const { protect } = require('../middleware/authMiddleware');
const { rbac } = require('../middleware/rbac');
const behavioralTriggerService = require('../services/behavioralTriggerService');

// Get all behavioral triggers
router.get('/', protect, rbac('automation', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    
    const query = { user: req.user.id };
    
    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' }
        }
      ];
    }
    
    // Add active filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const triggers = await BehavioralTrigger.find(query)
      .populate('campaignTemplate', 'name subject')
      .populate('automation', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BehavioralTrigger.countDocuments(query);

    res.json({
      triggers,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching behavioral triggers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get behavioral triggers statistics
router.get('/stats', protect, rbac('automation', 'read'), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all triggers for the user
    const triggers = await BehavioralTrigger.find({ user: userId });
    
    // Calculate statistics
    const totalTriggers = triggers.length;
    const activeTriggers = triggers.filter(trigger => trigger.isActive).length;
    const totalFired = triggers.reduce((sum, trigger) => sum + (trigger.stats?.timesFired || 0), 0);
    
    res.json({
      totalTriggers,
      activeTriggers,
      totalFired
    });
  } catch (error) {
    console.error('Error fetching behavioral triggers stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific behavioral trigger
router.get('/:id', protect, rbac('automation', 'read'), async (req, res) => {
  try {
    const trigger = await BehavioralTrigger.findById(req.params.id)
      .populate('campaignTemplate', 'name subject htmlContent plainTextContent')
      .populate('automation', 'name nodes edges');

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(trigger);
  } catch (error) {
    console.error('Error fetching behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new behavioral trigger
router.post('/', protect, rbac('automation', 'create'), async (req, res) => {
  try {
    const {
      name,
      description,
      campaignTemplate,
      triggerEvent,
      conditions,
      timing,
      frequency,
      isActive
    } = req.body;

    // Validate required fields
    if (!name || !triggerEvent) {
      return res.status(400).json({ 
        message: 'Name and trigger event are required' 
      });
    }

    if (!campaignTemplate && !automation) {
      return res.status(400).json({ message: 'Either campaignTemplate or automation must be provided' });
    }

    // Validate trigger event
    if (!triggerEvent.eventType) {
      return res.status(400).json({ 
        message: 'Trigger event type is required' 
      });
    }

    const trigger = new BehavioralTrigger({
      user: req.user.id,
      name,
      description,
      campaignTemplate,
      automation,
      triggerEvent,
      conditions: conditions || [],
      timing: timing || {},
      frequency: frequency || {},
      isActive: isActive !== undefined ? isActive : true
    });

    await trigger.save();

    // Populate campaign template for response
    await trigger.populate('campaignTemplate', 'name subject');

    res.status(201).json(trigger);
  } catch (error) {
    console.error('Error creating behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update behavioral trigger
router.put('/:id', protect, rbac('automation', 'update'), async (req, res) => {
  try {
    const {
      name,
      description,
      campaignTemplate,
      triggerEvent,
      conditions,
      timing,
      frequency,
      isActive
    } = req.body;

    const trigger = await BehavioralTrigger.findById(req.params.id);

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Update fields
  if (name) trigger.name = name;
  if (description) trigger.description = description;
  if (campaignTemplate) trigger.campaignTemplate = campaignTemplate;
  if (automation) trigger.automation = automation;
    if (triggerEvent) trigger.triggerEvent = triggerEvent;
    if (conditions) trigger.conditions = conditions;
    if (timing) trigger.timing = timing;
    if (frequency) trigger.frequency = frequency;
    if (isActive !== undefined) trigger.isActive = isActive;

    await trigger.save();

    // Populate campaign template for response
    await trigger.populate('campaignTemplate', 'name subject');

    res.json(trigger);
  } catch (error) {
    console.error('Error updating behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete behavioral trigger
router.delete('/:id', protect, rbac('automation', 'delete'), async (req, res) => {
  try {
    const trigger = await BehavioralTrigger.findById(req.params.id);

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await trigger.remove();

    res.json({ message: 'Behavioral trigger removed' });
  } catch (error) {
    console.error('Error deleting behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle active status
router.post('/:id/toggle', protect, rbac('automation', 'update'), async (req, res) => {
  try {
    const trigger = await BehavioralTrigger.findById(req.params.id);

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    trigger.isActive = !trigger.isActive;
    await trigger.save();

    res.json({
      message: `Trigger ${trigger.isActive ? 'activated' : 'deactivated'}`,
      isActive: trigger.isActive
    });
  } catch (error) {
    console.error('Error toggling behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get trigger statistics
router.get('/:id/stats', protect, rbac('automation', 'read'), async (req, res) => {
  try {
    const trigger = await BehavioralTrigger.findById(req.params.id);

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(trigger.stats);
  } catch (error) {
    console.error('Error fetching trigger stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Test trigger (simulate event)
router.post('/:id/test', protect, rbac('automation', 'update'), async (req, res) => {
  try {
    const trigger = await BehavioralTrigger.findById(req.params.id)
      .populate('campaignTemplate');

    if (!trigger) {
      return res.status(404).json({ message: 'Behavioral trigger not found' });
    }

    // Check if user owns the trigger
    if (trigger.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // For testing, we'll need a subscriber - in a real implementation,
    // this would be based on actual subscriber data
    res.json({
      message: 'Trigger test initiated',
      trigger: {
        id: trigger._id,
        name: trigger.name,
        eventType: trigger.triggerEvent.eventType
      }
    });
  } catch (error) {
    console.error('Error testing behavioral trigger:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
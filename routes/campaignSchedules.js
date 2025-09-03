// emailxp/backend/routes/campaignSchedules.js

const express = require('express');
const router = express.Router();
const CampaignSchedule = require('../models/CampaignSchedule');
const Campaign = require('../models/Campaign');
const { protect } = require('../middleware/authMiddleware');
const { campaignAutomationEngine } = require('../services/campaignAutomation');

// Get all campaign schedules for user
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, scheduleType } = req.query;
    
    const query = { user: req.user._id, isActive: true };
    
    if (status) {
      query.status = status;
    }
    
    if (scheduleType) {
      query.scheduleType = scheduleType;
    }

    const schedules = await CampaignSchedule.find(query)
      .populate('campaign', 'name subject')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await CampaignSchedule.countDocuments(query);

    res.json({
      schedules,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching campaign schedules:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific campaign schedule
router.get('/:id', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    }).populate('campaign');

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    res.json(schedule);
  } catch (error) {
    console.error('Error fetching campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new campaign schedule
router.post('/', protect, async (req, res) => {
  try {
    const {
      campaignId,
      name,
      description,
      scheduleType,
      scheduledDate,
      timezone,
      recurrence,
      dripSequence,
      triggers,
      settings
    } = req.body;

    // Verify campaign exists and belongs to user
    const campaign = await Campaign.findOne({
      _id: campaignId,
      user: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Validate schedule configuration
    const validationError = validateScheduleConfig({
      scheduleType,
      scheduledDate,
      recurrence,
      dripSequence,
      triggers
    });

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const schedule = new CampaignSchedule({
      user: req.user._id,
      campaign: campaignId,
      name,
      description,
      scheduleType,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      timezone: timezone || 'UTC',
      recurrence,
      dripSequence,
      triggers,
      settings: {
        maxRecipientsPerExecution: 1000,
        throttleDelay: 0,
        retryFailures: true,
        maxRetries: 3,
        trackOpens: true,
        trackClicks: true,
        ...settings
      }
    });

    // Set initial status
    if (scheduleType === 'immediate') {
      schedule.status = 'scheduled';
      schedule.scheduledDate = new Date();
    } else if (scheduleType === 'scheduled' && scheduledDate) {
      schedule.status = 'scheduled';
    } else if (scheduleType === 'recurring') {
      schedule.status = 'running';
      schedule.calculateNextExecution();
    } else if (scheduleType === 'drip' || scheduleType === 'trigger') {
      schedule.status = 'running';
    }

    await schedule.save();

    res.status(201).json({
      message: 'Campaign schedule created successfully',
      schedule
    });
  } catch (error) {
    console.error('Error creating campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update campaign schedule
router.put('/:id', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    // Don't allow updates to running campaigns
    if (schedule.status === 'running' && req.body.status !== 'paused') {
      return res.status(400).json({ 
        message: 'Cannot update running campaign schedule. Pause it first.' 
      });
    }

    const allowedUpdates = [
      'name', 'description', 'scheduledDate', 'timezone', 
      'recurrence', 'dripSequence', 'triggers', 'settings'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        schedule[field] = req.body[field];
      }
    });

    // Recalculate next execution if needed
    if (schedule.scheduleType === 'recurring' && req.body.recurrence) {
      schedule.calculateNextExecution();
    }

    await schedule.save();

    res.json({
      message: 'Campaign schedule updated successfully',
      schedule
    });
  } catch (error) {
    console.error('Error updating campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start/Resume campaign schedule
router.post('/:id/start', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    if (schedule.status === 'running') {
      return res.status(400).json({ message: 'Campaign schedule is already running' });
    }

    if (schedule.status === 'completed') {
      return res.status(400).json({ message: 'Cannot restart completed campaign schedule' });
    }

    // Set appropriate status based on schedule type
    if (schedule.scheduleType === 'immediate') {
      schedule.status = 'scheduled';
      schedule.scheduledDate = new Date();
    } else if (schedule.scheduleType === 'scheduled') {
      schedule.status = 'scheduled';
    } else {
      schedule.status = 'running';
    }

    await schedule.save();

    res.json({
      message: 'Campaign schedule started successfully',
      schedule
    });
  } catch (error) {
    console.error('Error starting campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Pause campaign schedule
router.post('/:id/pause', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    if (schedule.status !== 'running' && schedule.status !== 'scheduled') {
      return res.status(400).json({ message: 'Campaign schedule is not active' });
    }

    schedule.status = 'paused';
    await schedule.save();

    res.json({
      message: 'Campaign schedule paused successfully',
      schedule
    });
  } catch (error) {
    console.error('Error pausing campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel campaign schedule
router.post('/:id/cancel', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    schedule.status = 'cancelled';
    await schedule.save();

    res.json({
      message: 'Campaign schedule cancelled successfully',
      schedule
    });
  } catch (error) {
    console.error('Error cancelling campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete campaign schedule
router.delete('/:id', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    // Don't allow deletion of running schedules
    if (schedule.status === 'running') {
      return res.status(400).json({ 
        message: 'Cannot delete running campaign schedule. Cancel it first.' 
      });
    }

    schedule.isActive = false;
    await schedule.save();

    res.json({ message: 'Campaign schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get campaign schedule execution history
router.get('/:id/executions', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    const executions = schedule.executions
      .sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt))
      .slice((page - 1) * limit, page * limit);

    res.json({
      executions,
      total: schedule.executions.length,
      page: parseInt(page),
      pages: Math.ceil(schedule.executions.length / limit)
    });
  } catch (error) {
    console.error('Error fetching execution history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Manual execution trigger
router.post('/:id/execute', protect, async (req, res) => {
  try {
    const schedule = await CampaignSchedule.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    }).populate('campaign');

    if (!schedule) {
      return res.status(404).json({ message: 'Campaign schedule not found' });
    }

    // Execute the campaign schedule
    await campaignAutomationEngine.executeCampaignSchedule(schedule);

    res.json({
      message: 'Campaign schedule executed successfully',
      schedule
    });
  } catch (error) {
    console.error('Error executing campaign schedule:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to validate schedule configuration
function validateScheduleConfig({ scheduleType, scheduledDate, recurrence, dripSequence, triggers }) {
  switch (scheduleType) {
    case 'scheduled':
      if (!scheduledDate) {
        return 'Scheduled date is required for scheduled campaigns';
      }
      if (new Date(scheduledDate) <= new Date()) {
        return 'Scheduled date must be in the future';
      }
      break;
      
    case 'recurring':
      if (!recurrence || !recurrence.type) {
        return 'Recurrence configuration is required for recurring campaigns';
      }
      break;
      
    case 'drip':
      if (!dripSequence || dripSequence.length === 0) {
        return 'Drip sequence is required for drip campaigns';
      }
      break;
      
    case 'trigger':
      if (!triggers || triggers.length === 0) {
        return 'Triggers are required for trigger-based campaigns';
      }
      break;
  }
  
  return null;
}

module.exports = router;
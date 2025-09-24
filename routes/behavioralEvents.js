// emailxp/backend/routes/behavioralEvents.js

const express = require('express');
const router = express.Router();
const BehavioralEvent = require('../models/BehavioralEvent');
const { protect } = require('../middleware/authMiddleware');
const { rbac } = require('../middleware/rbac');
const behavioralTriggerService = require('../services/behavioralTriggerService');

// Public endpoint for tracking behavioral events (no authentication required)
// This endpoint would be called from the frontend or external systems
router.post('/track', async (req, res) => {
  try {
    const { userId, subscriberId, eventType, customEventType, target, data, sessionId, ipAddress, userAgent } = req.body;

    // Validate required fields
    if (!userId || !subscriberId || !eventType) {
      return res.status(400).json({ 
        message: 'User ID, subscriber ID, and event type are required' 
      });
    }

    // Create the event data
    const eventData = {
      user: userId,
      subscriber: subscriberId,
      eventType,
      customEventType,
      target,
      data,
      sessionId,
      ipAddress: ipAddress || req.ip,
      userAgent: userAgent || req.get('User-Agent')
    };

    // Process the behavioral event
    const triggeredCampaigns = await behavioralTriggerService.processBehavioralEvent(eventData);

    res.json({
      message: 'Event tracked successfully',
      triggeredCampaigns: triggeredCampaigns.length
    });
  } catch (error) {
    console.error('Error tracking behavioral event:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get behavioral events for a subscriber (protected)
router.get('/subscriber/:subscriberId', protect, rbac('subscribers', 'read'), async (req, res) => {
  try {
    const { limit = 50, eventType, startDate, endDate } = req.query;
    
    const events = await behavioralTriggerService.getSubscriberEvents(
      req.user.id,
      req.params.subscriberId,
      { limit, eventType, startDate, endDate }
    );

    res.json(events);
  } catch (error) {
    console.error('Error fetching subscriber events:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all behavioral events (protected)
router.get('/', protect, rbac('analytics', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 20, eventType, startDate, endDate } = req.query;
    
    const query = { user: req.user.id };
    
    // Add event type filter
    if (eventType) {
      query.eventType = eventType;
    }
    
    // Add date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const events = await BehavioralEvent.find(query)
      .populate('subscriber', 'name email')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await BehavioralEvent.countDocuments(query);

    res.json({
      events,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching behavioral events:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get event statistics
router.get('/stats', protect, rbac('analytics', 'read'), async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }
    
    // Get event counts by type
    const eventTypeStats = await BehavioralEvent.aggregate([
      {
        $match: {
          user: req.user._id,
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    // Get events over time
    const timelineStats = await BehavioralEvent.aggregate([
      {
        $match: {
          user: req.user._id,
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Get top targets
    const topTargets = await BehavioralEvent.aggregate([
      {
        $match: {
          user: req.user._id,
          target: { $exists: true, $ne: null },
          timestamp: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$target',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    res.json({
      eventTypeStats,
      timelineStats,
      topTargets,
      period: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching event stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
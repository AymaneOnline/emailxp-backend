// emailxp/backend/routes/analytics.js

const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const analyticsService = require('../services/analyticsService');
const { protect } = require('../middleware/authMiddleware');

// Get dashboard overview
router.get('/dashboard', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    const overview = await analyticsService.getDashboardOverview(req.user._id, timeframe);
    
    res.json(overview);
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get campaign analytics
router.get('/campaigns/:campaignId', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    const analytics = await analyticsService.getCampaignAnalytics(
      req.user._id, 
      req.params.campaignId, 
      timeframe
    );
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    if (error.message === 'Campaign not found') {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all campaigns analytics summary
router.get('/campaigns', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'openRate', sortOrder = 'desc', timeframe = '30d' } = req.query;
    
    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    const query = {
      user: req.user._id,
      type: 'campaign',
      periodStart: { $gte: periodStart }
    };

    const sortOptions = {};
    sortOptions[`rates.${sortBy}`] = sortOrder === 'desc' ? -1 : 1;

    const analytics = await Analytics.find(query)
      .populate('entityId', 'name subject status')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Analytics.countDocuments(query);

    res.json({
      analytics,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching campaigns analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get template analytics
router.get('/templates/:templateId', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    const analytics = await analyticsService.generateAnalytics(
      req.user._id,
      req.params.templateId,
      'Template'
    );
    
    // Get usage history
    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    const historicalData = await Analytics.find({
      user: req.user._id,
      entityId: req.params.templateId,
      entityType: 'Template',
      periodStart: { $gte: periodStart }
    }).sort({ periodStart: 1 });

    res.json({
      currentMetrics: analytics.metrics,
      rates: analytics.rates,
      comparison: analytics.comparison,
      historicalData
    });
  } catch (error) {
    console.error('Error fetching template analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get subscriber analytics
router.get('/subscribers', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    const analytics = await analyticsService.getSubscriberAnalytics(req.user._id, timeframe);
    
    res.json(analytics);
  } catch (error) {
    console.error('Error fetching subscriber analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get engagement analytics
router.get('/engagement', protect, async (req, res) => {
  try {
    const { timeframe = '30d', groupBy = 'day' } = req.query;
    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    // Get engagement trends
    const pipeline = [
      {
        $match: {
          user: req.user._id,
          periodStart: { $gte: periodStart }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: groupBy === 'hour' ? "%Y-%m-%d %H:00" : "%Y-%m-%d", 
              date: "$periodStart" 
            }
          },
          totalSent: { $sum: "$metrics.sent" },
          totalOpened: { $sum: "$metrics.opened" },
          totalClicked: { $sum: "$metrics.clicked" },
          avgOpenRate: { $avg: "$rates.openRate" },
          avgClickRate: { $avg: "$rates.clickRate" }
        }
      },
      { $sort: { _id: 1 } }
    ];

    const engagementTrends = await Analytics.aggregate(pipeline);

    // Get device breakdown
    const devicePipeline = [
      {
        $match: {
          user: req.user._id,
          periodStart: { $gte: periodStart }
        }
      },
      {
        $group: {
          _id: null,
          desktop: { $sum: "$metrics.deviceBreakdown.desktop" },
          mobile: { $sum: "$metrics.deviceBreakdown.mobile" },
          tablet: { $sum: "$metrics.deviceBreakdown.tablet" },
          unknown: { $sum: "$metrics.deviceBreakdown.unknown" }
        }
      }
    ];

    const deviceBreakdown = await Analytics.aggregate(devicePipeline);

    // Get client breakdown
    const clientPipeline = [
      {
        $match: {
          user: req.user._id,
          periodStart: { $gte: periodStart }
        }
      },
      {
        $group: {
          _id: null,
          gmail: { $sum: "$metrics.clientBreakdown.gmail" },
          outlook: { $sum: "$metrics.clientBreakdown.outlook" },
          yahoo: { $sum: "$metrics.clientBreakdown.yahoo" },
          apple: { $sum: "$metrics.clientBreakdown.apple" },
          other: { $sum: "$metrics.clientBreakdown.other" }
        }
      }
    ];

    const clientBreakdown = await Analytics.aggregate(clientPipeline);

    res.json({
      engagementTrends,
      deviceBreakdown: deviceBreakdown[0] || {},
      clientBreakdown: clientBreakdown[0] || {}
    });
  } catch (error) {
    console.error('Error fetching engagement analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get geographic analytics
router.get('/geography', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    const pipeline = [
      {
        $match: {
          user: req.user._id,
          periodStart: { $gte: periodStart }
        }
      },
      { $unwind: "$metrics.geoBreakdown" },
      {
        $group: {
          _id: {
            country: "$metrics.geoBreakdown.country",
            region: "$metrics.geoBreakdown.region",
            city: "$metrics.geoBreakdown.city"
          },
          opens: { $sum: "$metrics.geoBreakdown.opens" },
          clicks: { $sum: "$metrics.geoBreakdown.clicks" }
        }
      },
      {
        $group: {
          _id: "$_id.country",
          totalOpens: { $sum: "$opens" },
          totalClicks: { $sum: "$clicks" },
          regions: {
            $push: {
              region: "$_id.region",
              city: "$_id.city",
              opens: "$opens",
              clicks: "$clicks"
            }
          }
        }
      },
      { $sort: { totalOpens: -1 } }
    ];

    const geoData = await Analytics.aggregate(pipeline);

    res.json({ geoData });
  } catch (error) {
    console.error('Error fetching geographic analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get link performance analytics
router.get('/links', protect, async (req, res) => {
  try {
    const { timeframe = '30d', campaignId } = req.query;
    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    const matchQuery = {
      user: req.user._id,
      periodStart: { $gte: periodStart }
    };

    if (campaignId) {
      matchQuery.entityId = campaignId;
      matchQuery.entityType = 'Campaign';
    }

    const pipeline = [
      { $match: matchQuery },
      { $unwind: "$metrics.linkPerformance" },
      {
        $group: {
          _id: "$metrics.linkPerformance.url",
          totalClicks: { $sum: "$metrics.linkPerformance.clicks" },
          uniqueClicks: { $sum: "$metrics.linkPerformance.uniqueClicks" }
        }
      },
      { $sort: { totalClicks: -1 } },
      { $limit: 50 }
    ];

    const linkPerformance = await Analytics.aggregate(pipeline);

    res.json({ linkPerformance });
  } catch (error) {
    console.error('Error fetching link performance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get comparative analytics
router.get('/compare', protect, async (req, res) => {
  try {
    const { entities, timeframe = '30d' } = req.query;
    
    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({ message: 'Entities array is required' });
    }

    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    const comparisons = [];
    
    for (const entity of entities) {
      const analytics = await Analytics.findOne({
        user: req.user._id,
        entityId: entity.id,
        entityType: entity.type,
        periodStart: { $gte: periodStart }
      }).populate('entityId', 'name subject');
      
      if (analytics) {
        comparisons.push({
          entity: analytics.entityId,
          metrics: analytics.metrics,
          rates: analytics.rates
        });
      }
    }

    res.json({ comparisons });
  } catch (error) {
    console.error('Error fetching comparative analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Generate analytics report
router.post('/reports', protect, async (req, res) => {
  try {
    const { 
      reportType = 'summary', 
      timeframe = '30d', 
      entities = [], 
      metrics = ['openRate', 'clickRate', 'unsubscribeRate'],
      format = 'json'
    } = req.body;

    const { periodStart } = analyticsService.getTimeframeDates(timeframe);
    
    let reportData = {};

    switch (reportType) {
      case 'summary':
        reportData = await analyticsService.getDashboardOverview(req.user._id, timeframe);
        break;
        
      case 'detailed':
        // Get detailed analytics for all campaigns
        const detailedAnalytics = await Analytics.find({
          user: req.user._id,
          periodStart: { $gte: periodStart }
        }).populate('entityId');
        
        reportData = { detailedAnalytics };
        break;
        
      case 'custom':
        // Custom report based on specified entities and metrics
        const customData = [];
        
        for (const entity of entities) {
          const analytics = await Analytics.findOne({
            user: req.user._id,
            entityId: entity.id,
            entityType: entity.type,
            periodStart: { $gte: periodStart }
          }).populate('entityId');
          
          if (analytics) {
            const filteredData = { entity: analytics.entityId };
            metrics.forEach(metric => {
              if (analytics.rates[metric] !== undefined) {
                filteredData[metric] = analytics.rates[metric];
              }
            });
            customData.push(filteredData);
          }
        }
        
        reportData = { customData };
        break;
    }

    // Add metadata
    reportData.metadata = {
      generatedAt: new Date(),
      timeframe,
      reportType,
      userId: req.user._id
    };

    if (format === 'csv') {
      // Convert to CSV format (simplified)
      const csv = convertToCSV(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics-report.csv');
      return res.send(csv);
    }

    res.json(reportData);
  } catch (error) {
    console.error('Error generating analytics report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Trigger analytics generation for specific entity
router.post('/generate/:entityType/:entityId', protect, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { period = 'day' } = req.body;
    
    const analytics = await analyticsService.generateAnalytics(
      req.user._id,
      entityId,
      entityType,
      period
    );
    
    res.json({
      message: 'Analytics generated successfully',
      analytics
    });
  } catch (error) {
    console.error('Error generating analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  // This is a simplified CSV conversion
  // In a real implementation, you'd want a more robust CSV library
  const headers = Object.keys(data.overview || {});
  const csvHeaders = headers.join(',');
  const csvData = headers.map(header => data.overview[header]).join(',');
  
  return `${csvHeaders}\n${csvData}`;
}

module.exports = router;
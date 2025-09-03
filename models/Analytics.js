// emailxp/backend/models/Analytics.js

const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Analytics Type
  type: {
    type: String,
    enum: ['campaign', 'template', 'subscriber', 'overall'],
    required: true
  },
  
  // Reference to the entity being tracked
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityType: {
    type: String,
    enum: ['Campaign', 'Template', 'Subscriber', 'User'],
    required: true
  },
  
  // Time period for the analytics
  period: {
    type: String,
    enum: ['hour', 'day', 'week', 'month', 'year'],
    required: true
  },
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  
  // Email Metrics
  metrics: {
    // Sending metrics
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    bounced: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    
    // Engagement metrics
    opened: { type: Number, default: 0 },
    uniqueOpens: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    uniqueClicks: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    complained: { type: Number, default: 0 },
    
    // Advanced metrics
    forwarded: { type: Number, default: 0 },
    replied: { type: Number, default: 0 },
    socialShares: { type: Number, default: 0 },
    
    // Time-based metrics
    avgOpenTime: { type: Number, default: 0 }, // seconds
    avgClickTime: { type: Number, default: 0 }, // seconds
    peakEngagementHour: { type: Number }, // 0-23
    
    // Device and client metrics
    deviceBreakdown: {
      desktop: { type: Number, default: 0 },
      mobile: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 }
    },
    
    clientBreakdown: {
      gmail: { type: Number, default: 0 },
      outlook: { type: Number, default: 0 },
      yahoo: { type: Number, default: 0 },
      apple: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    },
    
    // Geographic metrics
    geoBreakdown: [{
      country: String,
      region: String,
      city: String,
      opens: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 }
    }],
    
    // Link performance
    linkPerformance: [{
      url: String,
      clicks: { type: Number, default: 0 },
      uniqueClicks: { type: Number, default: 0 }
    }]
  },
  
  // Calculated rates (percentages)
  rates: {
    deliveryRate: { type: Number, default: 0 },
    openRate: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0 },
    clickToOpenRate: { type: Number, default: 0 },
    unsubscribeRate: { type: Number, default: 0 },
    complaintRate: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 }
  },
  
  // Comparison with previous period
  comparison: {
    previousPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Analytics'
    },
    changes: {
      sent: { type: Number, default: 0 },
      openRate: { type: Number, default: 0 },
      clickRate: { type: Number, default: 0 },
      unsubscribeRate: { type: Number, default: 0 }
    }
  },
  
  // Additional metadata
  metadata: {
    campaignType: String,
    templateCategory: String,
    subscriberSegment: String,
    tags: [String]
  }
}, {
  timestamps: true
});

// Indexes for performance
analyticsSchema.index({ user: 1, type: 1, periodStart: -1 });
analyticsSchema.index({ entityId: 1, entityType: 1, period: 1 });
analyticsSchema.index({ user: 1, periodStart: -1, periodEnd: -1 });
analyticsSchema.index({ type: 1, 'metrics.sent': -1 });

// Methods
analyticsSchema.methods.calculateRates = function() {
  const metrics = this.metrics;
  
  // Delivery rate
  if (metrics.sent > 0) {
    this.rates.deliveryRate = (metrics.delivered / metrics.sent) * 100;
    this.rates.bounceRate = (metrics.bounced / metrics.sent) * 100;
  }
  
  // Open rate
  if (metrics.delivered > 0) {
    this.rates.openRate = (metrics.uniqueOpens / metrics.delivered) * 100;
    this.rates.unsubscribeRate = (metrics.unsubscribed / metrics.delivered) * 100;
    this.rates.complaintRate = (metrics.complained / metrics.delivered) * 100;
  }
  
  // Click rate
  if (metrics.delivered > 0) {
    this.rates.clickRate = (metrics.uniqueClicks / metrics.delivered) * 100;
  }
  
  // Click-to-open rate
  if (metrics.uniqueOpens > 0) {
    this.rates.clickToOpenRate = (metrics.uniqueClicks / metrics.uniqueOpens) * 100;
  }
};

analyticsSchema.methods.compareWithPrevious = function(previousAnalytics) {
  if (!previousAnalytics) return;
  
  this.comparison.previousPeriodId = previousAnalytics._id;
  
  const current = this.metrics;
  const previous = previousAnalytics.metrics;
  
  // Calculate percentage changes
  this.comparison.changes.sent = this.calculatePercentageChange(previous.sent, current.sent);
  this.comparison.changes.openRate = this.calculatePercentageChange(
    previousAnalytics.rates.openRate, 
    this.rates.openRate
  );
  this.comparison.changes.clickRate = this.calculatePercentageChange(
    previousAnalytics.rates.clickRate, 
    this.rates.clickRate
  );
  this.comparison.changes.unsubscribeRate = this.calculatePercentageChange(
    previousAnalytics.rates.unsubscribeRate, 
    this.rates.unsubscribeRate
  );
};

analyticsSchema.methods.calculatePercentageChange = function(oldValue, newValue) {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return ((newValue - oldValue) / oldValue) * 100;
};

// Static methods
analyticsSchema.statics.aggregateMetrics = async function(userId, filters = {}) {
  const pipeline = [
    { $match: { user: mongoose.Types.ObjectId(userId), ...filters } },
    {
      $group: {
        _id: null,
        totalSent: { $sum: '$metrics.sent' },
        totalDelivered: { $sum: '$metrics.delivered' },
        totalOpened: { $sum: '$metrics.opened' },
        totalClicked: { $sum: '$metrics.clicked' },
        totalUnsubscribed: { $sum: '$metrics.unsubscribed' },
        avgOpenRate: { $avg: '$rates.openRate' },
        avgClickRate: { $avg: '$rates.clickRate' },
        avgUnsubscribeRate: { $avg: '$rates.unsubscribeRate' }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || {};
};

analyticsSchema.statics.getTopPerformers = async function(userId, metric = 'openRate', limit = 10) {
  return await this.find({ user: userId })
    .sort({ [`rates.${metric}`]: -1 })
    .limit(limit)
    .populate('entityId');
};

analyticsSchema.statics.getTrendData = async function(userId, period = 'day', days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return await this.find({
    user: userId,
    period: period,
    periodStart: { $gte: startDate }
  }).sort({ periodStart: 1 });
};

module.exports = mongoose.model('Analytics', analyticsSchema);
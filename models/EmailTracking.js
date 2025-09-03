// emailxp/backend/models/EmailTracking.js

const mongoose = require('mongoose');

const emailTrackingSchema = new mongoose.Schema({
  // Campaign and Email Information
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  
  subscriber: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscriber',
    required: true
  },
  
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  
  // Email Details
  emailAddress: {
    type: String,
    required: true
  },
  
  subject: {
    type: String,
    required: true
  },
  
  // Tracking Information
  messageId: {
    type: String,
    required: true
  },
  
  // Status Tracking
  status: {
    type: String,
    enum: ['sent', 'delivered', 'bounced', 'failed', 'spam', 'unsubscribed'],
    default: 'sent'
  },
  
  // Timestamps
  sentAt: {
    type: Date,
    default: Date.now
  },
  
  deliveredAt: {
    type: Date
  },
  
  openedAt: {
    type: Date
  },
  
  firstClickedAt: {
    type: Date
  },
  
  bouncedAt: {
    type: Date
  },
  
  unsubscribedAt: {
    type: Date
  },
  
  // Engagement Metrics
  opens: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    userAgent: String,
    ipAddress: String,
    location: {
      country: String,
      city: String,
      region: String
    }
  }],
  
  clicks: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    url: {
      type: String,
      required: true
    },
    userAgent: String,
    ipAddress: String,
    location: {
      country: String,
      city: String,
      region: String
    }
  }],
  
  // Bounce Information
  bounceInfo: {
    type: {
      type: String,
      enum: ['hard', 'soft', 'complaint']
    },
    reason: String,
    code: String,
    description: String
  },
  
  // Spam Information
  spamInfo: {
    reason: String,
    timestamp: Date
  },
  
  // Device and Client Information
  deviceInfo: {
    type: String, // mobile, desktop, tablet
    os: String,
    browser: String,
    emailClient: String
  },
  
  // Geographic Information
  geoLocation: {
    country: String,
    countryCode: String,
    region: String,
    city: String,
    timezone: String,
    latitude: Number,
    longitude: Number
  },
  
  // Calculated Metrics
  totalOpens: {
    type: Number,
    default: 0
  },
  
  totalClicks: {
    type: Number,
    default: 0
  },
  
  uniqueOpens: {
    type: Number,
    default: 0
  },
  
  uniqueClicks: {
    type: Number,
    default: 0
  },
  
  // Flags
  isOpened: {
    type: Boolean,
    default: false
  },
  
  isClicked: {
    type: Boolean,
    default: false
  },
  
  isBounced: {
    type: Boolean,
    default: false
  },
  
  isUnsubscribed: {
    type: Boolean,
    default: false
  },
  
  isSpam: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
emailTrackingSchema.index({ campaign: 1, subscriber: 1 });
emailTrackingSchema.index({ organization: 1, sentAt: -1 });
emailTrackingSchema.index({ messageId: 1 });
emailTrackingSchema.index({ emailAddress: 1 });
emailTrackingSchema.index({ status: 1 });
emailTrackingSchema.index({ sentAt: -1 });
emailTrackingSchema.index({ isOpened: 1 });
emailTrackingSchema.index({ isClicked: 1 });

// Methods
emailTrackingSchema.methods.recordOpen = function(openData = {}) {
  const openRecord = {
    timestamp: new Date(),
    userAgent: openData.userAgent,
    ipAddress: openData.ipAddress,
    location: openData.location
  };
  
  this.opens.push(openRecord);
  this.totalOpens = this.opens.length;
  
  if (!this.isOpened) {
    this.isOpened = true;
    this.openedAt = openRecord.timestamp;
    this.uniqueOpens = 1;
  }
  
  return this.save();
};

emailTrackingSchema.methods.recordClick = function(clickData = {}) {
  const clickRecord = {
    timestamp: new Date(),
    url: clickData.url,
    userAgent: clickData.userAgent,
    ipAddress: clickData.ipAddress,
    location: clickData.location
  };
  
  this.clicks.push(clickRecord);
  this.totalClicks = this.clicks.length;
  
  if (!this.isClicked) {
    this.isClicked = true;
    this.firstClickedAt = clickRecord.timestamp;
    this.uniqueClicks = 1;
  }
  
  return this.save();
};

emailTrackingSchema.methods.recordBounce = function(bounceData = {}) {
  this.status = 'bounced';
  this.isBounced = true;
  this.bouncedAt = new Date();
  this.bounceInfo = {
    type: bounceData.type || 'hard',
    reason: bounceData.reason,
    code: bounceData.code,
    description: bounceData.description
  };
  
  return this.save();
};

emailTrackingSchema.methods.recordUnsubscribe = function() {
  this.status = 'unsubscribed';
  this.isUnsubscribed = true;
  this.unsubscribedAt = new Date();
  
  return this.save();
};

emailTrackingSchema.methods.recordSpam = function(spamData = {}) {
  this.status = 'spam';
  this.isSpam = true;
  this.spamInfo = {
    reason: spamData.reason,
    timestamp: new Date()
  };
  
  return this.save();
};

// Static methods for analytics
emailTrackingSchema.statics.getCampaignStats = function(campaignId) {
  return this.aggregate([
    { $match: { campaign: mongoose.Types.ObjectId(campaignId) } },
    {
      $group: {
        _id: null,
        totalSent: { $sum: 1 },
        totalDelivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        totalOpened: { $sum: { $cond: ['$isOpened', 1, 0] } },
        totalClicked: { $sum: { $cond: ['$isClicked', 1, 0] } },
        totalBounced: { $sum: { $cond: ['$isBounced', 1, 0] } },
        totalUnsubscribed: { $sum: { $cond: ['$isUnsubscribed', 1, 0] } },
        totalSpam: { $sum: { $cond: ['$isSpam', 1, 0] } },
        totalOpens: { $sum: '$totalOpens' },
        totalClicks: { $sum: '$totalClicks' }
      }
    }
  ]);
};

emailTrackingSchema.statics.getOrganizationStats = function(organizationId, dateRange = {}) {
  const matchQuery = { organization: mongoose.Types.ObjectId(organizationId) };
  
  if (dateRange.startDate && dateRange.endDate) {
    matchQuery.sentAt = {
      $gte: new Date(dateRange.startDate),
      $lte: new Date(dateRange.endDate)
    };
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalSent: { $sum: 1 },
        totalDelivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        totalOpened: { $sum: { $cond: ['$isOpened', 1, 0] } },
        totalClicked: { $sum: { $cond: ['$isClicked', 1, 0] } },
        totalBounced: { $sum: { $cond: ['$isBounced', 1, 0] } },
        totalUnsubscribed: { $sum: { $cond: ['$isUnsubscribed', 1, 0] } },
        totalSpam: { $sum: { $cond: ['$isSpam', 1, 0] } },
        avgOpenRate: { $avg: { $cond: ['$isOpened', 1, 0] } },
        avgClickRate: { $avg: { $cond: ['$isClicked', 1, 0] } }
      }
    }
  ]);
};

module.exports = mongoose.model('EmailTracking', emailTrackingSchema);
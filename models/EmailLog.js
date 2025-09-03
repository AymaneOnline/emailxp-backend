// Email log model for tracking all email activities
const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  // Campaign and subscriber references
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
    index: true
  },
  subscriberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subscriber',
    required: true,
    index: true
  },
  
  // Email details
  email: {
    type: String,
    required: true,
    index: true
  },
  subject: String,
  
  // Delivery status
  status: {
    type: String,
    enum: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed'],
    required: true,
    index: true
  },
  
  // External service data
  messageId: String, // Mailgun message ID
  
  // Timestamps
  sentAt: Date,
  deliveredAt: Date,
  openedAt: Date,
  clickedAt: Date,
  bouncedAt: Date,
  complainedAt: Date,
  unsubscribedAt: Date,
  
  // Event data
  openCount: {
    type: Number,
    default: 0
  },
  clickCount: {
    type: Number,
    default: 0
  },
  
  // Click tracking
  clickedLinks: [{
    url: String,
    clickedAt: Date,
    userAgent: String,
    ipAddress: String
  }],
  
  // Open tracking
  opens: [{
    openedAt: Date,
    userAgent: String,
    ipAddress: String
  }],
  
  // Error information
  error: String,
  bounceReason: String,
  complaintReason: String,
  
  // Webhook event data
  webhookEvents: [{
    eventType: String,
    timestamp: Date,
    data: mongoose.Schema.Types.Mixed
  }],
  
  // Metadata
  metadata: {
    userAgent: String,
    ipAddress: String,
    location: {
      country: String,
      region: String,
      city: String
    }
  }
}, {
  timestamps: true,
  // Optimize for time-series queries
  timeseries: {
    timeField: 'createdAt',
    metaField: 'campaignId',
    granularity: 'hours'
  }
});

// Indexes for performance
emailLogSchema.index({ campaignId: 1, status: 1 });
emailLogSchema.index({ subscriberId: 1, status: 1 });
emailLogSchema.index({ email: 1, status: 1 });
emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ sentAt: -1 });

// Static methods for analytics
emailLogSchema.statics.getCampaignStats = async function(campaignId) {
  const stats = await this.aggregate([
    { $match: { campaignId: mongoose.Types.ObjectId(campaignId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const result = {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    unsubscribed: 0,
    failed: 0
  };
  
  stats.forEach(stat => {
    result[stat._id] = stat.count;
  });
  
  // Calculate rates
  result.deliveryRate = result.sent > 0 ? (result.delivered / result.sent * 100).toFixed(2) : 0;
  result.openRate = result.delivered > 0 ? (result.opened / result.delivered * 100).toFixed(2) : 0;
  result.clickRate = result.delivered > 0 ? (result.clicked / result.delivered * 100).toFixed(2) : 0;
  result.bounceRate = result.sent > 0 ? (result.bounced / result.sent * 100).toFixed(2) : 0;
  result.unsubscribeRate = result.delivered > 0 ? (result.unsubscribed / result.delivered * 100).toFixed(2) : 0;
  
  return result;
};

emailLogSchema.statics.getSubscriberEngagement = async function(subscriberId) {
  const engagement = await this.aggregate([
    { $match: { subscriberId: mongoose.Types.ObjectId(subscriberId) } },
    {
      $group: {
        _id: null,
        totalEmails: { $sum: 1 },
        totalOpens: { $sum: '$openCount' },
        totalClicks: { $sum: '$clickCount' },
        lastOpened: { $max: '$openedAt' },
        lastClicked: { $max: '$clickedAt' }
      }
    }
  ]);
  
  return engagement[0] || {
    totalEmails: 0,
    totalOpens: 0,
    totalClicks: 0,
    lastOpened: null,
    lastClicked: null
  };
};

// Instance methods
emailLogSchema.methods.recordOpen = async function(metadata = {}) {
  this.status = 'opened';
  this.openedAt = this.openedAt || new Date();
  this.openCount += 1;
  this.opens.push({
    openedAt: new Date(),
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress
  });
  
  if (metadata.location) {
    this.metadata.location = metadata.location;
  }
  
  return this.save();
};

emailLogSchema.methods.recordClick = async function(url, metadata = {}) {
  this.status = 'clicked';
  this.clickedAt = this.clickedAt || new Date();
  this.clickCount += 1;
  this.clickedLinks.push({
    url,
    clickedAt: new Date(),
    userAgent: metadata.userAgent,
    ipAddress: metadata.ipAddress
  });
  
  return this.save();
};

emailLogSchema.methods.recordBounce = async function(reason) {
  this.status = 'bounced';
  this.bouncedAt = new Date();
  this.bounceReason = reason;
  return this.save();
};

emailLogSchema.methods.recordComplaint = async function(reason) {
  this.status = 'complained';
  this.complainedAt = new Date();
  this.complaintReason = reason;
  return this.save();
};

emailLogSchema.methods.recordUnsubscribe = async function() {
  this.status = 'unsubscribed';
  this.unsubscribedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('EmailLog', emailLogSchema);
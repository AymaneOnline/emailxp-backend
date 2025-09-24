// emailxp/backend/models/Segment.js

const mongoose = require('mongoose');

const filterSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true,
    enum: [
      'email',
      'name', 
      'tags',
      'createdAt',
      'lastActivity',
      'location.country',
      'location.city',
      'location.timezone',
      'customFields',
      'emailOpens',
      'emailClicks',
      'campaignActivity',
      'engagementScore',
      'lifetimeValue',
      'purchaseCount',
      'lastPurchaseDate',
      'subscriptionStatus',
      'bounceCount',
      'complaintCount',
      'unsubscribeDate'
    ]
  },
  operator: {
    type: String,
    required: true,
    enum: [
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'is_empty',
      'is_not_empty',
      'greater_than',
      'less_than',
      'between',
      'in',
      'not_in',
      'before',
      'after',
      'within_days',
      'more_than_days_ago'
    ]
  },
  value: {
    type: mongoose.Schema.Types.Mixed, // Can be string, number, array, date
    required: function() {
      return !['is_empty', 'is_not_empty'].includes(this.operator);
    }
  },
  secondValue: {
    type: mongoose.Schema.Types.Mixed, // For 'between' operator
  }
});

const segmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  filters: [filterSchema],
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  subscriberCount: {
    type: Number,
    default: 0
  },
  lastCalculated: {
    type: Date,
    default: Date.now
  },
  // Cache the last query for performance
  cachedQuery: {
    type: Object,
    default: {}
  },
  // Custom query for advanced segmentation
  customQuery: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

// Index for performance
segmentSchema.index({ user: 1, isActive: 1 });
segmentSchema.index({ user: 1, name: 1 });

// Method to build MongoDB query from filters (delegates to service now)
segmentSchema.methods.buildQuery = function() {
  if (this.customQuery && Object.keys(this.customQuery).length > 0) {
    return this.customQuery;
  }
  const { buildMongoQuery } = require('../services/segmentationService');
  return buildMongoQuery(this.filters || [], this.logic || 'AND');
};

// Method to count matching subscribers
segmentSchema.methods.countSubscribers = async function() {
  const Subscriber = mongoose.model('Subscriber');
  const query = {
    user: this.user,
    ...this.buildQuery()
  };
  
  try {
    const count = await Subscriber.countDocuments(query);
    this.subscriberCount = count;
    this.lastCalculated = new Date();
    this.cachedQuery = query;
    await this.save();
    return count;
  } catch (error) {
    console.error('Error counting subscribers for segment:', error);
    return 0;
  }
};

// Method to get matching subscribers
segmentSchema.methods.getSubscribers = async function(limit = null, skip = 0) {
  const Subscriber = mongoose.model('Subscriber');
  const query = {
    user: this.user,
    ...this.buildQuery()
  };
  
  try {
    let subscriberQuery = Subscriber.find(query).skip(skip);
    if (limit) {
      subscriberQuery = subscriberQuery.limit(limit);
    }
    return await subscriberQuery.exec();
  } catch (error) {
    console.error('Error getting subscribers for segment:', error);
    return [];
  }
};

// Helper function to build individual filter conditions
// Legacy buildFilterCondition removed in favor of segmentationService

// Static method to get available filter fields with metadata
segmentSchema.statics.getFilterFields = function() {
  return [
    {
      field: 'email',
      label: 'Email Address',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty']
    },
    {
      field: 'name',
      label: 'Name',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty']
    },
    {
      field: 'tags',
      label: 'Tags',
      type: 'array',
      operators: ['contains', 'not_contains', 'in', 'not_in', 'is_empty', 'is_not_empty']
    },
    {
      field: 'createdAt',
      label: 'Signup Date',
      type: 'date',
      operators: ['equals', 'not_equals', 'before', 'after', 'within_days', 'more_than_days_ago']
    },
    {
      field: 'lastActivity',
      label: 'Last Activity',
      type: 'date',
      operators: ['equals', 'not_equals', 'before', 'after', 'within_days', 'more_than_days_ago']
    },
    {
      field: 'location.country',
      label: 'Country',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty']
    },
    {
      field: 'location.city',
      label: 'City',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty']
    },
    {
      field: 'location.timezone',
      label: 'Timezone',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty']
    },
    {
      field: 'emailOpens',
      label: 'Email Opens',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'emailClicks',
      label: 'Email Clicks',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'campaignActivity',
      label: 'Campaign Activity',
      type: 'string',
      operators: ['equals', 'not_equals', 'contains', 'not_contains']
    },
    // New advanced segmentation fields
    {
      field: 'engagementScore',
      label: 'Engagement Score',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'lifetimeValue',
      label: 'Lifetime Value',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'purchaseCount',
      label: 'Purchase Count',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'lastPurchaseDate',
      label: 'Last Purchase Date',
      type: 'date',
      operators: ['equals', 'not_equals', 'before', 'after', 'within_days', 'more_than_days_ago']
    },
    {
      field: 'subscriptionStatus',
      label: 'Subscription Status',
      type: 'string',
      operators: ['equals', 'not_equals', 'in', 'not_in']
    },
    {
      field: 'bounceCount',
      label: 'Bounce Count',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'complaintCount',
      label: 'Complaint Count',
      type: 'number',
      operators: ['equals', 'not_equals', 'greater_than', 'less_than', 'between']
    },
    {
      field: 'unsubscribeDate',
      label: 'Unsubscribe Date',
      type: 'date',
      operators: ['equals', 'not_equals', 'before', 'after', 'within_days', 'more_than_days_ago']
    }
  ];
};

module.exports = mongoose.model('Segment', segmentSchema);
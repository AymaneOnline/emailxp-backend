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
      'campaignActivity'
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
  }
}, {
  timestamps: true
});

// Index for performance
segmentSchema.index({ user: 1, isActive: 1 });
segmentSchema.index({ user: 1, name: 1 });

// Method to build MongoDB query from filters
segmentSchema.methods.buildQuery = function() {
  if (!this.filters || this.filters.length === 0) {
    return {};
  }

  const conditions = this.filters.map(filter => {
    return buildFilterCondition(filter);
  });

  if (conditions.length === 1) {
    return conditions[0];
  }

  return this.logic === 'OR' 
    ? { $or: conditions }
    : { $and: conditions };
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
function buildFilterCondition(filter) {
  const { field, operator, value, secondValue } = filter;
  
  switch (operator) {
    case 'equals':
      return { [field]: value };
      
    case 'not_equals':
      return { [field]: { $ne: value } };
      
    case 'contains':
      return { [field]: { $regex: value, $options: 'i' } };
      
    case 'not_contains':
      return { [field]: { $not: { $regex: value, $options: 'i' } } };
      
    case 'starts_with':
      return { [field]: { $regex: `^${value}`, $options: 'i' } };
      
    case 'ends_with':
      return { [field]: { $regex: `${value}$`, $options: 'i' } };
      
    case 'is_empty':
      return { $or: [{ [field]: { $exists: false } }, { [field]: '' }, { [field]: null }] };
      
    case 'is_not_empty':
      return { [field]: { $exists: true, $ne: '', $ne: null } };
      
    case 'greater_than':
      return { [field]: { $gt: value } };
      
    case 'less_than':
      return { [field]: { $lt: value } };
      
    case 'between':
      return { [field]: { $gte: value, $lte: secondValue } };
      
    case 'in':
      return { [field]: { $in: Array.isArray(value) ? value : [value] } };
      
    case 'not_in':
      return { [field]: { $nin: Array.isArray(value) ? value : [value] } };
      
    case 'before':
      return { [field]: { $lt: new Date(value) } };
      
    case 'after':
      return { [field]: { $gt: new Date(value) } };
      
    case 'within_days':
      const withinDate = new Date();
      withinDate.setDate(withinDate.getDate() - parseInt(value));
      return { [field]: { $gte: withinDate } };
      
    case 'more_than_days_ago':
      const moreThanDate = new Date();
      moreThanDate.setDate(moreThanDate.getDate() - parseInt(value));
      return { [field]: { $lt: moreThanDate } };
      
    default:
      return {};
  }
}

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
      operators: ['before', 'after', 'between', 'within_days', 'more_than_days_ago']
    },
    {
      field: 'location.country',
      label: 'Country',
      type: 'string',
      operators: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty']
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
      operators: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty']
    }
  ];
};

module.exports = mongoose.model('Segment', segmentSchema);
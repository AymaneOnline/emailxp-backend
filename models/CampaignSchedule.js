// emailxp/backend/models/CampaignSchedule.js

const mongoose = require('mongoose');

const campaignScheduleSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // Schedule Configuration
  scheduleType: {
    type: String,
    enum: ['immediate', 'scheduled', 'recurring', 'drip', 'trigger'],
    required: true,
    default: 'immediate'
  },
  
  // For scheduled campaigns
  scheduledDate: {
    type: Date
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  
  // For recurring campaigns
  recurrence: {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly']
    },
    interval: {
      type: Number,
      default: 1
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6
    }],
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31
    },
    endDate: Date,
    maxOccurrences: Number
  },
  
  // For drip campaigns
  dripSequence: [{
    delay: {
      type: Number, // delay in hours
      required: true
    },
    delayUnit: {
      type: String,
      enum: ['minutes', 'hours', 'days', 'weeks'],
      default: 'hours'
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Template'
    },
    subject: String,
    conditions: [{
      field: String,
      operator: String,
      value: mongoose.Schema.Types.Mixed
    }]
  }],
  
  // For trigger-based campaigns
  triggers: [{
    event: {
      type: String,
      enum: ['subscriber_added', 'tag_added', 'tag_removed', 'date_reached', 'custom_event'],
      required: true
    },
    conditions: [{
      field: String,
      operator: String,
      value: mongoose.Schema.Types.Mixed
    }],
    delay: {
      type: Number,
      default: 0
    },
    delayUnit: {
      type: String,
      enum: ['minutes', 'hours', 'days', 'weeks'],
      default: 'minutes'
    }
  }],
  
  // Execution Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'],
    default: 'draft'
  },
  
  // Execution History
  executions: [{
    executedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'partial']
    },
    recipientCount: Number,
    successCount: Number,
    failureCount: Number,
  errorMessages: [String],
    nextExecution: Date
  }],
  
  // Performance Tracking
  stats: {
    totalExecutions: {
      type: Number,
      default: 0
    },
    totalRecipients: {
      type: Number,
      default: 0
    },
    totalSent: {
      type: Number,
      default: 0
    },
    totalDelivered: {
      type: Number,
      default: 0
    },
    totalOpened: {
      type: Number,
      default: 0
    },
    totalClicked: {
      type: Number,
      default: 0
    },
    lastExecuted: Date,
    nextExecution: Date
  },
  
  // Configuration
  settings: {
    maxRecipientsPerExecution: {
      type: Number,
      default: 1000
    },
    throttleDelay: {
      type: Number,
      default: 0 // milliseconds between sends
    },
    retryFailures: {
      type: Boolean,
      default: true
    },
    maxRetries: {
      type: Number,
      default: 3
    },
    trackOpens: {
      type: Boolean,
      default: true
    },
    trackClicks: {
      type: Boolean,
      default: true
    }
  },
  
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance
campaignScheduleSchema.index({ user: 1, status: 1 });
campaignScheduleSchema.index({ 'stats.nextExecution': 1, status: 1 });
campaignScheduleSchema.index({ scheduleType: 1, status: 1 });

// Methods
campaignScheduleSchema.methods.calculateNextExecution = function() {
  if (this.scheduleType === 'recurring' && this.recurrence) {
    const now = new Date();
    let nextDate = new Date(now);
    
    switch (this.recurrence.type) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + this.recurrence.interval);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + (7 * this.recurrence.interval));
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + this.recurrence.interval);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + this.recurrence.interval);
        break;
    }
    
    this.stats.nextExecution = nextDate;
    return nextDate;
  }
  
  return null;
};

campaignScheduleSchema.methods.shouldExecute = function() {
  const now = new Date();
  
  switch (this.status) {
    case 'scheduled':
      return this.scheduledDate && this.scheduledDate <= now;
    case 'running':
      return this.stats.nextExecution && this.stats.nextExecution <= now;
    default:
      return false;
  }
};

campaignScheduleSchema.methods.recordExecution = function(result) {
  this.executions.push({
    status: result.status,
    recipientCount: result.recipientCount,
    successCount: result.successCount,
    failureCount: result.failureCount,
  errorMessages: result.errors || result.errorMessages || [],
    nextExecution: this.calculateNextExecution()
  });
  
  // Update stats
  this.stats.totalExecutions += 1;
  this.stats.totalRecipients += result.recipientCount;
  this.stats.totalSent += result.successCount;
  this.stats.lastExecuted = new Date();
  
  // Calculate next execution for recurring campaigns
  if (this.scheduleType === 'recurring') {
    this.calculateNextExecution();
  } else if (this.scheduleType === 'scheduled') {
    this.status = 'completed';
  }
};

module.exports = mongoose.model('CampaignSchedule', campaignScheduleSchema);
// emailxp/backend/models/BehavioralTrigger.js

const mongoose = require('mongoose');

const behavioralTriggerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Trigger name is required'],
    trim: true,
    maxlength: [100, 'Trigger name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  // The campaign template to send
  campaignTemplate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true
  },
  // Event that triggers this behavior
  triggerEvent: {
    eventType: {
      type: String,
      required: true,
      enum: [
        'page_view', 
        'product_view', 
        'cart_add', 
        'cart_remove', 
        'purchase', 
        'form_submit', 
        'link_click', 
        'video_view',
        'download',
        'custom'
      ]
    },
    customEventType: {
      type: String,
      trim: true,
      maxlength: 100
    },
    // Optional target filter (e.g., specific product URL, page path)
    target: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    // Optional data filter (e.g., specific product category)
    dataFilter: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  // Conditions that must be met for the trigger to activate
  conditions: [{
    field: {
      type: String,
      required: true
    },
    operator: {
      type: String,
      enum: ['equals', 'notEquals', 'contains', 'notContains', 'greaterThan', 'lessThan'],
      required: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  }],
  // Timing configuration
  timing: {
    // Delay before sending (in minutes)
    delayMinutes: {
      type: Number,
      default: 0,
      min: 0
    },
    // Time window for the trigger (e.g., only trigger between 9AM-5PM)
    timeWindow: {
      start: {
        type: String,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      },
      end: {
        type: String,
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format']
      }
    },
    // Days of the week when the trigger can fire
    activeDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }]
  },
  // Frequency limits
  frequency: {
    // Maximum number of times this trigger can fire per subscriber
    maxPerSubscriber: {
      type: Number,
      default: 1
    },
    // Time period for frequency limit (in hours)
    periodHours: {
      type: Number,
      default: 24
    }
  },
  // Status of the trigger
  isActive: {
    type: Boolean,
    default: true
  },
  // Tracking of when this trigger was last fired
  lastFired: {
    type: Date
  },
  // Statistics
  stats: {
    timesFired: {
      type: Number,
      default: 0
    },
    uniqueSubscribers: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
behavioralTriggerSchema.index({ user: 1, isActive: 1 });
behavioralTriggerSchema.index({ triggerEvent: 1 });
behavioralTriggerSchema.index({ 'triggerEvent.eventType': 1 });
behavioralTriggerSchema.index({ lastFired: -1 });

// Method to check if conditions are met for a subscriber
behavioralTriggerSchema.methods.checkConditions = function(subscriber) {
  if (!this.conditions || this.conditions.length === 0) {
    return true;
  }
  
  // For now, we'll implement a simple check
  // In a real implementation, this would check subscriber properties against conditions
  return true;
};

// Method to check if frequency limits allow firing for a subscriber
behavioralTriggerSchema.methods.checkFrequency = async function(subscriberId) {
  // This would check if the trigger has been fired for this subscriber within the period
  // For now, we'll implement a simple check
  return true;
};

// Method to check if timing constraints allow firing
behavioralTriggerSchema.methods.checkTiming = function() {
  const now = new Date();
  
  // Check active days
  if (this.timing && this.timing.activeDays && this.timing.activeDays.length > 0) {
    const dayMap = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday'
    };
    
    const today = dayMap[now.getDay()];
    if (!this.timing.activeDays.includes(today)) {
      return false;
    }
  }
  
  // Check time window
  if (this.timing && this.timing.timeWindow && this.timing.timeWindow.start && this.timing.timeWindow.end) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    if (currentTime < this.timing.timeWindow.start || currentTime > this.timing.timeWindow.end) {
      return false;
    }
  }
  
  return true;
};

module.exports = mongoose.model('BehavioralTrigger', behavioralTriggerSchema);
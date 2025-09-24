// emailxp/backend/models/ABTest.js

const mongoose = require('mongoose');

const abTestVariantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  // For subject line tests
  subject: {
    type: String,
    trim: true
  },
  // For content tests
  htmlContent: {
    type: String
  },
  // For sender tests
  fromName: {
    type: String,
    trim: true
  },
  fromEmail: {
    type: String,
    trim: true
  },
  // Statistics for this variant
  sentCount: {
    type: Number,
    default: 0
  },
  openCount: {
    type: Number,
    default: 0
  },
  clickCount: {
    type: Number,
    default: 0
  },
  bounceCount: {
    type: Number,
    default: 0
  },
  unsubscribeCount: {
    type: Number,
    default: 0
  },
  complaintCount: {
    type: Number,
    default: 0
  }
});

const abTestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Campaign'
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
  // Test configuration
  testType: {
    type: String,
    required: true,
    enum: ['subject', 'content', 'sender'],
    default: 'subject'
  },
  winnerCriteria: {
    type: String,
    required: true,
    enum: ['open_rate', 'click_rate'],
    default: 'open_rate'
  },
  testPercentage: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
    default: 50
  },
  // Variants
  variants: [abTestVariantSchema],
  // Test status
  status: {
    type: String,
    enum: ['draft', 'running', 'completed', 'cancelled'],
    default: 'draft'
  },
  // Winner information
  winnerVariant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ABTestVariant'
  },
  winnerDeclaredAt: {
    type: Date
  },
  // Timing
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  // Manual winner declaration
  manuallyDeclaredWinner: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for performance
abTestSchema.index({ user: 1, status: 1 });
abTestSchema.index({ campaign: 1 });

// Calculate open rate for a variant
abTestSchema.methods.getOpenRate = function(variant) {
  if (variant.sentCount === 0) return 0;
  return (variant.openCount / variant.sentCount) * 100;
};

// Calculate click rate for a variant
abTestSchema.methods.getClickRate = function(variant) {
  if (variant.sentCount === 0) return 0;
  return (variant.clickCount / variant.sentCount) * 100;
};

// Determine winner based on criteria
abTestSchema.methods.determineWinner = function() {
  if (this.variants.length < 2) return null;
  
  let bestVariant = this.variants[0];
  let bestRate = 0;
  
  for (const variant of this.variants) {
    let rate = 0;
    if (this.winnerCriteria === 'open_rate') {
      rate = this.getOpenRate(variant);
    } else if (this.winnerCriteria === 'click_rate') {
      rate = this.getClickRate(variant);
    }
    
    if (rate > bestRate) {
      bestRate = rate;
      bestVariant = variant;
    }
  }
  
  return bestVariant;
};

// Check if test has enough data to declare a winner
abTestSchema.methods.hasEnoughData = function() {
  // Simple check: at least 100 emails sent per variant
  for (const variant of this.variants) {
    if (variant.sentCount < 100) {
      return false;
    }
  }
  return true;
};

module.exports = mongoose.model('ABTest', abTestSchema);
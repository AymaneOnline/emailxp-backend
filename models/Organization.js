// emailxp/backend/models/Organization.js

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxlength: [100, 'Organization name cannot exceed 100 characters']
  },
  
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // Contact Information
  email: {
    type: String,
    required: [true, 'Organization email is required'],
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  
  phone: {
    type: String,
    trim: true
  },
  
  website: {
    type: String,
    trim: true
  },
  
  // Address
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  
  // Organization Details
  industry: {
    type: String,
    enum: [
      'technology', 'healthcare', 'finance', 'education', 'retail', 
      'manufacturing', 'consulting', 'nonprofit', 'government', 
      'media', 'real_estate', 'hospitality', 'other'
    ]
  },
  
  size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
    default: '1-10'
  },
  
  // Branding
  logo: {
    type: String, // URL to logo image
    default: null
  },
  
  brandColors: {
    primary: {
      type: String,
      default: '#dc2626'
    },
    secondary: {
      type: String,
      default: '#059669'
    }
  },
  
  // Subscription and Billing
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'past_due', 'trialing', 'incomplete'],
      default: 'trialing'
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },
    trialEnd: Date
  },
  
  // Usage Limits (organization-wide)
  limits: {
    users: {
      type: Number,
      default: 3
    },
    emailsPerMonth: {
      type: Number,
      default: 5000
    },
    subscribersMax: {
      type: Number,
      default: 2000
    },
    templatesMax: {
      type: Number,
      default: 50
    },
    campaignsPerMonth: {
      type: Number,
      default: 50
    },
    automationRules: {
      type: Number,
      default: 10
    },
    apiCallsPerDay: {
      type: Number,
      default: 1000
    }
  },
  
  // Current Usage
  usage: {
    users: {
      type: Number,
      default: 0
    },
    emailsSentThisMonth: {
      type: Number,
      default: 0
    },
    subscribersCount: {
      type: Number,
      default: 0
    },
    templatesCount: {
      type: Number,
      default: 0
    },
    campaignsThisMonth: {
      type: Number,
      default: 0
    },
    automationRulesCount: {
      type: Number,
      default: 0
    },
    apiCallsToday: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Settings
  settings: {
    // Email Settings
    defaultFromName: {
      type: String,
      default: function() { return this.name; }
    },
    defaultFromEmail: {
      type: String,
      default: function() { return this.email; }
    },
    defaultReplyTo: {
      type: String,
      default: function() { return this.email; }
    },
    
    // Timezone and Localization
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    
    // Security Settings
    requireTwoFactor: {
      type: Boolean,
      default: false
    },
    passwordPolicy: {
      minLength: {
        type: Number,
        default: 8
      },
      requireUppercase: {
        type: Boolean,
        default: true
      },
      requireNumbers: {
        type: Boolean,
        default: true
      },
      requireSymbols: {
        type: Boolean,
        default: false
      }
    },
    sessionTimeout: {
      type: Number,
      default: 24 // hours
    },
    
    // Feature Flags
    features: {
      advancedAnalytics: {
        type: Boolean,
        default: false
      },
      automation: {
        type: Boolean,
        default: false
      },
      apiAccess: {
        type: Boolean,
        default: false
      },
      whiteLabeling: {
        type: Boolean,
        default: false
      },
      prioritySupport: {
        type: Boolean,
        default: false
      }
    },
    
    // Notification Settings
    notifications: {
      campaignUpdates: {
        type: Boolean,
        default: true
      },
      systemAlerts: {
        type: Boolean,
        default: true
      },
      billingAlerts: {
        type: Boolean,
        default: true
      },
      usageAlerts: {
        type: Boolean,
        default: true
      }
    }
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending_verification'],
    default: 'pending_verification'
  },
  
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      // Only require owner after the organization is saved (has an _id)
      return this._id && this.isModified('owner');
    }
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      // Only require createdBy after the organization is saved (has an _id)
      return this._id && this.isModified('createdBy');
    }
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate slug
organizationSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

// Methods
organizationSchema.methods.checkUsageLimit = function(resource) {
  switch (resource) {
    case 'users':
      return this.usage.users < this.limits.users;
    case 'emails':
      return this.usage.emailsSentThisMonth < this.limits.emailsPerMonth;
    case 'subscribers':
      return this.usage.subscribersCount < this.limits.subscribersMax;
    case 'templates':
      return this.usage.templatesCount < this.limits.templatesMax;
    case 'campaigns':
      return this.usage.campaignsThisMonth < this.limits.campaignsPerMonth;
    case 'automation':
      return this.usage.automationRulesCount < this.limits.automationRules;
    case 'api':
      return this.usage.apiCallsToday < this.limits.apiCallsPerDay;
    default:
      return true;
  }
};

organizationSchema.methods.incrementUsage = function(resource, amount = 1) {
  const updates = {};
  
  switch (resource) {
    case 'users':
      updates['usage.users'] = this.usage.users + amount;
      break;
    case 'emails':
      updates['usage.emailsSentThisMonth'] = this.usage.emailsSentThisMonth + amount;
      break;
    case 'subscribers':
      updates['usage.subscribersCount'] = this.usage.subscribersCount + amount;
      break;
    case 'templates':
      updates['usage.templatesCount'] = this.usage.templatesCount + amount;
      break;
    case 'campaigns':
      updates['usage.campaignsThisMonth'] = this.usage.campaignsThisMonth + amount;
      break;
    case 'automation':
      updates['usage.automationRulesCount'] = this.usage.automationRulesCount + amount;
      break;
    case 'api':
      updates['usage.apiCallsToday'] = this.usage.apiCallsToday + amount;
      break;
  }
  
  return this.updateOne({ $set: updates });
};

organizationSchema.methods.resetMonthlyUsage = function() {
  return this.updateOne({
    $set: {
      'usage.emailsSentThisMonth': 0,
      'usage.campaignsThisMonth': 0,
      'usage.lastResetDate': new Date()
    }
  });
};

organizationSchema.methods.resetDailyUsage = function() {
  return this.updateOne({
    $set: {
      'usage.apiCallsToday': 0
    }
  });
};

organizationSchema.methods.hasFeature = function(feature) {
  return this.settings.features[feature] === true;
};

organizationSchema.methods.getUsagePercentage = function(resource) {
  const usage = this.usage[resource] || 0;
  const limit = this.limits[resource] || 1;
  return Math.min((usage / limit) * 100, 100);
};

// Static methods
organizationSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug: slug.toLowerCase() });
};

organizationSchema.statics.getPlanLimits = function(plan) {
  const planLimits = {
    free: {
      users: 3,
      emailsPerMonth: 1000,
      subscribersMax: 500,
      templatesMax: 10,
      campaignsPerMonth: 10,
      automationRules: 3,
      apiCallsPerDay: 100
    },
    starter: {
      users: 5,
      emailsPerMonth: 5000,
      subscribersMax: 2000,
      templatesMax: 50,
      campaignsPerMonth: 50,
      automationRules: 10,
      apiCallsPerDay: 1000
    },
    professional: {
      users: 15,
      emailsPerMonth: 25000,
      subscribersMax: 10000,
      templatesMax: 200,
      campaignsPerMonth: 200,
      automationRules: 50,
      apiCallsPerDay: 5000
    },
    enterprise: {
      users: 100,
      emailsPerMonth: 100000,
      subscribersMax: 50000,
      templatesMax: 1000,
      campaignsPerMonth: 1000,
      automationRules: 200,
      apiCallsPerDay: 25000
    }
  };
  
  return planLimits[plan] || planLimits.free;
};

organizationSchema.statics.getPlanFeatures = function(plan) {
  const planFeatures = {
    free: {
      advancedAnalytics: false,
      automation: false,
      apiAccess: false,
      whiteLabeling: false,
      prioritySupport: false
    },
    starter: {
      advancedAnalytics: true,
      automation: false,
      apiAccess: false,
      whiteLabeling: false,
      prioritySupport: false
    },
    professional: {
      advancedAnalytics: true,
      automation: true,
      apiAccess: true,
      whiteLabeling: false,
      prioritySupport: true
    },
    enterprise: {
      advancedAnalytics: true,
      automation: true,
      apiAccess: true,
      whiteLabeling: true,
      prioritySupport: true
    }
  };
  
  return planFeatures[plan] || planFeatures.free;
};

// Indexes
organizationSchema.index({ slug: 1 });
organizationSchema.index({ owner: 1 });
organizationSchema.index({ status: 1 });
organizationSchema.index({ 'subscription.plan': 1 });

module.exports = mongoose.model('Organization', organizationSchema);
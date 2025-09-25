// emailxp/backend/models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing
const crypto = require('crypto'); // For generating verification tokens

const userSchema = mongoose.Schema(
  {
    companyOrOrganization: {
      type: String,
      required: [true, 'Please add a company or organization name'],
    },
    name: {
      type: String,
      required: [true, 'Please add a name'],
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false, // Don't return password in queries by default
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'manager', 'editor', 'viewer', 'user'],
      default: 'user',
    },
    // NEW FIELDS FOR EMAIL VERIFICATION
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    // END NEW FIELDS
    // NEW FIELD FOR PROFILE COMPLETION (will be used later)
    isProfileComplete: {
      type: Boolean,
      default: false, // Default to false, user completes after email verification
    },
    // NEW FIELD FOR PROFILE PICTURE
    profilePicture: {
      type: String,
      default: null, // URL to the uploaded profile picture
    },
    // END NEW FIELD
    // NEW FIELDS FOR EXTENDED PROFILE
    website: {
      type: String,
      default: '',
    },
    industry: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
    },
    // Location fields
    address: {
      type: String,
      default: '',
      trim: true
    },
    city: {
      type: String,
      default: '',
      trim: true
    },
    country: {
      type: String,
      default: '',
      trim: true
    },
    // DOMAIN VERIFICATION FLAG
    hasVerifiedDomain: {
      type: Boolean,
      default: false,
      index: true
    },
    // END NEW FIELDS
    
    // MULTI-TENANCY FIELDS
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: function() {
        return this.role !== 'super_admin';
      }
    },
    
    // PERMISSIONS AND ACCESS CONTROL
    permissions: [{
      resource: {
        type: String,
        enum: [
          'campaigns', 'templates', 'subscribers', 'segments', 'analytics', 
          'settings', 'users', 'billing', 'integrations', 'automation'
        ]
      },
      actions: [{
        type: String,
        enum: ['create', 'read', 'update', 'delete', 'manage']
      }]
    }],
    
    // ACCOUNT STATUS
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'pending'],
      default: 'pending'
    },
    
    // SUBSCRIPTION AND LIMITS
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'starter', 'professional', 'enterprise'],
        default: 'free'
      },
      status: {
        type: String,
        enum: ['active', 'cancelled', 'past_due', 'trialing'],
        default: 'trialing'
      },
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: {
        type: Boolean,
        default: false
      }
    },
    
    // USAGE LIMITS
    limits: {
      emailsPerMonth: {
        type: Number,
        default: 1000
      },
      subscribersMax: {
        type: Number,
        default: 500
      },
      templatesMax: {
        type: Number,
        default: 10
      },
      campaignsPerMonth: {
        type: Number,
        default: 10
      }
    },
    
    // USAGE TRACKING
    usage: {
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
      lastResetDate: {
        type: Date,
        default: Date.now
      }
    },
    
    // SECURITY AND LOGIN
    lastLogin: Date,
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockUntil: Date,
    
    // TWO-FACTOR AUTHENTICATION
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    // ACCOUNT DELETION
    deletionRequestedAt: {
      type: Date,
      default: null
    },
    deletionToken: {
      type: String,
      default: null
    },
    deletionTokenExpires: {
      type: Date,
      default: null
    },
    // END ACCOUNT DELETION
    twoFactorBackupCodes: [String],
    
    // API ACCESS
    apiKey: String,
    apiKeyCreatedAt: Date,
    apiKeyLastUsed: Date,
    
    // PREFERENCES
    preferences: {
      timezone: {
        type: String,
        default: 'UTC'
      },
      dateFormat: {
        type: String,
        default: 'MM/DD/YYYY'
      },
      emailNotifications: {
        campaignUpdates: { type: Boolean, default: true },
        systemAlerts: { type: Boolean, default: true },
        weeklyReports: { type: Boolean, default: true },
        marketingEmails: { type: Boolean, default: false }
      },
      dashboardLayout: {
        type: String,
        enum: ['compact', 'comfortable', 'spacious'],
        default: 'comfortable'
      }
    }
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  // 'this' refers to the user document
  return await bcrypt.compare(enteredPassword, this.password);
};

// Method to generate and hash email verification token
userSchema.methods.getVerificationToken = function () {
  const verificationToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to verificationToken field
  this.verificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  // Set expire (e.g., 1 hour)
  this.verificationTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour

  return verificationToken; // Return the unhashed token to send in email
};

// Method to check if user has permission
userSchema.methods.hasPermission = function(resource, action) {
  // Super admin has all permissions
  if (this.role === 'super_admin') return true;
  
  // Check specific permissions
  const permission = this.permissions.find(p => p.resource === resource);
  if (!permission) return false;
  
  return permission.actions.includes(action) || permission.actions.includes('manage');
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Method to generate API key
userSchema.methods.generateApiKey = function() {
  const apiKey = crypto.randomBytes(32).toString('hex');
  this.apiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
  this.apiKeyCreatedAt = new Date();
  return apiKey; // Return unhashed key
};

// Method to check usage limits
userSchema.methods.checkUsageLimit = function(resource) {
  switch (resource) {
    case 'emails':
      return this.usage.emailsSentThisMonth < this.limits.emailsPerMonth;
    case 'subscribers':
      return this.usage.subscribersCount < this.limits.subscribersMax;
    case 'templates':
      return this.usage.templatesCount < this.limits.templatesMax;
    case 'campaigns':
      return this.usage.campaignsThisMonth < this.limits.campaignsPerMonth;
    default:
      return true;
  }
};

// Method to increment usage
userSchema.methods.incrementUsage = function(resource, amount = 1) {
  const updates = {};
  
  switch (resource) {
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
  }
  
  return this.updateOne({ $set: updates });
};

// Static method to get role hierarchy
userSchema.statics.getRoleHierarchy = function() {
  return {
    'super_admin': 6,
    'admin': 5,
    'manager': 4,
    'editor': 3,
    'viewer': 2,
    'user': 1
  };
};

// Static method to check if role can manage another role
userSchema.statics.canManageRole = function(managerRole, targetRole) {
  const hierarchy = this.getRoleHierarchy();
  return hierarchy[managerRole] > hierarchy[targetRole];
};

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ organization: 1, role: 1 });
userSchema.index({ apiKey: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);

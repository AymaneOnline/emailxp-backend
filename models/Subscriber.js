const mongoose = require('mongoose');
const crypto = require('crypto');

const subscriberSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
            index: true
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            lowercase: true,
            trim: true,
            match: [
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                'Please enter a valid email address'
            ]
        },
        name: {
            type: String,
            trim: true,
            default: ''
        },
        status: {
            type: String,
            enum: ['pending','subscribed', 'unsubscribed', 'bounced', 'complained'],
            default: 'subscribed',
            index: true
        },
        // tags removed
        groups: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group'
        }],
        unsubscribedCategories: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PreferenceCategory',
            index: true
        }],
        customFields: {
            type: Map,
            of: String,
            default: {}
        },
        source: {
            type: String,
            enum: ['manual', 'import', 'form', 'api'],
            default: 'manual'
        },
        confirmedAt: {
            type: Date
        },
        confirmationToken: {
            type: String,
            index: true
        },
        confirmationSentAt: {
            type: Date
        },
        confirmationExpiresAt: {
            type: Date
        },
        unsubscribedAt: {
            type: Date
        },
        lastActivityAt: {
            type: Date,
            default: Date.now
        },
        // Engagement metrics
        openCount: {
            type: Number,
            default: 0,
            index: true
        },
        clickCount: {
            type: Number,
            default: 0,
            index: true
        },
        lastOpenAt: {
            type: Date,
            index: true
        },
        lastClickAt: {
            type: Date,
            index: true
        },
        // Unsubscribe token for secure unsubscribe links
        unsubscribeToken: {
            type: String,
            index: true
        },
        // Location and timezone information
        location: {
            country: { type: String, trim: true },
            region: { type: String, trim: true },
            city: { type: String, trim: true },
            timezone: { type: String, trim: true }, // e.g., 'America/New_York'
            ipAddress: { type: String, trim: true } // For timezone detection
        },
        // Soft delete
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        },
        deletedAt: {
            type: Date
        }
    },
    {
        timestamps: true, // This gives us createdAt and updatedAt
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Compound unique index - one email per user account
subscriberSchema.index(
    { email: 1, user: 1 }, 
    { 
        unique: true,
        partialFilterExpression: { isDeleted: false }
    }
);

// Additional indexes for performance
subscriberSchema.index({ user: 1, status: 1 });
subscriberSchema.index({ user: 1, isDeleted: 1, status: 1 });
subscriberSchema.index({ user: 1, lastActivityAt: -1 });
// For efficient cleanup of expired pending confirmations
subscriberSchema.index({ status: 1, confirmationExpiresAt: 1 });
subscriberSchema.index({ user: 1, unsubscribedCategories: 1 });

// Virtual for displaying subscriber name
subscriberSchema.virtual('displayName').get(function() {
    return this.name || this.email.split('@')[0];
});

// Instance methods
subscriberSchema.methods.activate = function() {
    this.status = 'active';
    this.confirmedAt = new Date();
    this.lastActivityAt = new Date();
    return this.save();
};

subscriberSchema.methods.unsubscribe = function() {
    this.status = 'unsubscribed';
    this.unsubscribedAt = new Date();
    this.lastActivityAt = new Date();
    return this.save();
};

subscriberSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

subscriberSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = undefined;
    return this.save();
};

// Static methods
subscriberSchema.statics.getStats = function(userId) {
    return this.aggregate([
        {
            $match: {
                user: new mongoose.Types.ObjectId(userId),
                isDeleted: false
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
};

subscriberSchema.statics.findActive = function(userId) {
    return this.find({
        user: userId,
        status: 'active',
        isDeleted: false
    });
};

// Remove subscribers that never confirmed within the allowed TTL
subscriberSchema.statics.cleanupExpiredPending = async function(limit = 1000) {
    const now = new Date();
    const criteria = {
        status: 'pending',
        confirmationExpiresAt: { $lt: now }
    };
    // Soft delete instead of hard delete to keep audit trail
    const docs = await this.find(criteria).limit(limit).select('_id isDeleted');
    if (!docs.length) return { removed: 0 };
    const ids = docs.map(d => d._id);
    await this.updateMany({ _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: now } });
    return { removed: ids.length };
};

// Pre-save middleware
subscriberSchema.pre('save', function(next) {
    if (this.status === 'active' && !this.confirmedAt) {
        this.confirmedAt = new Date();
    }
    // Generate unsubscribe token if missing
    if (!this.unsubscribeToken) {
        this.unsubscribeToken = crypto.randomBytes(24).toString('hex');
    }
    next();
});

module.exports = mongoose.model('Subscriber', subscriberSchema);

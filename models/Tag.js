const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
            index: true
        },
        name: {
            type: String,
            required: [true, 'Tag name is required'],
            trim: true,
            maxlength: [50, 'Tag name cannot exceed 50 characters']
        },
        color: {
            type: String,
            match: [/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color'],
            default: '#3B82F6' // Default blue
        },
        description: {
            type: String,
            trim: true,
            maxlength: [200, 'Description cannot exceed 200 characters']
        },
        subscriberCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

// Compound unique index - one tag name per user
tagSchema.index({ name: 1, user: 1 }, { unique: true });

// Instance methods
tagSchema.methods.updateSubscriberCount = async function() {
    const Subscriber = mongoose.model('Subscriber');
    const count = await Subscriber.countDocuments({
        user: this.user,
        tags: this._id,
        isDeleted: false
    });
    this.subscriberCount = count;
    return this.save();
};

// Static methods
tagSchema.statics.getPopularTags = function(userId, limit = 10) {
    return this.find({ user: userId })
        .sort({ subscriberCount: -1 })
        .limit(limit);
};

module.exports = mongoose.model('Tag', tagSchema);

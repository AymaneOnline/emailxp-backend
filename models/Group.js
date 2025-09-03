// emailxp/backend/models/Group.js
const mongoose = require('mongoose');

const groupSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        name: {
            type: String,
            required: [true, 'Please add a group name'],
            // Removed 'unique: true' from here, as it's now handled by the compound index below
        },
        description: {
            type: String,
            default: '', 
        },
        subscribers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subscriber',
            },
        ],
        subscriberCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// ---
// Add this compound unique index
// This ensures that the combination of 'name' and 'user' is unique.
// So, each user can have groups with the same names, but a single user
// cannot have two groups with the same name.
groupSchema.index({ name: 1, user: 1 }, { unique: true });
// ---

// Instance methods
groupSchema.methods.updateSubscriberCount = async function() {
    const Subscriber = mongoose.model('Subscriber');
    const count = await Subscriber.countDocuments({
        user: this.user,
        groups: this._id,
        isDeleted: false
    });
    this.subscriberCount = count;
    return this.save();
};

module.exports = mongoose.model('Group', groupSchema);

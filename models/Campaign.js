const mongoose = require('mongoose');

const campaignSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId, // Links to the User model (owner of the campaign)
            required: true,
            ref: 'User',
        },
        list: {
            type: mongoose.Schema.Types.ObjectId, // Links to the List model (target audience)
            required: [true, 'Please select a list for the campaign'],
            ref: 'List',
        },
        name: {
            type: String,
            required: [true, 'Please add a campaign name'],
            unique: false, // Campaign names don't need to be unique globally, but should be meaningful
        },
        subject: {
            type: String,
            required: [true, 'Please add a campaign subject'],
        },
        htmlContent: {
            type: String,
            required: [true, 'Please add HTML content for the email'],
        },
        plainTextContent: {
            type: String,
            default: '', // Optional plain text version for email clients that don't support HTML
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'paused'],
            default: 'draft',
        },
        scheduledAt: {
            type: Date,
            // Only required if status is 'scheduled'
        },
        sentAt: {
            type: Date,
            // Populated when status becomes 'sent'
        },
        // We can add more fields later for tracking (e.g., sentCount, openCount, clickCount)
    },
    {
        timestamps: true, // Adds createdAt and updatedAt automatically
    }
);

module.exports = mongoose.model('Campaign', campaignSchema);
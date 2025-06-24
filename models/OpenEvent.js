// emailxp/backend/models/OpenEvent.js

const mongoose = require('mongoose');

const openEventSchema = mongoose.Schema(
    {
        // Reference to the Campaign this open belongs to
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Campaign',
        },
        // Reference to the Subscriber who opened the email
        subscriber: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Subscriber',
        },
        // Store the email address for easier querying/logging without deep population
        email: {
            type: String,
            required: true,
        },
        // Timestamp of when the open event occurred
        timestamp: {
            type: Date,
            default: Date.now,
            expires: '365d' // Optional: Automatically delete events older than 1 year to save space
        },
        // Optional: Any additional data relevant to the open event
        ipAddress: {
            type: String,
        },
        userAgent: {
            type: String,
        }
    },
    {
        timestamps: true, // Adds createdAt and updatedAt timestamps
    }
);

// Create an index for faster querying by campaign, subscriber, and timestamp
openEventSchema.index({ campaign: 1, subscriber: 1, timestamp: -1 });
openEventSchema.index({ timestamp: -1 }); // Index for time-based queries

module.exports = mongoose.model('OpenEvent', openEventSchema);
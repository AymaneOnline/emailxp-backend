// emailxp/backend/models/ClickEvent.js

const mongoose = require('mongoose');

const clickEventSchema = mongoose.Schema(
    {
        // Reference to the Campaign this click belongs to
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Campaign',
        },
        // Reference to the Subscriber who clicked the link
        subscriber: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'Subscriber',
        },
        // Store the email address for easier querying/logging
        email: {
            type: String,
            required: true,
        },
        // The URL that was clicked
        url: {
            type: String,
            required: true,
        },
        // Timestamp of when the click event occurred
        timestamp: {
            type: Date,
            default: Date.now,
            expires: '365d' // Optional: Automatically delete events older than 1 year
        },
        // Optional: Any additional data relevant to the click event
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
clickEventSchema.index({ campaign: 1, subscriber: 1, timestamp: -1 });
clickEventSchema.index({ timestamp: -1 }); // Index for time-based queries

module.exports = mongoose.model('ClickEvent', clickEventSchema);
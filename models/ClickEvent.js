// emailxp/backend/models/ClickEvent.js
const mongoose = require('mongoose');

const ClickEventSchema = mongoose.Schema(
    {
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Campaign',
            required: true,
        },
        subscriber: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subscriber',
            required: true,
        },
        originalUrl: {
            type: String,
            required: true,
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        // Optional: You can add more tracking data here if needed
        // ipAddress: {
        //     type: String,
        // },
        // userAgent: {
        //     type: String,
        // },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt timestamps
    }
);

module.exports = mongoose.model('ClickEvent', ClickEventSchema);
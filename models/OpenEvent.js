const mongoose = require('mongoose');

const openEventSchema = mongoose.Schema(
    {
        // Reference to the Campaign that was opened
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
        // Timestamp when the email was opened
        openedAt: {
            type: Date,
            default: Date.now,
        },
        // Optional: Could store IP address and user agent for more advanced analytics
        // ipAddress: {
        //     type: String,
        // },
        // userAgent: {
        //     type: String,
        // },
    },
    {
        timestamps: true, // This adds createdAt and updatedAt fields automatically
    }
);

module.exports = mongoose.model('OpenEvent', openEventSchema);
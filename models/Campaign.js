// emailxp/backend/models/Campaign.js

const mongoose = require('mongoose');

const campaignSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        list: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'List',
        },
        name: {
            type: String,
            required: [true, 'Please add a campaign name'],
            trim: true,
        },
        subject: {
            type: String,
            required: [true, 'Please add a subject'],
            trim: true,
        },
        htmlContent: {
            type: String,
            required: [true, 'Please add HTML content'],
        },
        plainTextContent: {
            type: String,
            default: '',
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'],
            default: 'draft',
        },
        scheduledAt: {
            type: Date,
            default: null,
        },
        sentAt: {
            type: Date,
            default: null, // This will be updated by sendCampaignManually
        },
        template: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Template',
            default: null,
        },
        // --- CORRECT FIELD NAME: To store the count of successfully sent emails for a campaign ---
        emailsSuccessfullySent: {
            type: Number,
            default: 0,
        },
        // --- Added fields for direct tracking counts ---
        opens: {
            type: Number,
            default: 0,
        },
        clicks: {
            type: Number,
            default: 0,
        },
        bouncedCount: {
            type: Number,
            default: 0,
        },
        unsubscribedCount: {
            type: Number,
            default: 0,
        },
        complaintCount: {
            type: Number,
            default: 0,
        },
        totalRecipients: { // To store the count of subscribers targetted by the campaign send
            type: Number,
            default: 0,
        },
        // --- End of tracking fields ---
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Campaign', campaignSchema);
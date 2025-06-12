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
            default: null,
        },
        template: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Template',
            default: null,
        },
        // --- NEW FIELD: To store the count of successfully sent emails for a campaign ---
        emailsSuccessfullySent: {
            type: Number,
            default: 0,
        },
        // --- END NEW FIELD ---
    },
    {
        timestamps: true,
    }
);

// --- Pre-delete hook to cascade delete related events ---
campaignSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    console.log(`[Mongoose Pre-Delete] Deleting associated OpenEvent and ClickEvent documents for Campaign: ${this._id}`);

    const OpenEvent = mongoose.model('OpenEvent');
    const ClickEvent = mongoose.model('ClickEvent');

    await OpenEvent.deleteMany({ campaign: this._id });
    await ClickEvent.deleteMany({ campaign: this._id });

    console.log(`[Mongoose Pre-Delete] Associated events deleted for Campaign: ${this._id}`);
    next();
});

module.exports = mongoose.model('Campaign', campaignSchema);
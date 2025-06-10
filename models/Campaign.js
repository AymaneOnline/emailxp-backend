// In emailxp/backend/models/Campaign.js

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
            enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
            default: 'draft',
        },
        scheduledAt: {
            type: Date,
            default: null,
        },
        sentAt: { // Timestamp when the campaign was actually marked 'sent'
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// --- NEW: Add a pre-delete hook to cascade delete related events ---
campaignSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
    // 'this' refers to the document being deleted
    console.log(`[Mongoose Pre-Delete] Deleting associated OpenEvent and ClickEvent documents for Campaign: ${this._id}`);
    
    // Import your event models here if not already imported globally
    const OpenEvent = mongoose.model('OpenEvent'); // Get the model instance
    const ClickEvent = mongoose.model('ClickEvent'); // Get the model instance

    await OpenEvent.deleteMany({ campaign: this._id });
    await ClickEvent.deleteMany({ campaign: this._id });

    console.log(`[Mongoose Pre-Delete] Associated events deleted for Campaign: ${this._id}`);
    next(); // Continue with the campaign deletion
});
// --- END NEW ---

module.exports = mongoose.model('Campaign', campaignSchema);
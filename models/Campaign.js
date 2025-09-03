// emailxp/backend/models/Campaign.js

const mongoose = require('mongoose');

const campaignSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        group: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
            ref: 'Group',
        },
        // Optional: support multiple groups (MailerLite-style audience selection)
        groups: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Group',
            }
        ],
        // New: allow selecting predefined segments
        segments: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Segment',
            }
        ],
        // New: allow selecting individual subscribers directly
        individualSubscribers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subscriber',
            }
        ],
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
        // Store sender identity if customized per campaign
        fromEmail: {
            type: String,
            trim: true,
            default: null,
        },
        fromName: {
            type: String,
            trim: true,
            default: null,
        },
        htmlContent: {
            type: String,
            default: '', // Optional when using a structured Template
        },
        plainTextContent: { // This field is correctly added
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
        // Scheduling options
        scheduleType: {
            type: String,
            enum: ['fixed', 'subscriber_local'],
            default: 'fixed',
        },
        scheduleTimezone: {
            type: String,
            default: null,
        },
        // For subscriber-local scheduling, create per-timezone dispatches
        scheduledDispatches: [
            {
                timezone: { type: String, required: true },
                scheduledAtUtc: { type: Date, required: true },
                sent: { type: Boolean, default: false },
                sentAt: { type: Date, default: null }
            }
        ],
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
        
        // Email queue information
        totalEmails: { type: Number, default: 0 },
        emailsQueued: { type: Number, default: 0 },
        emailsProcessed: { type: Number, default: 0 },
        
        // Job tracking for Bull queue
        jobId: String,
        
        // Enhanced timing
        startedAt: Date,
        completedAt: Date,
        
        // Error tracking
        error: String,
        
        // Enhanced stats (keeping existing fields for compatibility)
        stats: {
            sent: { type: Number, default: 0 },
            delivered: { type: Number, default: 0 },
            opened: { type: Number, default: 0 },
            clicked: { type: Number, default: 0 },
            bounced: { type: Number, default: 0 },
            complained: { type: Number, default: 0 },
            unsubscribed: { type: Number, default: 0 },
            failed: { type: Number, default: 0 }
        },
        // --- End of tracking fields ---
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Campaign', campaignSchema);

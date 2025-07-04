const mongoose = require('mongoose');

const subscriberSchema = mongoose.Schema(
    {
        list: {
            type: mongoose.Schema.Types.ObjectId, // Links to the List model
            required: true,
            ref: 'List', // Reference to the List model
        },
        email: {
            type: String,
            required: [true, 'Please add a subscriber email'],
            unique: false, // Emails can be on multiple lists, so not globally unique
            match: [
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                'Please enter a valid email address',
            ],
        },
        // --- UPDATED FIELDS: Replaced 'name' with 'firstName' and 'lastName' ---
        firstName: {
            type: String,
            default: '', // First name can be optional
        },
        lastName: {
            type: String,
            default: '', // Last name can be optional
        },
        // --- END UPDATED FIELDS ---
        status: {
            type: String,
            enum: ['subscribed', 'unsubscribed', 'bounced', 'complaint'], // Enum for possible statuses
            default: 'subscribed', // New subscribers are 'subscribed' by default
        },
    },
    {
        timestamps: true,
    }
);

// Add a compound unique index to prevent duplicate emails within the *same* list
subscriberSchema.index({ email: 1, list: 1 }, { unique: true });

module.exports = mongoose.model('Subscriber', subscriberSchema);
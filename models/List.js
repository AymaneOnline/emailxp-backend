// emailxp/backend/models/List.js
const mongoose = require('mongoose');

const listSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        name: {
            type: String,
            required: [true, 'Please add a list name'],
            // Removed 'unique: true' from here, as it's now handled by the compound index below
        },
        description: {
            type: String,
            default: '', 
        },
        subscribers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subscriber',
            },
        ],
    },
    {
        timestamps: true,
    }
);

// ---
// Add this compound unique index
// This ensures that the combination of 'name' and 'user' is unique.
// So, each user can have lists with the same names, but a single user
// cannot have two lists with the same name.
listSchema.index({ name: 1, user: 1 }, { unique: true });
// ---

module.exports = mongoose.model('List', listSchema);
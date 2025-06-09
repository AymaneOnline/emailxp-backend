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

module.exports = mongoose.model('List', listSchema);
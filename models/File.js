// emailxp/backend/models/File.js

const mongoose = require('mongoose');

const fileSchema = mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User', // References the User model
        },
        publicId: {
            type: String,
            required: true,
            unique: true, // Each file should have a unique public_id on Cloudinary
        },
        url: {
            type: String,
            required: true,
        },
        fileName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: { // Size in bytes
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt timestamps
    }
);

module.exports = mongoose.model('File', fileSchema);

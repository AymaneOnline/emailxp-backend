// emailxp/backend/models/Template.js

const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Template name is required'],
        unique: true, // Template names should be unique for easy identification
        trim: true
    },
    subject: {
        type: String,
        required: [true, 'Template subject is required']
    },
    htmlContent: {
        type: String,
        required: [true, 'HTML content is required for the template']
    },
    plainTextContent: {
        type: String,
        // Plain text content is often optional if derived from HTML,
        // but good to have a dedicated field for robustness
        required: false
    },
    // If you plan for multiple users, you might want to associate templates with users
    // owner: {
    //     type: mongoose.Schema.ObjectId,
    //     ref: 'User', // Assuming you have a User model
    //     required: true
    // },
    // You could also add fields like:
    // category: {
    //     type: String,
    //     enum: ['Marketing', 'Transactional', 'Newsletter', 'Welcome'],
    //     default: 'Marketing'
    // },
    // isDefault: {
    //     type: Boolean,
    //     default: false
    // }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps automatically
});

module.exports = mongoose.model('Template', TemplateSchema);
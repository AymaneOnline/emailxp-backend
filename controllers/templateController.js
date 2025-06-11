// emailxp/backend/controllers/templateController.js

const Template = require('../models/Template');
const logger = require('../utils/logger');
const Sentry = require('@sentry/node');
const asyncHandler = require('express-async-handler'); // For simplifying async error handling

/**
 * @desc Create a new email template
 * @route POST /api/templates
 * @access Private (e.g., admin/authenticated user)
 */
const createTemplate = asyncHandler(async (req, res) => {
    const { name, subject, htmlContent, plainTextContent } = req.body;

    // Basic validation
    if (!name || !subject || !htmlContent) {
        res.status(400);
        throw new Error('Please include all required fields: name, subject, htmlContent');
    }

    // Check if template name already exists
    const templateExists = await Template.findOne({ name });
    if (templateExists) {
        res.status(400);
        throw new Error('A template with this name already exists');
    }

    try {
        const template = await Template.create({
            name,
            subject,
            htmlContent,
            plainTextContent
            // If you uncommented 'owner' in the model, you'd add:
            // owner: req.user.id // Assuming req.user is set by your authentication middleware
        });

        logger.info(`Template '${template.name}' created successfully.`);
        res.status(201).json(template);

    } catch (error) {
        logger.error(`Error creating template: ${error.message}`, error);
        Sentry.captureException(error);
        // The asyncHandler will catch and pass this error to your error handling middleware
        throw error;
    }
});

/**
 * @desc Get all email templates
 * @route GET /api/templates
 * @access Private (e.g., admin/authenticated user)
 */
const getTemplates = asyncHandler(async (req, res) => {
    try {
        // Find templates. If you have multi-user, you might filter by owner:
        // const templates = await Template.find({ owner: req.user.id });
        const templates = await Template.find({}); // Fetch all templates for now

        logger.info(`Fetched ${templates.length} templates.`);
        res.status(200).json(templates);

    } catch (error) {
        logger.error(`Error fetching templates: ${error.message}`, error);
        Sentry.captureException(error);
        throw error;
    }
});

// We'll add getTemplateById, updateTemplate, deleteTemplate later
module.exports = {
    createTemplate,
    getTemplates,
};
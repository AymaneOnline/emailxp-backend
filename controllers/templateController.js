// emailxp/backend/controllers/templateController.js

const Template = require('../models/Template');
const logger = require('../utils/logger');
const asyncHandler = require('express-async-handler');

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
        throw error;
    }
});

/**
 * @desc Get a single email template by ID
 * @route GET /api/templates/:id
 * @access Private (e.g., admin/authenticated user)
 */
const getTemplate = asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);

    if (!template) {
        res.status(404);
        throw new Error('Template not found');
    }

    logger.info(`Fetched template with ID: ${req.params.id}`);
    res.status(200).json(template);
});

/**
 * @desc Update an email template
 * @route PUT /api/templates/:id
 * @access Private (e.g., admin/authenticated user)
 */
const updateTemplate = asyncHandler(async (req, res) => {
    const { name, subject, htmlContent, plainTextContent } = req.body;

    const template = await Template.findById(req.params.id);

    if (!template) {
        res.status(404);
        throw new Error('Template not found');
    }

    // If a new name is provided, check for uniqueness (excluding the current template itself)
    if (name && name !== template.name) {
        const templateExists = await Template.findOne({ name });
        if (templateExists) {
            res.status(400);
            throw new Error('A template with this name already exists');
        }
    }

    // Update template fields
    template.name = name || template.name;
    template.subject = subject || template.subject;
    template.htmlContent = htmlContent || template.htmlContent;
    template.plainTextContent = plainTextContent !== undefined ? plainTextContent : template.plainTextContent; // Allow explicit empty string/null

    // If you uncommented 'owner' in the model and use authentication, you might add checks here
    // if (template.owner.toString() !== req.user.id) {
    //     res.status(401);
    //     throw new Error('Not authorized to update this template');
    // }

    const updatedTemplate = await template.save(); // Using .save() allows for pre/post hooks if you add them

    logger.info(`Template with ID: ${req.params.id} updated successfully.`);
    res.status(200).json(updatedTemplate);
});

/**
 * @desc Delete an email template
 * @route DELETE /api/templates/:id
 * @access Private (e.g., admin/authenticated user)
 */
const deleteTemplate = asyncHandler(async (req, res) => {
    const template = await Template.findById(req.params.id);

    if (!template) {
        res.status(404);
        throw new Error('Template not found');
    }

    // If you uncommented 'owner' in the model and use authentication, you might add checks here
    // if (template.owner.toString() !== req.user.id) {
    //     res.status(401);
    //     throw new Error('Not authorized to delete this template');
    // }

    await template.deleteOne(); // Mongoose 6+ prefers deleteOne() or deleteMany()

    logger.info(`Template with ID: ${req.params.id} deleted successfully.`);
    res.status(200).json({ message: 'Template removed successfully' });
});

module.exports = {
    createTemplate,
    getTemplates,
    getTemplate, // Export new functions
    updateTemplate,
    deleteTemplate,
};
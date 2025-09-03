const { body } = require('express-validator');

const validateSubscriber = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    
    body('firstName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('First name must be less than 50 characters'),
    
    body('lastName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Last name must be less than 50 characters'),
    
    body('status')
        .optional()
        .isIn(['subscribed', 'unsubscribed', 'bounced', 'complained'])
        .withMessage('Status must be one of: subscribed, unsubscribed, bounced, complained'),
    
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    
    body('tags.*')
        .optional()
        .trim()
        .isLength({ max: 30 })
        .withMessage('Each tag must be less than 30 characters'),
    
    body('groupIds')
        .optional()
        .isArray()
        .withMessage('List IDs must be an array'),
    
    body('groupIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each group ID must be valid'),
    
    // For backward compatibility
    body('groupId')
        .optional()
        .isMongoId()
        .withMessage('Group ID must be valid')
];

const validateSubscriberUpdate = [
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    
    body('firstName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('First name must be less than 50 characters'),
    
    body('lastName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Last name must be less than 50 characters'),
    
    body('status')
        .optional()
        .isIn(['subscribed', 'unsubscribed', 'bounced', 'complained'])
        .withMessage('Status must be one of: subscribed, unsubscribed, bounced, complained'),
    
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    
    body('tags.*')
        .optional()
        .trim()
        .isLength({ max: 30 })
        .withMessage('Each tag must be less than 30 characters')
];

const validateBulkImport = [
    body('subscribers')
        .isArray({ min: 1 })
        .withMessage('Subscribers array is required and must contain at least one subscriber'),
    
    body('subscribers.*.email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Each subscriber must have a valid email address'),
    
    body('subscribers.*.firstName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('First name must be less than 50 characters'),
    
    body('subscribers.*.lastName')
        .optional()
        .trim()
        .isLength({ max: 50 })
        .withMessage('Last name must be less than 50 characters'),

    body('subscribers.*.tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    
    body('subscribers.*.tags.*')
        .optional()
        .trim()
        .isLength({ max: 30 })
        .withMessage('Each tag must be less than 30 characters'),
    
    body('subscribers.*.groupIds')
        .optional()
        .isArray()
        .withMessage('Group IDs must be an array'),
    
    body('subscribers.*.groupIds.*')
        .optional()
        .isMongoId()
        .withMessage('Each group ID must be valid'),
    
    body('overwriteExisting')
        .optional()
        .isBoolean()
        .withMessage('overwriteExisting must be a boolean')
];

module.exports = {
    validateSubscriber,
    validateSubscriberUpdate,
    validateBulkImport
};

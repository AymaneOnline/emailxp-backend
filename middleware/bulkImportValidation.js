const { body } = require('express-validator');

const validateBulkImport = [
    body('subscribers')
        .isArray()
        .withMessage('Subscribers must be an array')
        .notEmpty()
        .withMessage('Subscribers array cannot be empty'),
    
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
    
    body('subscribers.*.status')
        .optional()
        .isIn(['subscribed', 'unsubscribed', 'bounced', 'complained'])
        .withMessage('Status must be one of: subscribed, unsubscribed, bounced, complained'),
    
    body('groupIds')
        .optional()
        .isArray()
        .withMessage('Group IDs must be an array'),
    
    body('groupIds.*')
        .optional()
        .isMongoId()
        .withMessage('Invalid group ID format'),
    
    body('tagIds')
        .optional()
        .isArray()
        .withMessage('Tag IDs must be an array'),
    
    body('tagIds.*')
        .optional()
        .isMongoId()
        .withMessage('Invalid tag ID format'),
    
    body('overwriteExisting')
        .optional()
        .isBoolean()
        .withMessage('overwriteExisting must be a boolean')
];

module.exports = validateBulkImport;

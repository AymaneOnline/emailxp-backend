const express = require('express');
const router = express.Router();
const {
    getSubscriberActivity,
    segmentSubscribers,
    getSubscribers,
    getSubscribersByGroup,
    getSubscriber,
    createSubscriber,
    updateSubscriber,
    deleteSubscriber,
    bulkImportSubscribers,
    bulkDeleteSubscribers,
    getSubscriberStats,
    addSubscriberToGroup,
    removeSubscriberFromGroup,
    confirmSubscriber,
    resendConfirmation,
    bulkUpdateSubscriberStatus,
    exportSelectedSubscribers,
    unsubscribeSubscriber,
    handleUnsubscribeLink
} = require('../controllers/subscriberController');
const { protect } = require('../middleware/authMiddleware');
const {
    validateSubscriber,
    validateSubscriberUpdate
} = require('../middleware/subscriberValidation');
const validateBulkImport = require('../middleware/bulkImportValidation');

// Public unsubscribe endpoint (for email links)
router.get('/unsubscribe/:subscriberId/:campaignId?', handleUnsubscribeLink);

// Public confirmation endpoint
router.get('/confirm/:token', confirmSubscriber);

// All remaining routes are protected
router.use(protect);

// Activity history endpoint
router.get('/:id/activity', getSubscriberActivity);

// Segmentation endpoint
router.post('/segment', segmentSubscribers);

// tag endpoints removed

// Test route
router.get('/test', (req, res) => {
    res.json({ message: 'Subscriber API is working', user: req.user.id });
});

// Main subscriber routes
router.route('/')
    .get(getSubscribers)
    .post(validateSubscriber, createSubscriber);

// Global subscriber routes
router.get('/stats', getSubscriberStats);

router.route('/:id')
    .get(getSubscriber)
    .put(validateSubscriberUpdate, updateSubscriber)
    .delete(deleteSubscriber);

// Bulk operations
router.post('/import', validateBulkImport, bulkImportSubscribers);
router.delete('/bulk', bulkDeleteSubscribers);
router.post('/bulk/status', bulkUpdateSubscriberStatus);
router.post('/bulk/export', exportSelectedSubscribers);

// Group-specific subscriber routes (for backward compatibility)
router.get('/group/:groupId', getSubscribersByGroup);

// Subscriber-group relationship management
router.post('/:id/groups/:groupId', addSubscriberToGroup);
router.delete('/:id/groups/:groupId', removeSubscriberFromGroup);

// Resend confirmation
router.post('/:id/resend-confirmation', resendConfirmation);

// Unsubscribe endpoint (protected API route)
router.post('/unsubscribe', unsubscribeSubscriber);

module.exports = router;

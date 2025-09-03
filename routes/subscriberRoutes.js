const express = require('express');
const router = express.Router();
const {
    getSubscriberActivity,
    segmentSubscribers,
    addTagsToSubscriber,
    removeTagsFromSubscriber,
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
    removeSubscriberFromGroup
} = require('../controllers/subscriberController');
const { protect } = require('../middleware/authMiddleware');
const {
    validateSubscriber,
    validateSubscriberUpdate
} = require('../middleware/subscriberValidation');
const validateBulkImport = require('../middleware/bulkImportValidation');

// All routes are protected
router.use(protect);

// Activity history endpoint
router.get('/:id/activity', getSubscriberActivity);

// Segmentation endpoint
router.post('/segment', segmentSubscribers);

// Tag management for subscribers
router.post('/:id/tags', addTagsToSubscriber);
router.delete('/:id/tags', removeTagsFromSubscriber);

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

// Group-specific subscriber routes (for backward compatibility)
router.get('/group/:groupId', getSubscribersByGroup);

// Subscriber-group relationship management
router.post('/:id/groups/:groupId', addSubscriberToGroup);
router.delete('/:id/groups/:groupId', removeSubscriberFromGroup);

module.exports = router;

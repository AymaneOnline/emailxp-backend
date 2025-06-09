const express = require('express');
// We need to merge params from parent routes (e.g., /api/lists/:listId/...)
// so that req.params.listId is available in subscriberController.
const router = express.Router({ mergeParams: true });

const {
    getSubscribers,
    addSubscriber,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
} = require('../controllers/subscriberController');

const { protect } = require('../middleware/authMiddleware'); // Assuming you have authMiddleware

// Define routes for subscribers within a specific list
// All these routes will implicitly have req.params.listId available due to mergeParams: true
router.route('/').get(protect, getSubscribers).post(protect, addSubscriber);
router.route('/:id').get(protect, getSubscriberById).put(protect, updateSubscriber).delete(protect, deleteSubscriber);

module.exports = router;
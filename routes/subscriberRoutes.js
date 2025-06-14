// emailxp/backend/routes/subscriberRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getSubscribersByList,
    addSubscriberToList,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
} = require('../controllers/subscriberController');

// Routes for subscribers within a specific list
router.route('/:listId/subscribers')
    .get(protect, getSubscribersByList) // This route will now accept query parameters for filtering
    .post(protect, addSubscriberToList);

router.route('/:listId/subscribers/:id')
    .get(protect, getSubscriberById)
    .put(protect, updateSubscriber)
    .delete(protect, deleteSubscriber);

module.exports = router;
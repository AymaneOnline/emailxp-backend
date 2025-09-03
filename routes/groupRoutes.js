// emailxp/backend/routes/groupRoutes.js

const express = require('express');
const router = express.Router();
const {
    getGroups,
    createGroup,
    getGroupById,
    updateGroup,
    deleteGroup,
} = require('../controllers/groupController');
const {
    // Use getSubscribersByGroup, as exported from subscriberController
    createSubscriber, // Import for creating a subscriber within a group
    getSubscribersByGroup,
    getSubscriber,
    updateSubscriber,
    removeSubscriberFromGroup, // Use this to remove from group, not delete entirely
} = require('../controllers/subscriberController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes in this file
router.use(protect);

// Group Management Routes
router.route('/')
    .get(getGroups) // Get all groups for authenticated user
    .post(createGroup); // Create a new group

// Use :groupId for consistency
router.route('/:groupId')
    .get(getGroupById) // Get a single group by ID
    .put(updateGroup) // Update a group by ID
    .delete(deleteGroup); // Delete a group by ID

// Subscriber Management Routes for a specific group
// These routes are nested under a specific group
router.route('/:groupId/subscribers')
    .get(getSubscribersByGroup) // Get all subscribers in a group
    .post(createSubscriber); // Create a new subscriber and add them to this group

// Use :subscriberId for clarity
router.route('/:groupId/subscribers/:subscriberId')
    .get(getSubscriber) // Get a single subscriber by ID within a group
    .put(updateSubscriber) // Update a subscriber's details
    .delete(removeSubscriberFromGroup); // Remove a subscriber from this specific group

module.exports = router;
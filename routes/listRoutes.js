// emailxp/backend/routes/listRoutes.js

const express = require('express');
const router = express.Router();
const {
    getLists,
    createList,
    getListById,
    updateList,
    deleteList,
} = require('../controllers/listController');
const {
    // CHANGE THIS LINE: Use getSubscribersByList, as exported from subscriberController
    getSubscribersByList, // <--- CHANGED FROM getSubscribers
    addSubscriberToList, // <--- CHANGED FROM addSubscriber (consistency with controller exports)
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
} = require('../controllers/subscriberController');
const { protect } = require('../middleware/authMiddleware');

// List Management Routes
router.route('/')
    .get(protect, getLists)      // Get all lists for authenticated user
    .post(protect, createList);  // Create a new list

router.route('/:id')
    .get(protect, getListById)       // Get a single list by ID
    .put(protect, updateList)        // Update a list
    .delete(protect, deleteList);    // Delete a list and its subscribers

// Subscriber Management Routes for a specific list
router.route('/:listId/subscribers')
    // CHANGE THIS LINE: Use the correct imported function name
    .get(protect, getSubscribersByList) // <--- CHANGED TO getSubscribersByList
    .post(protect, addSubscriberToList); // <--- CHANGED TO addSubscriberToList

router.route('/:listId/subscribers/:id')
    .get(protect, getSubscriberById)     // Get a single subscriber by ID within a list
    .put(protect, updateSubscriber)      // Update a subscriber in a list
    .delete(protect, deleteSubscriber);  // Remove a subscriber from a list

module.exports = router;
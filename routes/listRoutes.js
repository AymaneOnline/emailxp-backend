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
    getSubscribers,
    addSubscriber,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
} = require('../controllers/subscriberController');
const { protect } = require('../middleware/authMiddleware');

// List Management Routes
router.route('/')
    .get(protect, getLists)    // Get all lists for authenticated user
    .post(protect, createList); // Create a new list

router.route('/:id')
    .get(protect, getListById)    // Get a single list by ID
    .put(protect, updateList)     // Update a list
    .delete(protect, deleteList); // Delete a list and its subscribers

// Subscriber Management Routes for a specific list
router.route('/:listId/subscribers')
    .get(protect, getSubscribers)   // Get all subscribers for a list
    .post(protect, addSubscriber);  // Add a new subscriber to a list

router.route('/:listId/subscribers/:id')
    .get(protect, getSubscriberById)   // Get a single subscriber by ID within a list
    .put(protect, updateSubscriber)    // Update a subscriber in a list
    .delete(protect, deleteSubscriber); // Remove a subscriber from a list

module.exports = router;
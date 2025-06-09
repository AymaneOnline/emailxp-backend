const asyncHandler = require('express-async-handler');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber');

// @desc    Get all subscribers for a specific list
// @route   GET /api/lists/:listId/subscribers
// @access  Private
const getSubscribers = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.listId);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Make sure the authenticated user owns this list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view subscribers for this list');
    }

    // This fetches subscribers that *belong* to the list
    const subscribers = await Subscriber.find({ list: req.params.listId });
    res.status(200).json(subscribers);
});

// @desc    Add a new subscriber to a list
// @route   POST /api/lists/:listId/subscribers
// @access  Private
const addSubscriber = asyncHandler(async (req, res) => {
    const { email, name, status } = req.body;
    const listId = req.params.listId;

    if (!email) {
        res.status(400);
        throw new Error('Please add a subscriber email');
    }

    const list = await List.findById(listId);
    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Ensure the authenticated user owns the list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to add subscribers to this list');
    }

    // Check if subscriber already exists in this specific list
    const subscriberExists = await Subscriber.findOne({ email, list: listId });
    if (subscriberExists) {
        res.status(400);
        throw new Error('Subscriber with this email already exists in this list');
    }

    const subscriber = await Subscriber.create({
        list: listId,
        email,
        name,
        status: status || 'subscribed',
        user: req.user.id, // Good practice: link subscriber to user too
    });

    // --- CRUCIAL ADDITION START ---
    // Add the new subscriber's ID to the list's subscribers array
    list.subscribers.push(subscriber._id);
    await list.save(); // Save the updated list document
    // --- CRUCIAL ADDITION END ---

    res.status(201).json(subscriber);
});

// @desc    Get a single subscriber by ID within a list
// @route   GET /api/lists/:listId/subscribers/:id
// @access  Private
const getSubscriberById = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.listId);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }
    // Ensure the authenticated user owns the list before checking subscriber
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view this subscriber');
    }

    const subscriber = await Subscriber.findById(req.params.id);

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Also ensure the subscriber belongs to the specified list
    if (subscriber.list.toString() !== req.params.listId) {
        res.status(400);
        throw new Error('Subscriber does not belong to this list');
    }

    res.status(200).json(subscriber);
});


// @desc    Update a subscriber in a list
// @route   PUT /api/lists/:listId/subscribers/:id
// @access  Private
const updateSubscriber = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.listId);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }
    // Ensure the authenticated user owns the list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update subscriber for this list');
    }

    const subscriber = await Subscriber.findById(req.params.id);

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Ensure the subscriber belongs to the specified list
    if (subscriber.list.toString() !== req.params.listId) {
        res.status(400);
        throw new Error('Subscriber does not belong to this list');
    }

    const updatedSubscriber = await Subscriber.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
    });

    res.status(200).json(updatedSubscriber);
});

// @desc    Remove a subscriber from a list
// @route   DELETE /api/lists/:listId/subscribers/:id
// @access  Private
const deleteSubscriber = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.listId);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }
    // Ensure the authenticated user owns the list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete subscriber from this list');
    }

    const subscriber = await Subscriber.findById(req.params.id);

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Ensure the subscriber belongs to the specified list
    if (subscriber.list.toString() !== req.params.listId) {
        res.status(400);
        throw new Error('Subscriber does not belong to this list');
    }

    await subscriber.deleteOne(); // Use deleteOne() for Mongoose 6+

    // --- CRUCIAL ADDITION START ---
    // Remove the subscriber's ID from the list's subscribers array
    list.subscribers = list.subscribers.filter(
        (subId) => subId.toString() !== req.params.id // Filter out the deleted subscriber's ID
    );
    await list.save(); // Save the updated list document
    // --- CRUCIAL ADDITION END ---

    res.status(200).json({ id: req.params.id, message: 'Subscriber removed' });
});

module.exports = {
    getSubscribers,
    addSubscriber,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
};
// emailxp/backend/controllers/subscriberController.js

const asyncHandler = require('express-async-handler');
const Subscriber = require('../models/Subscriber');
const List = require('../models/List');
const mongoose = require('mongoose');

// @desc    Get all subscribers for a specific list
// @route   GET /api/lists/:listId/subscribers
// @access  Private
const getSubscribersByList = asyncHandler(async (req, res) => {
    const listId = req.params.listId;
    const { status, search } = req.query; // Extract query parameters

    if (!mongoose.Types.ObjectId.isValid(listId)) {
        return res.status(400).json({ message: 'Invalid List ID format.' });
    }

    const list = await List.findById(listId);
    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Ensure user owns the list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to access this list');
    }

    // Build the query object for Mongoose
    const query = { list: listId };

    // Add status filter if provided
    if (status) {
        query.status = status;
    }

    // Add search filter if provided
    if (search) {
        // Use a case-insensitive regex for searching across email, firstName, lastName
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
            { email: searchRegex },
            { firstName: searchRegex },
            { lastName: searchRegex }
        ];
    }

    const subscribers = await Subscriber.find(query); // Apply the constructed query
    res.status(200).json(subscribers);
});

// @desc    Add a new subscriber to a list
// @route   POST /api/lists/:listId/subscribers
// @access  Private
const addSubscriberToList = asyncHandler(async (req, res) => {
    const listId = req.params.listId;
    const { email, firstName, lastName, status } = req.body; // status can be 'subscribed', 'unsubscribed', 'bounced' etc.

    console.log(`[addSubscriberToList] === Starting Subscriber Addition for List: ${listId} ===`);
    console.log(`[addSubscriberToList] Incoming data: Email=${email}, List ID=${listId}`);

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email for the subscriber.');
    }

    const list = await List.findById(listId);
    if (!list) {
        console.error(`[addSubscriberToList] List not found for ID: ${listId}`);
        res.status(404);
        throw new Error('List not found');
    }
    console.log(`[addSubscriberToList] Found List: ${list.name} (ID: ${list._id})`);


    if (list.user.toString() !== req.user.id) {
        console.error(`[addSubscriberToList] Authorization failed: User ${req.user.id} does not own list ${listId}`);
        res.status(401);
        throw new Error('Not authorized to add subscribers to this list');
    }

    // Check if subscriber already exists in this list
    const existingSubscriber = await Subscriber.findOne({ list: listId, email });
    if (existingSubscriber) {
        console.warn(`[addSubscriberToList] Subscriber with email ${email} already exists in list ${listId}.`);
        res.status(400);
        throw new Error('Subscriber with this email already exists in this list.');
    }

    const subscriber = await Subscriber.create({
        list: listId,
        email,
        firstName,
        lastName,
        status: status || 'subscribed',
    });
    console.log(`[addSubscriberToList] New Subscriber created successfully: ID=${subscriber._id}, Email=${subscriber.email}`);


    // --- CRUCIAL DEBUGGING LOGS FOR LIST UPDATE ---
    console.log(`[addSubscriberToList] List.subscribers array BEFORE push:`, list.subscribers.map(id => id.toString())); // Log IDs as strings
    
    // Push the new subscriber's ID into the list's subscribers array
    list.subscribers.push(subscriber._id);

    console.log(`[addSubscriberToList] List.subscribers array AFTER push (in memory):`, list.subscribers.map(id => id.toString())); // Log IDs as strings

    try {
        await list.save();
        console.log(`[addSubscriberToList] List document updated successfully in DB with new subscriber reference.`);
    } catch (saveError) {
        console.error(`[addSubscriberToList] FATAL ERROR saving list document for ID ${list._id}:`, saveError);
        // Provide more detailed error to client for debugging
        res.status(500);
        throw new Error(`Failed to update list with new subscriber reference: ${saveError.message}`);
    }
    // --- END CRUCIAL DEBUGGING LOGS ---

    console.log(`[addSubscriberToList] === Finished Subscriber Addition ===`);
    res.status(201).json(subscriber);
});

// @desc    Get a single subscriber by ID
// @route   GET /api/lists/:listId/subscribers/:id
// @access  Private
const getSubscriberById = asyncHandler(async (req, res) => {
    const { listId, id } = req.params;

    console.log(`[Backend] Attempting to fetch subscriber with ID: ${id} for list ID: ${listId}`);

    if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(id)) {
        console.log('[Backend] Invalid List ID or Subscriber ID format.');
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    const subscriber = await Subscriber.findById(id);

    if (!subscriber) {
        console.log(`[Backend] Subscriber with ID ${id} not found.`);
        res.status(404); // Set status, but still need to throw/return to stop execution
        throw new Error('Subscriber not found'); // This should be caught by asyncHandler
    }

    // Log the found subscriber (check its content)
    console.log('[Backend] Found subscriber:', subscriber);
    console.log('[Backend] Subscriber list ID:', subscriber.list.toString());


    // Ensure subscriber belongs to the specified list and the user owns the list
    const list = await List.findById(listId);

    if (!list) {
        console.log(`[Backend] List with ID ${listId} not found.`);
        res.status(404);
        throw new Error('List not found');
    }

    console.log('[Backend] Found list:', list);
    console.log('[Backend] List user ID:', list.user.toString());
    console.log('[Backend] Requesting user ID:', req.user.id);


    if (subscriber.list.toString() !== listId) {
        console.log('[Backend] Subscriber does not belong to the specified list.');
        res.status(401);
        throw new Error('Subscriber not found in specified list');
    }

    if (list.user.toString() !== req.user.id) {
        console.log('[Backend] Not authorized: User does not own the list.');
        res.status(401);
        throw new Error('Not authorized to view this subscriber');
    }

    console.log('[Backend] All authorization checks passed. Sending subscriber data.');
    res.status(200).json(subscriber); // This is the line that should send data
});

// @desc    Update a subscriber
// @route   PUT /api/lists/:listId/subscribers/:id
// @access  Private
const updateSubscriber = asyncHandler(async (req, res) => {
    const { listId, id } = req.params;
    const { email, firstName, lastName, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    const subscriber = await Subscriber.findById(id);

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Ensure subscriber belongs to the specified list and the user owns the list
    const list = await List.findById(listId);
    if (!list || subscriber.list.toString() !== listId || list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update this subscriber or subscriber not found in specified list');
    }

    // Prevent changing list
    if (req.body.list && req.body.list.toString() !== listId) {
        res.status(400);
        throw new Error('Cannot change a subscriber\'s list via this endpoint.');
    }

    // If email is being changed, check for uniqueness within the list
    if (email && email !== subscriber.email) {
        const existingSubscriber = await Subscriber.findOne({ list: listId, email });
        if (existingSubscriber && existingSubscriber._id.toString() !== id) {
            res.status(400);
            throw new Error('Another subscriber with this email already exists in this list.');
        }
    }

    // Prepare fields to update
    // Only update if the value is provided in the request body (and not undefined)
    if (email !== undefined) subscriber.email = email;
    if (firstName !== undefined) subscriber.firstName = firstName;
    if (lastName !== undefined) subscriber.lastName = lastName;
    if (status !== undefined) subscriber.status = status;

    const updatedSubscriber = await subscriber.save();

    res.status(200).json(updatedSubscriber);
});

// @desc    Delete a subscriber from a list
// @route   DELETE /api/lists/:listId/subscribers/:id
// @access  Private
const deleteSubscriber = asyncHandler(async (req, res) => {
    const { listId, id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(listId) || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid ID format.' });
    }

    const subscriber = await Subscriber.findById(id);

    if (!subscriber) {
        res.status(404);
        throw new Error('Subscriber not found');
    }

    // Ensure subscriber belongs to the specified list and the user owns the list
    const list = await List.findById(listId);
    if (!list || subscriber.list.toString() !== listId || list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete this subscriber or subscriber not found in specified list');
    }

    await subscriber.deleteOne();

    // Remove the subscriber's ID from the list's subscribers array
    list.subscribers = list.subscribers.filter(subId => subId.toString() !== subscriber._id.toString());
    // Also decrement the subscriberCount if you're using it (optional)
    // list.subscriberCount = Math.max(0, (list.subscriberCount || 0) - 1);
    await list.save(); // Save the updated list document

    res.status(200).json({ id: req.params.id, message: 'Subscriber deleted successfully' });
});


module.exports = {
    getSubscribersByList,
    addSubscriberToList,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
};
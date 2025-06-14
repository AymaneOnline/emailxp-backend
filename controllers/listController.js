const asyncHandler = require('express-async-handler');
const List = require('../models/List');
const Subscriber = require('../models/Subscriber'); // Also need Subscriber model for cascade delete

// @desc    Get all lists for the authenticated user
// @route   GET /api/lists
// @access  Private
const getLists = asyncHandler(async (req, res) => {
    // --- START MODIFICATION ---
    const lists = await List.find({ user: req.user.id })
                            .populate('subscribers'); // <-- ADD THIS LINE
    // --- END MODIFICATION ---
    res.status(200).json(lists);
});

// @desc    Create a new list
// @route   POST /api/lists
// @access  Private
const createList = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        res.status(400);
        throw new Error('Please add a list name');
    }

    // Check if a list with the same name already exists for this user
    const listExists = await List.findOne({ name, user: req.user.id });
    if (listExists) {
        res.status(400);
        throw new Error('A list with this name already exists for your account');
    }

    const list = await List.create({
        name,
        description,
        user: req.user.id, // Assign the list to the authenticated user
    });

    res.status(201).json(list);
});

// @desc    Get a single list by ID for the authenticated user
// @route   GET /api/lists/:id
// @access  Private
const getListById = asyncHandler(async (req, res) => {
    // --- OPTIONAL MODIFICATION: Also populate subscribers here if you ever fetch a single list by ID ---
    const list = await List.findById(req.params.id)
                            .populate('subscribers'); // <-- Consider adding this line here too
    // --- END OPTIONAL MODIFICATION ---

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Make sure the authenticated user owns this list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view this list');
    }

    res.status(200).json(list);
});

// @desc    Update a list
// @route   PUT /api/lists/:id
// @access  Private
const updateList = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.id);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Make sure the authenticated user owns this list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update this list');
    }

    const updatedList = await List.findByIdAndUpdate(req.params.id, req.body, {
        new: true, // Return the updated document
    });

    res.status(200).json(updatedList);
});

// @desc    Delete a list
// @route   DELETE /api/lists/:id
// @access  Private
const deleteList = asyncHandler(async (req, res) => {
    const list = await List.findById(req.params.id);

    if (!list) {
        res.status(404);
        throw new Error('List not found');
    }

    // Make sure the authenticated user owns this list
    if (list.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete this list');
    }

    // Delete all subscribers associated with this list first
    await Subscriber.deleteMany({ list: req.params.id });

    await list.deleteOne(); // Use deleteOne() for Mongoose 6+

    res.status(200).json({ id: req.params.id, message: 'List and its subscribers deleted successfully' });
});

module.exports = {
    getLists,
    createList,
    getListById,
    updateList,
    deleteList,
};
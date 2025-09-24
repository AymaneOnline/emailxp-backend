const asyncHandler = require('express-async-handler');
const Group = require('../models/Group');
const Subscriber = require('../models/Subscriber'); // Also need Subscriber model for cascade delete

// @desc    Get all groups for the authenticated user
// @route   GET /api/groups
// @access  Private
const getGroups = asyncHandler(async (req, res) => {
    const groups = await Group.find({ user: req.user.id })
                            .populate('subscribers');
    res.status(200).json(groups);
});

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private
const createGroup = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        res.status(400);
        throw new Error('Please add a group name');
    }

    // Check if a group with the same name already exists for this user
    const groupExists = await Group.findOne({ name, user: req.user.id });
    if (groupExists) {
        res.status(400);
        throw new Error('A group with this name already exists for your account');
    }

    const group = await Group.create({
        name,
        description,
        user: req.user.id, // Assign the group to the authenticated user
    });

    res.status(201).json(group);
});

// @desc    Get a single group by ID for the authenticated user
// @route   GET /api/groups/:id
// @access  Private
const getGroupById = asyncHandler(async (req, res) => {
    const id = req.params.groupId || req.params.id;
    const group = await Group.findById(id).populate('subscribers');

    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    // Make sure the authenticated user owns this group
    if (group.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to view this group');
    }

    res.status(200).json(group);
});

// @desc    Update a group
// @route   PUT /api/groups/:id
// @access  Private
const updateGroup = asyncHandler(async (req, res) => {
    const id = req.params.groupId || req.params.id;
    const group = await Group.findById(id);

    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    // Make sure the authenticated user owns this group
    if (group.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to update this group');
    }

    const updatedGroup = await Group.findByIdAndUpdate(id, req.body, {
        new: true, // Return the updated document
    });

    res.status(200).json(updatedGroup);
});

// @desc    Delete a group
// @route   DELETE /api/groups/:id
// @access  Private
const deleteGroup = asyncHandler(async (req, res) => {
    const id = req.params.groupId || req.params.id;
    const group = await Group.findById(id);

    if (!group) {
        res.status(404);
        throw new Error('Group not found');
    }

    // Make sure the authenticated user owns this group
    if (group.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('Not authorized to delete this group');
    }

    // Remove the group reference from subscribers instead of deleting subscribers
    await Subscriber.updateMany({ groups: id }, { $pull: { groups: id } });

    await group.deleteOne(); // Use deleteOne() for Mongoose 6+

    res.status(200).json({ id, message: 'Group deleted and removed from subscribers' });
});

module.exports = {
    getGroups,
    createGroup,
    getGroupById,
    updateGroup,
    deleteGroup,
};
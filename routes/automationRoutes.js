// emailxp/backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/authMiddleware');

// Import models
const Automation = require('../models/Automation');

// @desc    Get all automations
// @route   GET /api/automations
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { status, type } = req.query;
  
  // Build query
  const query = { user: req.user.id };
  
  if (status && status !== 'all') {
    query.status = status;
  }
  
  if (type && type !== 'all') {
    query.type = type;
  }
  
  const automations = await Automation.find(query)
    .populate('campaign')
    .populate('triggerCampaign')
    .sort({ createdAt: -1 });
  
  res.json({ success: true, automations });
}));

// @desc    Get single automation
// @route   GET /api/automations/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id)
    .populate('campaign')
    .populate('triggerCampaign');
  
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  res.json({ success: true, automation });
}));

// @desc    Create automation
// @route   POST /api/automations
// @access  Private
router.post('/', protect, asyncHandler(async (req, res) => {
  const { name, description, nodes, edges, isActive } = req.body;
  
  const automation = new Automation({
    user: req.user.id,
    name,
    description,
    nodes,
    edges,
    isActive: isActive || false
  });
  
  const createdAutomation = await automation.save();
  
  res.status(201).json({ success: true, automation: createdAutomation });
}));

// @desc    Update automation
// @route   PUT /api/automations/:id
// @access  Private
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const { name, description, nodes, edges, isActive } = req.body;
  
  const automation = await Automation.findById(req.params.id);
  
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  automation.name = name || automation.name;
  automation.description = description || automation.description;
  automation.nodes = nodes || automation.nodes;
  automation.edges = edges || automation.edges;
  automation.isActive = isActive !== undefined ? isActive : automation.isActive;
  
  const updatedAutomation = await automation.save();
  
  res.json({ success: true, automation: updatedAutomation });
}));

// @desc    Delete automation
// @route   DELETE /api/automations/:id
// @access  Private
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  await automation.remove();
  
  res.json({ success: true, message: 'Automation removed' });
}));

// @desc    Start automation
// @route   POST /api/automations/:id/start
// @access  Private
router.post('/:id/start', protect, asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  automation.isActive = true;
  automation.status = 'running';
  const updatedAutomation = await automation.save();
  
  res.json({ success: true, automation: updatedAutomation });
}));

// @desc    Pause automation
// @route   POST /api/automations/:id/pause
// @access  Private
router.post('/:id/pause', protect, asyncHandler(async (req, res) => {
  const automation = await Automation.findById(req.params.id);
  
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  automation.isActive = false;
  automation.status = 'paused';
  const updatedAutomation = await automation.save();
  
  res.json({ success: true, automation: updatedAutomation });
}));

// @desc    Duplicate automation
// @route   POST /api/automations/:id/duplicate
// @access  Private
router.post('/:id/duplicate', protect, asyncHandler(async (req, res) => {
  const originalAutomation = await Automation.findById(req.params.id);
  
  if (!originalAutomation) {
    res.status(404);
    throw new Error('Automation not found');
  }
  
  // Check if user owns the automation
  if (originalAutomation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  // Create a copy with "Copy" appended to the name
  const duplicatedAutomation = new Automation({
    user: req.user.id,
    name: `${originalAutomation.name} (Copy)`,
    description: originalAutomation.description,
    nodes: originalAutomation.nodes,
    edges: originalAutomation.edges,
    isActive: false,
    status: 'draft'
  });
  
  const createdAutomation = await duplicatedAutomation.save();
  
  res.status(201).json({ success: true, automation: createdAutomation });
}));

module.exports = router;
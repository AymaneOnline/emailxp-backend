// emailxp/backend/routes/automationRoutes.js

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { protect, admin } = require('../middleware/authMiddleware');
const logger = require('../utils/logger');

// Import models
const Automation = require('../models/Automation');
const { executeAutomation } = require('../services/automationExecutor');

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
  // Add initial version entry
  automation.versions = [
    {
      version: 1,
      user: req.user.id,
      changes: { name, description, nodes, edges, isActive: isActive || false }
    }
  ];
  
  const createdAutomation = await automation.save();
  
  // Log created automation details: id, active status, and referenced template(s)
  try {
    const nodes = createdAutomation.nodes || [];
    const nodeTemplates = nodes.map(n => n?.data?.config?.templateId || n?.config?.templateId || n?.data?.templateId || n?.templateId || null).filter(Boolean);
    const triggers = nodes.filter(n => (n?.type === 'trigger' || n?.data?.type === 'trigger' || n?.data?.event)).map(t => ({ id: t.id || t._id || null, event: t?.data?.event || t?.data?.type || null, conditions: t?.data?.conditions || t?.conditions || [] }));
    const actions = nodes.filter(n => {
      const actionType = n?.data?.type || n?.type || n?.nodeType || null;
      return actionType && (actionType === 'send_template' || actionType === 'send-email' || actionType === 'send_email' || actionType === 'action');
    }).map(a => ({ id: a.id || a._id || null, type: a?.data?.type || a?.type || a?.nodeType || null, templateId: a?.data?.config?.templateId || a?.data?.templateId || a?.config?.templateId || null }));
    logger.info('[AutomationRoutes] automation created', { automationId: createdAutomation._id.toString(), isActive: !!createdAutomation.isActive, templates: nodeTemplates, triggers, actions });
  } catch (e) {
    logger.warn('[AutomationRoutes] failed to log automation details', { error: e?.message || e });
  }

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
  // Append version entry
  const nextVersion = (automation.versions?.length || 0) + 1;
  automation.versions = automation.versions || [];
  automation.versions.push({
    version: nextVersion,
    user: req.user.id,
    changes: { name: automation.name, description: automation.description, nodes: automation.nodes, edges: automation.edges, isActive: automation.isActive }
  });

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
  
  // Use model-level delete to avoid relying on document.remove (may be unavailable in some Mongoose versions)
  await Automation.findByIdAndDelete(req.params.id);
  
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
  // initial version for duplicated automation
  duplicatedAutomation.versions = [
    {
      version: 1,
      user: req.user.id,
      changes: { name: duplicatedAutomation.name, description: duplicatedAutomation.description, nodes: duplicatedAutomation.nodes, edges: duplicatedAutomation.edges, isActive: duplicatedAutomation.isActive }
    }
  ];
  
  const createdAutomation = await duplicatedAutomation.save();
  
  try {
    const nodesD = createdAutomation.nodes || [];
    const nodeTemplatesD = nodesD.map(n => n?.data?.config?.templateId || n?.config?.templateId || n?.data?.templateId || n?.templateId || null).filter(Boolean);
    const triggersD = nodesD.filter(n => (n?.type === 'trigger' || n?.data?.type === 'trigger' || n?.data?.event)).map(t => ({ id: t.id || t._id || null, event: t?.data?.event || t?.data?.type || null, conditions: t?.data?.conditions || t?.conditions || [] }));
    const actionsD = nodesD.filter(n => {
      const actionType = n?.data?.type || n?.type || n?.nodeType || null;
      return actionType && (actionType === 'send_template' || actionType === 'send-email' || actionType === 'send_email' || actionType === 'action');
    }).map(a => ({ id: a.id || a._id || null, type: a?.data?.type || a?.type || a?.nodeType || null, templateId: a?.data?.config?.templateId || a?.data?.templateId || a?.config?.templateId || null }));
    logger.info('[AutomationRoutes] automation duplicated', { automationId: createdAutomation._id.toString(), isActive: !!createdAutomation.isActive, templates: nodeTemplatesD, triggers: triggersD, actions: actionsD });
  } catch (e) {
    logger.warn('[AutomationRoutes] failed to log duplicated automation details', { error: e?.message || e });
  }

  res.status(201).json({ success: true, automation: createdAutomation });
}));

// @desc    Trigger automation (for testing or runtime triggers)
// @route   POST /api/automations/:id/trigger
// @access  Private
router.post('/:id/trigger', protect, asyncHandler(async (req, res) => {
  const { subscriberId, event } = req.body;

  const automation = await Automation.findById(req.params.id);
  if (!automation) {
    res.status(404);
    throw new Error('Automation not found');
  }

  // Check ownership
  if (automation.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }

  // Execute automation actions in background (don't await long-running jobs)
  executeAutomation(automation, { userId: req.user.id, subscriberId, event })
    .then(() => logger.log('[AutomationRoutes] automation executed'))
    .catch(err => logger.error('[AutomationRoutes] automation execution failed', err));

  res.json({ success: true, message: 'Automation triggered' });
}));

module.exports = router;

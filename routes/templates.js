// emailxp/backend/routes/templates.js

const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const { protect } = require('../middleware/authMiddleware');

// Protect all template routes
router.use(protect);

// Get all templates for the authenticated user
router.get('/', async (req, res) => {
  try {
    const { category, type, tags, search, limit = 50, skip = 0 } = req.query;
    
    // Build query
    const query = {
      $or: [
        { user: req.user.id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    };
    
    if (category) query.category = category;
    if (type) query.type = type;
    if (tags) query.tags = { $in: tags.split(',') };
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } }
        ]
      });
    }
    
    const templates = await Template.find(query)
      .sort({ 'stats.timesUsed': -1, createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .select('-htmlContent -plainTextContent'); // Exclude large content fields
    
    const total = await Template.countDocuments(query);
    
    res.json({
      templates,
      total,
      hasMore: (parseInt(skip) + templates.length) < total
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get popular templates
router.get('/popular', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const templates = await Template.getPopular(parseInt(limit));
    res.json(templates);
  } catch (error) {
    console.error('Error fetching popular templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get templates by category
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const templates = await Template.getByCategory(category, req.user.id);
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates by category:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get a specific template by ID
router.get('/:id', async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user.id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new template
router.post('/', async (req, res) => {
  try {
    const { name, description, category, structure, tags } = req.body;
    
    // Validation
    if (!name || !structure) {
      return res.status(400).json({ message: 'Name and structure are required' });
    }
    
    const template = new Template({
      user: req.user.id,
      name,
      description,
      category: category || 'custom',
      structure,
      tags: tags || [],
      type: 'user'
    });
    
    await template.save();
    
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a template
router.put('/:id', async (req, res) => {
  try {
    const { name, description, category, structure, tags } = req.body;
    
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user.id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    // Update fields
    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    if (category !== undefined) template.category = category;
    if (structure !== undefined) template.structure = structure;
    if (tags !== undefined) template.tags = tags;
    
    // Increment version
    template.version += 1;
    
    await template.save();
    
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a template (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user.id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    template.isActive = false;
    await template.save();
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Duplicate a template
router.post('/:id/duplicate', async (req, res) => {
  try {
    const originalTemplate = await Template.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user.id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    });
    
    if (!originalTemplate) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    const duplicatedTemplate = new Template({
      user: req.user.id,
      name: `${originalTemplate.name} (Copy)`,
      description: originalTemplate.description,
      category: originalTemplate.category,
      structure: originalTemplate.structure,
      tags: originalTemplate.tags,
      type: 'user',
      parentTemplate: originalTemplate._id
    });
    
    await duplicatedTemplate.save();
    
    res.status(201).json(duplicatedTemplate);
  } catch (error) {
    console.error('Error duplicating template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Use a template (increment usage stats)
router.post('/:id/use', async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user.id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    await template.incrementUsage();
    
    res.json({ 
      message: 'Template usage recorded',
      template: {
        _id: template._id,
        name: template.name,
        structure: template.structure,
        htmlContent: template.htmlContent
      }
    });
  } catch (error) {
    console.error('Error recording template usage:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Preview template HTML
router.get('/:id/preview', async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user.id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.setHeader('Content-Type', 'text/html');
    res.send(template.htmlContent);
  } catch (error) {
    console.error('Error previewing template:', error);
    res.status(500).send('<h1>Error loading template preview</h1>');
  }
});

// Get template categories
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = [
      { value: 'newsletter', label: 'Newsletter', description: 'Regular updates and news' },
      { value: 'promotional', label: 'Promotional', description: 'Sales and marketing campaigns' },
      { value: 'transactional', label: 'Transactional', description: 'Order confirmations, receipts' },
      { value: 'welcome', label: 'Welcome', description: 'New subscriber onboarding' },
      { value: 'announcement', label: 'Announcement', description: 'Important updates and news' },
      { value: 'custom', label: 'Custom', description: 'Custom templates' }
    ];
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export template
router.get('/:id/export', protect, async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      $or: [
        { user: req.user._id },
        { type: { $in: ['system', 'shared'] } }
      ],
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Create exportable template data
    const exportData = {
      name: template.name,
      description: template.description,
      category: template.category,
      structure: template.structure,
      tags: template.tags,
      exportedAt: new Date(),
      exportedBy: req.user.name,
      version: '1.0'
    };

    res.json({
      message: 'Template exported successfully',
      template: exportData
    });
  } catch (error) {
    console.error('Error exporting template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Import template
router.post('/import', protect, async (req, res) => {
  try {
    const { name, description, category, structure, tags } = req.body;

    // Validate required fields
    if (!name || !structure) {
      return res.status(400).json({ message: 'Name and structure are required' });
    }

    // Create new template from imported data
    const template = new Template({
      user: req.user._id,
      name: `${name} (Imported)`,
      description: description || 'Imported template',
      category: category || 'custom',
      type: 'user',
      structure,
      tags: tags || [],
      isActive: true,
      stats: {
        timesUsed: 0,
        lastUsed: null
      }
    });

    await template.save();

    res.status(201).json({
      message: 'Template imported successfully',
      template: {
        _id: template._id,
        name: template.name,
        description: template.description,
        category: template.category,
        type: template.type,
        tags: template.tags,
        createdAt: template.createdAt
      }
    });
  } catch (error) {
    console.error('Error importing template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
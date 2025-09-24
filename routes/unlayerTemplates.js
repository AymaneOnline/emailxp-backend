// emailxp/backend/routes/unlayerTemplates.js

const express = require('express');
const router = express.Router();
const unlayerService = require('../services/unlayerService');
const { protect } = require('../middleware/authMiddleware');

// Health check endpoint (public - no auth required)
router.get('/health/check', async (req, res) => {
  try {
    const health = await unlayerService.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({ 
      configured: false, 
      working: false, 
      error: error.message 
    });
  }
});

// Protect all other Unlayer template routes
router.use(protect);

// Get all Unlayer templates
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0, search, category } = req.query;
    
    const options = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    // Add search if provided
    if (search) {
      options.search = search;
    }

    // Add category filter if provided
    if (category) {
      options.category = category;
    }

    const result = await unlayerService.getTemplates(options);
    
    res.json({
      templates: result.templates,
      total: result.total,
      hasMore: result.hasMore
    });
  } catch (error) {
    console.error('Error fetching Unlayer templates:', error);
    res.status(500).json({ 
      message: 'Failed to fetch templates',
      error: error.message 
    });
  }
});

// Get template by ID
router.get('/:id', async (req, res) => {
  try {
    const template = await unlayerService.getTemplateById(req.params.id);
    res.json(template);
  } catch (error) {
    console.error('Error fetching template by ID:', error);
    res.status(404).json({ 
      message: 'Template not found',
      error: error.message 
    });
  }
});

// Export template as HTML with enhanced error handling
router.post('/:id/export', async (req, res) => {
  try {
    const { displayMode = 'email', ...options } = req.body;
    
    console.log(`Exporting template ${req.params.id} with options:`, { displayMode, ...options });
    
    const result = await unlayerService.exportTemplateAsHtml(req.params.id, {
      displayMode,
      ...options
    });
    
    console.log('Template export completed successfully');
    res.json(result);
  } catch (error) {
    console.error('Error exporting template:', error);
    res.status(500).json({ 
      message: 'Failed to export template',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// Export design as HTML with enhanced error handling
router.post('/export/design', async (req, res) => {
  try {
    const { design, displayMode = 'email', ...options } = req.body;
    
    if (!design) {
      return res.status(400).json({ 
        message: 'Design data is required' 
      });
    }
    
    console.log('Exporting design with options:', { displayMode, ...options });
    
    const result = await unlayerService.exportDesignAsHtml(design, {
      displayMode,
      ...options
    });
    
    console.log('Design export completed successfully');
    res.json(result);
  } catch (error) {
    console.error('Error exporting design:', error);
    res.status(500).json({ 
      message: 'Failed to export design',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// Get template categories
router.get('/meta/categories', async (req, res) => {
  try {
    const categories = await unlayerService.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      message: 'Failed to fetch categories',
      error: error.message 
    });
  }
});

// Create a new template
router.post('/', async (req, res) => {
  try {
    const { name, description, design, ...otherData } = req.body;
    
    if (!name || !design) {
      return res.status(400).json({ 
        message: 'Template name and design are required' 
      });
    }

    const templateData = {
      name,
      description,
      design,
      ...otherData
    };

    const template = await unlayerService.createTemplate(templateData);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ 
      message: 'Failed to create template',
      error: error.message 
    });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const template = await unlayerService.updateTemplate(req.params.id, req.body);
    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ 
      message: 'Failed to update template',
      error: error.message 
    });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    await unlayerService.deleteTemplate(req.params.id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ 
      message: 'Failed to delete template',
      error: error.message 
    });
  }
});

// Generate template thumbnail
router.post('/:id/thumbnail', async (req, res) => {
  try {
    const { fullPage = false, ...options } = req.body;
    
    console.log(`Generating thumbnail for template ${req.params.id} with options:`, { fullPage, ...options });
    
    const imageData = await unlayerService.generateTemplateThumbnail(req.params.id, {
      fullPage,
      ...options
    });
    
    console.log('Template thumbnail generated successfully:', imageData);
    res.json({ url: imageData });
  } catch (error) {
    console.error('Error generating template thumbnail:', error);
    res.status(500).json({ 
      message: 'Failed to generate template thumbnail',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// Export design as image
router.post('/export/image', async (req, res) => {
  try {
    const { design, fullPage = false, ...options } = req.body;
    
    if (!design) {
      return res.status(400).json({ 
        message: 'Design data is required' 
      });
    }
    
    console.log('Exporting design as image with options:', { fullPage, ...options });
    
    const result = await unlayerService.exportDesignAsImage(design, {
      fullPage,
      ...options
    });
    
    console.log('Design image export completed successfully');
    res.json(result);
  } catch (error) {
    console.error('Error exporting design as image:', error);
    res.status(500).json({ 
      message: 'Failed to export design as image',
      error: error.message,
      details: error.response?.data || null
    });
  }
});

module.exports = router;
// emailxp/backend/routes/templates.js

const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const { protect } = require('../middleware/authMiddleware');

// Helper: generate PNG thumbnail data URL from HTML using puppeteer (lazy require)
const generateThumbnailFromHtml = async (html) => {
  if (!html || typeof html !== 'string') return null;
  try {
    // Lazy require puppeteer so environments without it don't crash until used
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
    // Use a minimal HTML wrapper to ensure rendering
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 10000 });
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();
    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.error('Thumbnail generation failed:', err && err.message ? err.message : err);
    return null;
  }
};

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
    const { name, description, category, structure, htmlContent, plainTextContent, emailDesign, tags, thumbnail, subject } = req.body;
    
    // Validation
    if (!name || (!structure && !htmlContent)) {
      return res.status(400).json({ message: 'Name and either structure or htmlContent are required' });
    }
    
    // Check if a template with the same name already exists for this user
    // Use case-insensitive match to avoid duplicates differing only by case
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await Template.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: 'i' },
      user: req.user.id
    });

    if (existing) {
        if (!existing.isActive) {
        // Reactivate and update the existing soft-deleted template
        existing.isActive = true;
        if (description !== undefined) existing.description = description;
          if (subject !== undefined) existing.subject = subject;
        if (category !== undefined) existing.category = category;
        if (structure !== undefined) existing.structure = structure;
        if (htmlContent !== undefined) existing.htmlContent = htmlContent;
        if (plainTextContent !== undefined) existing.plainTextContent = plainTextContent;
        if (emailDesign !== undefined) existing.emailDesign = emailDesign;
        if (tags !== undefined) existing.tags = tags;
        if (thumbnail !== undefined) existing.thumbnail = thumbnail;
        await existing.save();
        return res.status(200).json(existing);
      }
      // Active template exists -> duplicate
      return res.status(400).json({ message: `Duplicate key error: { name: \"${existing.name}\" }` });
    }

    const template = new Template({
      user: req.user.id,
      name,
      subject: subject || '',
      description,
      category: category || 'custom',
      structure,
      htmlContent,
      plainTextContent,
      emailDesign,
      tags: tags || [],
      type: 'user',
      thumbnail: thumbnail || undefined
    });

    await template.save();

    // Attempt to generate thumbnail from htmlContent asynchronously; non-blocking
    (async () => {
      try {
        const thumb = await generateThumbnailFromHtml(template.htmlContent || template.generateHTML && template.generateHTML());
        if (thumb) {
          template.thumbnail = thumb;
          // Save thumbnail without triggering validation again
          await template.save({ validateBeforeSave: false });
        }
      } catch (e) {
        console.error('Error saving generated thumbnail:', e);
      }
    })();

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    // Handle duplicate key (unique index) errors from MongoDB
    if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
      const keyVal = (error.keyValue && JSON.stringify(error.keyValue)) || '';
      return res.status(400).json({ message: `Duplicate key error${keyVal ? ': ' + keyVal : ''}` });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a template
router.put('/:id', async (req, res) => {
  try {
    const { name, description, category, structure, htmlContent, plainTextContent, emailDesign, tags, thumbnail, subject } = req.body;
    
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
  if (subject !== undefined) template.subject = subject;
    if (description !== undefined) template.description = description;
    if (category !== undefined) template.category = category;
    if (structure !== undefined) template.structure = structure;
    if (htmlContent !== undefined) template.htmlContent = htmlContent;
    if (plainTextContent !== undefined) template.plainTextContent = plainTextContent;
    if (emailDesign !== undefined) template.emailDesign = emailDesign;
    if (tags !== undefined) template.tags = tags;
    if (thumbnail !== undefined) template.thumbnail = thumbnail;
    
    // Increment version
    template.version += 1;
    
    await template.save();

    // Regenerate thumbnail asynchronously on update
    (async () => {
      try {
        const thumb = await generateThumbnailFromHtml(template.htmlContent || template.generateHTML && template.generateHTML());
        if (thumb) {
          template.thumbnail = thumb;
          await template.save({ validateBeforeSave: false });
        }
      } catch (e) {
        console.error('Error updating generated thumbnail:', e);
      }
    })();

    res.json(template);
  } catch (error) {
    console.error('Error updating template:', error);
    if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
      const keyVal = (error.keyValue && JSON.stringify(error.keyValue)) || '';
      return res.status(400).json({ message: `Duplicate key error${keyVal ? ': ' + keyVal : ''}` });
    }
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
    // Save without running validators or pre-validate hooks which may enforce
    // presence of footer/html content. We only need to mark the record as
    // inactive for soft-delete semantics.
    await template.save({ validateBeforeSave: false });

    // Log deletion for observability (helps debugging when UI reports success
    // but DB shows the record still active)
    console.info('[TemplatesRoute] template deleted', { templateId: template._id ? template._id.toString() : null, userId: req.user.id });

    // Return the deactivated template so clients can verify the backend change
    res.json({ message: 'Template deleted successfully', template: { _id: template._id, isActive: template.isActive } });
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
      htmlContent: originalTemplate.htmlContent,
      plainTextContent: originalTemplate.plainTextContent,
      emailDesign: originalTemplate.emailDesign,
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

// Use a template (validation + increment usage)
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

    // Compliance validation
    if (!template.hasFooterAndUnsubscribe || !template.hasFooterAndUnsubscribe()) {
      return res.status(400).json({ message: 'Template must include a footer block containing an unsubscribe link ({{unsubscribeUrl}}).' });
    }
    
    await template.incrementUsage();
    
    res.json({ 
      message: 'Template usage recorded',
      template: {
        _id: template._id,
        name: template.name,
        structure: template.structure,
        htmlContent: template.htmlContent,
        emailDesign: template.emailDesign
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

// Import template (auto-inject compliant footer if missing)
router.post('/import', protect, async (req, res) => {
  try {
    const { name, description, category, structure, tags } = req.body;

    // Validate required fields
    if (!name || !structure) {
      return res.status(400).json({ message: 'Name and structure are required' });
    }

    const imported = { ...structure };
    imported.blocks = Array.isArray(imported.blocks) ? imported.blocks : [];

    // Normalize blocks: ensure content/styles objects
    imported.blocks = imported.blocks.map(b => ({
      ...b,
      content: b && typeof b.content === 'object' ? b.content : (b?.content ? { text: b.content } : {}),
      styles: b && typeof b.styles === 'object' ? b.styles : {}
    }));

    // Check footer compliance
    let hasFooter = imported.blocks.some(b => b.type === 'footer');
    let footerHasToken = false;
    if (hasFooter) {
      const f = imported.blocks.find(b => b.type === 'footer');
      const footerText = (f?.content?.text || '').toString();
      footerHasToken = /\{\{\s*unsubscribeUrl\s*\}\}/i.test(footerText);
    }

    let importedAutoFooter = false;
    if (!hasFooter || !footerHasToken) {
      // Append a default compliant footer
      imported.blocks.push({
        id: Date.now() + Math.random(),
        type: 'footer',
        content: {
          text: 'You are receiving this email because you subscribed. If you wish to unsubscribe, click here: <a href="{{unsubscribeUrl}}">Unsubscribe</a>',
          align: 'center'
        },
        styles: { fontSize: '12px', color: '#666666', padding: '20px 0' }
      });
      importedAutoFooter = true;
    }

    // Create new template from imported data
    const template = new Template({
      user: req.user._id,
      name: `${name} (Imported)`,
      description: description || 'Imported template',
      category: category || 'custom',
      type: 'user',
      structure: imported,
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
      importedAutoFooter,
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
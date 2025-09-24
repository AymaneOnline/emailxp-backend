const LandingPage = require('../models/LandingPage');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Get all landing pages for a user
exports.getLandingPages = async (req, res) => {
  try {
    const landingPages = await LandingPage.find({ user: req.user.id })
      .select('name description slug status visits conversions formIntegration createdAt updatedAt')
      .populate('formIntegration', 'name')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ landingPages });
  } catch (error) {
    console.error('Error fetching landing pages:', error);
    res.status(500).json({ message: 'Failed to fetch landing pages' });
  }
};

// Get landing page by ID
exports.getLandingPageById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid landing page ID' });
    }
    
    const landingPage = await LandingPage.findOne({ 
      _id: id, 
      user: req.user.id 
    }).populate('formIntegration');
    
    if (!landingPage) {
      return res.status(404).json({ message: 'Landing page not found' });
    }
    
    res.json(landingPage);
  } catch (error) {
    console.error('Error fetching landing page:', error);
    res.status(500).json({ message: 'Failed to fetch landing page' });
  }
};

// Get landing page by slug (public endpoint)
exports.getLandingPageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    
    const landingPage = await LandingPage.findOne({ 
      slug: slug,
      status: 'published'
    }).populate('formIntegration');
    
    if (!landingPage) {
      return res.status(404).json({ message: 'Landing page not found' });
    }
    
    // Increment visit count
    landingPage.visits += 1;
    await landingPage.save();
    
    res.json(landingPage);
  } catch (error) {
    console.error('Error fetching landing page by slug:', error);
    res.status(500).json({ message: 'Failed to fetch landing page' });
  }
};

// Create a new landing page
exports.createLandingPage = async (req, res) => {
  try {
    const { name, description, design, htmlContent, formIntegration } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: 'Landing page name is required' });
    }
    
    // Generate a unique slug
    let slug = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Ensure slug is unique
    let existingPage = await LandingPage.findOne({ 
      user: req.user.id,
      slug: slug 
    });
    
    if (existingPage) {
      slug = `${slug}-${uuidv4().substring(0, 6)}`;
    }
    
    const landingPage = new LandingPage({
      name,
      description: description || '',
      slug,
      design: design || {},
      htmlContent: htmlContent || '',
      formIntegration: formIntegration || null,
      user: req.user.id
    });
    
    const savedLandingPage = await landingPage.save();
    res.status(201).json(savedLandingPage);
  } catch (error) {
    console.error('Error creating landing page:', error);
    res.status(500).json({ message: 'Failed to create landing page' });
  }
};

// Update landing page
exports.updateLandingPage = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, design, htmlContent, status, formIntegration, seo } = req.body;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid landing page ID' });
    }
    
    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (design) updateData.design = design;
    if (htmlContent !== undefined) updateData.htmlContent = htmlContent;
    if (status) updateData.status = status;
    // Enforce verified domain requirement only at publish time
    if (status === 'published') {
      const DomainAuthentication = require('../models/DomainAuthentication');
      const hasVerified = await DomainAuthentication.exists({ user: req.user.id, status: 'verified' });
      if (!hasVerified) {
        return res.status(400).json({ message: 'A verified sending domain is required to publish pages.', code: 'DOMAIN_NOT_VERIFIED' });
      }
    }
    if (formIntegration !== undefined) updateData.formIntegration = formIntegration;
    if (seo) updateData.seo = seo;
    
    // Handle publishedAt timestamp
    if (status === 'published' && !updateData.publishedAt) {
      const existingPage = await LandingPage.findById(id);
      if (existingPage && existingPage.status !== 'published') {
        updateData.publishedAt = new Date();
      }
    }
    
    const landingPage = await LandingPage.findOneAndUpdate(
      { _id: id, user: req.user.id },
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!landingPage) {
      return res.status(404).json({ message: 'Landing page not found' });
    }
    
    res.json(landingPage);
  } catch (error) {
    console.error('Error updating landing page:', error);
    res.status(500).json({ message: 'Failed to update landing page' });
  }
};

// Delete landing page
exports.deleteLandingPage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid landing page ID' });
    }
    
    const landingPage = await LandingPage.findOneAndDelete({ 
      _id: id, 
      user: req.user.id 
    });
    
    if (!landingPage) {
      return res.status(404).json({ message: 'Landing page not found' });
    }
    
    res.json({ message: 'Landing page deleted successfully' });
  } catch (error) {
    console.error('Error deleting landing page:', error);
    res.status(500).json({ message: 'Failed to delete landing page' });
  }
};

// Record conversion
exports.recordConversion = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid landing page ID' });
    }
    
    const landingPage = await LandingPage.findOneAndUpdate(
      { _id: id, user: req.user.id },
      { $inc: { conversions: 1 } },
      { new: true }
    );
    
    if (!landingPage) {
      return res.status(404).json({ message: 'Landing page not found' });
    }
    
    res.json({ 
      message: 'Conversion recorded', 
      conversions: landingPage.conversions 
    });
  } catch (error) {
    console.error('Error recording conversion:', error);
    res.status(500).json({ message: 'Failed to record conversion' });
  }
};
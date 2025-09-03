// emailxp/backend/routes/templateSharing.js

const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// Share template with specific users
router.post('/:id/share', protect, async (req, res) => {
  try {
    const { userEmails, permissions = 'view' } = req.body;
    
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Find users by email
    const users = await User.find({ email: { $in: userEmails } });
    const foundEmails = users.map(u => u.email);
    const notFoundEmails = userEmails.filter(email => !foundEmails.includes(email));

    // Add sharing permissions
    const newShares = users.map(user => ({
      user: user._id,
      email: user.email,
      permissions,
      sharedAt: new Date()
    }));

    // Remove existing shares for these users and add new ones
    template.sharing = template.sharing || {};
    template.sharing.sharedWith = template.sharing.sharedWith || [];
    
    // Remove existing shares
    template.sharing.sharedWith = template.sharing.sharedWith.filter(
      share => !foundEmails.includes(share.email)
    );
    
    // Add new shares
    template.sharing.sharedWith.push(...newShares);
    template.sharing.isShared = true;
    template.sharing.lastShared = new Date();

    await template.save();

    res.json({
      message: 'Template shared successfully',
      shared: foundEmails,
      notFound: notFoundEmails,
      totalShares: template.sharing.sharedWith.length
    });
  } catch (error) {
    console.error('Error sharing template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get shared templates (templates shared with current user)
router.get('/shared-with-me', protect, async (req, res) => {
  try {
    const templates = await Template.find({
      'sharing.sharedWith.user': req.user._id,
      isActive: true
    })
    .populate('user', 'name email')
    .sort({ 'sharing.lastShared': -1 });

    const templatesWithPermissions = templates.map(template => {
      const userShare = template.sharing.sharedWith.find(
        share => share.user.toString() === req.user._id.toString()
      );
      
      return {
        ...template.toObject(),
        sharedPermissions: userShare?.permissions || 'view',
        sharedAt: userShare?.sharedAt
      };
    });

    res.json({
      templates: templatesWithPermissions,
      total: templatesWithPermissions.length
    });
  } catch (error) {
    console.error('Error fetching shared templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get templates shared by current user
router.get('/shared-by-me', protect, async (req, res) => {
  try {
    const templates = await Template.find({
      user: req.user._id,
      'sharing.isShared': true,
      isActive: true
    }).sort({ 'sharing.lastShared': -1 });

    res.json({
      templates,
      total: templates.length
    });
  } catch (error) {
    console.error('Error fetching shared templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update sharing permissions
router.put('/:id/share/:userId', protect, async (req, res) => {
  try {
    const { permissions } = req.body;
    
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const shareIndex = template.sharing.sharedWith.findIndex(
      share => share.user.toString() === req.params.userId
    );

    if (shareIndex === -1) {
      return res.status(404).json({ message: 'User not found in shares' });
    }

    template.sharing.sharedWith[shareIndex].permissions = permissions;
    await template.save();

    res.json({
      message: 'Permissions updated successfully',
      share: template.sharing.sharedWith[shareIndex]
    });
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove sharing access
router.delete('/:id/share/:userId', protect, async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    template.sharing.sharedWith = template.sharing.sharedWith.filter(
      share => share.user.toString() !== req.params.userId
    );

    // If no more shares, mark as not shared
    if (template.sharing.sharedWith.length === 0) {
      template.sharing.isShared = false;
    }

    await template.save();

    res.json({
      message: 'Access removed successfully',
      remainingShares: template.sharing.sharedWith.length
    });
  } catch (error) {
    console.error('Error removing access:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Make template public
router.post('/:id/make-public', protect, async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    template.isPublic = true;
    template.sharing = template.sharing || {};
    template.sharing.madePublicAt = new Date();
    
    await template.save();

    res.json({
      message: 'Template made public successfully',
      template: {
        _id: template._id,
        name: template.name,
        isPublic: template.isPublic
      }
    });
  } catch (error) {
    console.error('Error making template public:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Make template private
router.post('/:id/make-private', protect, async (req, res) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      user: req.user._id,
      isActive: true
    });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    template.isPublic = false;
    await template.save();

    res.json({
      message: 'Template made private successfully',
      template: {
        _id: template._id,
        name: template.name,
        isPublic: template.isPublic
      }
    });
  } catch (error) {
    console.error('Error making template private:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get public templates
router.get('/public', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    
    const query = {
      isPublic: true,
      isActive: true
    };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const templates = await Template.find(query)
      .populate('user', 'name')
      .sort({ 'stats.timesUsed': -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Template.countDocuments(query);

    res.json({
      templates,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching public templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
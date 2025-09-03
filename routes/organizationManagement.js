// emailxp/backend/routes/organizationManagement.js

const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const { 
  requireOrganizationAccess,
  rbac,
  getDefaultPermissions
} = require('../middleware/rbac');

// Get all organizations (super admin only)
router.get('/', protect, rbac('settings', 'manage'), async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    const { page = 1, limit = 10, search, status, plan } = req.query;
    
    const query = {};
    
    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add status filter
    if (status) {
      query.status = status;
    }
    
    // Add plan filter
    if (plan) {
      query['subscription.plan'] = plan;
    }

    const organizations = await Organization.find(query)
      .populate('owner', 'name email')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Organization.countDocuments(query);

    res.json({
      organizations,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user's organization
router.get('/current', protect, async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization)
      .populate('owner', 'name email')
      .populate('createdBy', 'name email');

    if (!organization) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    res.json(organization);
  } catch (error) {
    console.error('Error fetching current organization:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific organization
router.get('/:organizationId', 
  protect, 
  requireOrganizationAccess('read'),
  async (req, res) => {
    try {
      res.json(req.organization);
    } catch (error) {
      console.error('Error fetching organization:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Create new organization
router.post('/', protect, async (req, res) => {
  try {
    const {
      name,
      description,
      email,
      phone,
      website,
      industry,
      size,
      address
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ 
        message: 'Organization name and email are required' 
      });
    }

    // Check if organization name already exists
    const existingOrg = await Organization.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });
    
    if (existingOrg) {
      return res.status(400).json({ 
        message: 'Organization with this name already exists' 
      });
    }

    // Generate unique slug
    let slug = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    let slugExists = await Organization.findOne({ slug });
    let counter = 1;
    
    while (slugExists) {
      slug = `${slug}-${counter}`;
      slugExists = await Organization.findOne({ slug });
      counter++;
    }

    // Create organization
    const organization = new Organization({
      name,
      slug,
      description,
      email,
      phone,
      website,
      industry,
      size,
      address,
      owner: req.user._id,
      createdBy: req.user._id,
      status: 'active'
    });

    await organization.save();

    // Update user's organization
    req.user.organization = organization._id;
    req.user.role = 'admin'; // Organization creator becomes admin
    req.user.permissions = getDefaultPermissions('admin');
    req.user.status = 'active';
    await req.user.save();

    res.status(201).json({
      message: 'Organization created successfully',
      organization
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update organization
router.put('/:organizationId', 
  protect, 
  requireOrganizationAccess('manage'),
  async (req, res) => {
    try {
      const {
        name,
        description,
        email,
        phone,
        website,
        industry,
        size,
        address,
        brandColors,
        settings
      } = req.body;

      const organization = req.organization;

      // Update basic information
      if (name) organization.name = name;
      if (description !== undefined) organization.description = description;
      if (email) organization.email = email;
      if (phone !== undefined) organization.phone = phone;
      if (website !== undefined) organization.website = website;
      if (industry) organization.industry = industry;
      if (size) organization.size = size;
      if (address) organization.address = { ...organization.address, ...address };
      if (brandColors) organization.brandColors = { ...organization.brandColors, ...brandColors };
      
      // Update settings
      if (settings) {
        organization.settings = { ...organization.settings, ...settings };
      }

      organization.lastModifiedBy = req.user._id;
      await organization.save();

      res.json({
        message: 'Organization updated successfully',
        organization
      });
    } catch (error) {
      console.error('Error updating organization:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update organization subscription
router.put('/:organizationId/subscription', 
  protect, 
  requireOrganizationAccess('manage'),
  async (req, res) => {
    try {
      const { plan, stripeCustomerId, stripeSubscriptionId } = req.body;

      if (!plan) {
        return res.status(400).json({ message: 'Plan is required' });
      }

      const organization = req.organization;
      
      // Get new limits and features for the plan
      const newLimits = Organization.getPlanLimits(plan);
      const newFeatures = Organization.getPlanFeatures(plan);

      // Update subscription
      organization.subscription.plan = plan;
      if (stripeCustomerId) organization.subscription.stripeCustomerId = stripeCustomerId;
      if (stripeSubscriptionId) organization.subscription.stripeSubscriptionId = stripeSubscriptionId;
      
      // Update limits and features
      organization.limits = { ...organization.limits, ...newLimits };
      organization.settings.features = { ...organization.settings.features, ...newFeatures };
      
      organization.lastModifiedBy = req.user._id;
      await organization.save();

      res.json({
        message: 'Subscription updated successfully',
        organization
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get organization usage statistics
router.get('/:organizationId/usage', 
  protect, 
  requireOrganizationAccess('read'),
  async (req, res) => {
    try {
      const organization = req.organization;
      
      const usageStats = {
        current: organization.usage,
        limits: organization.limits,
        percentages: {
          users: organization.getUsagePercentage('users'),
          emailsSentThisMonth: organization.getUsagePercentage('emailsSentThisMonth'),
          subscribersCount: organization.getUsagePercentage('subscribersCount'),
          templatesCount: organization.getUsagePercentage('templatesCount'),
          campaignsThisMonth: organization.getUsagePercentage('campaignsThisMonth'),
          automationRulesCount: organization.getUsagePercentage('automationRulesCount'),
          apiCallsToday: organization.getUsagePercentage('apiCallsToday')
        },
        warnings: []
      };

      // Add warnings for high usage
      Object.keys(usageStats.percentages).forEach(key => {
        const percentage = usageStats.percentages[key];
        if (percentage >= 90) {
          usageStats.warnings.push({
            resource: key,
            percentage,
            message: `${key} usage is at ${percentage.toFixed(1)}% of limit`
          });
        }
      });

      res.json(usageStats);
    } catch (error) {
      console.error('Error fetching usage statistics:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Reset monthly usage (admin only)
router.post('/:organizationId/reset-usage', 
  protect, 
  requireOrganizationAccess('manage'),
  async (req, res) => {
    try {
      if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const organization = req.organization;
      await organization.resetMonthlyUsage();

      res.json({ message: 'Monthly usage reset successfully' });
    } catch (error) {
      console.error('Error resetting usage:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Transfer organization ownership
router.post('/:organizationId/transfer-ownership', 
  protect, 
  requireOrganizationAccess('manage'),
  async (req, res) => {
    try {
      const { newOwnerId } = req.body;

      if (!newOwnerId) {
        return res.status(400).json({ message: 'New owner ID is required' });
      }

      const organization = req.organization;

      // Only current owner can transfer ownership
      if (organization.owner.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          message: 'Only organization owner can transfer ownership' 
        });
      }

      // Verify new owner exists and belongs to organization
      const newOwner = await User.findById(newOwnerId);
      if (!newOwner || newOwner.organization.toString() !== organization._id.toString()) {
        return res.status(400).json({ 
          message: 'New owner must be a member of this organization' 
        });
      }

      // Transfer ownership
      organization.owner = newOwnerId;
      organization.lastModifiedBy = req.user._id;
      await organization.save();

      // Update new owner role to admin if not already
      if (newOwner.role === 'user' || newOwner.role === 'viewer') {
        newOwner.role = 'admin';
        newOwner.permissions = getDefaultPermissions('admin');
        await newOwner.save();
      }

      res.json({
        message: 'Ownership transferred successfully',
        newOwner: {
          _id: newOwner._id,
          name: newOwner.name,
          email: newOwner.email
        }
      });
    } catch (error) {
      console.error('Error transferring ownership:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get organization members
router.get('/:organizationId/members', 
  protect, 
  requireOrganizationAccess('read'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, role, status } = req.query;
      
      const query = { organization: req.organization._id };
      
      if (role) query.role = role;
      if (status) query.status = status;

      const members = await User.find(query)
        .select('-password -verificationToken -twoFactorSecret -apiKey')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await User.countDocuments(query);

      res.json({
        members,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error('Error fetching organization members:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Invite user to organization
router.post('/:organizationId/invite', 
  protect, 
  requireOrganizationAccess('manage'),
  rbac('users', 'create'),
  async (req, res) => {
    try {
      const { email, role = 'user', name } = req.body;

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Check if organization has user limit capacity
      if (!req.organization.checkUsageLimit('users')) {
        return res.status(429).json({ 
          message: 'User limit reached for this organization' 
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        if (existingUser.organization.toString() === req.organization._id.toString()) {
          return res.status(400).json({ 
            message: 'User is already a member of this organization' 
          });
        } else {
          return res.status(400).json({ 
            message: 'User already exists in another organization' 
          });
        }
      }

      // Check if current user can assign this role
      if (!User.canManageRole(req.user.role, role)) {
        return res.status(403).json({ 
          message: `Cannot assign role: ${role}` 
        });
      }

      // Create invitation (in a real app, you'd send an email)
      // For now, we'll create a pending user
      const invitedUser = new User({
        name: name || email.split('@')[0],
        email,
        password: 'temporary_password_' + Date.now(), // This should be changed on first login
        role,
        organization: req.organization._id,
        status: 'pending',
        permissions: getDefaultPermissions(role),
        companyOrOrganization: req.organization.name
      });

      await invitedUser.save();

      // Increment organization user count
      await req.organization.incrementUsage('users');

      res.status(201).json({
        message: 'User invited successfully',
        user: {
          _id: invitedUser._id,
          name: invitedUser.name,
          email: invitedUser.email,
          role: invitedUser.role,
          status: invitedUser.status
        }
      });
    } catch (error) {
      console.error('Error inviting user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Remove user from organization
router.delete('/:organizationId/members/:userId', 
  protect, 
  requireOrganizationAccess('manage'),
  rbac('users', 'delete'),
  async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user || user.organization.toString() !== req.organization._id.toString()) {
        return res.status(404).json({ message: 'User not found in this organization' });
      }

      // Cannot remove organization owner
      if (req.organization.owner.toString() === userId) {
        return res.status(400).json({ 
          message: 'Cannot remove organization owner. Transfer ownership first.' 
        });
      }

      // Check if current user can manage this user
      if (!User.canManageRole(req.user.role, user.role)) {
        return res.status(403).json({ 
          message: 'Cannot remove user with this role' 
        });
      }

      // Remove user (soft delete)
      user.status = 'inactive';
      user.organization = null;
      await user.save();

      // Decrement organization user count
      await req.organization.incrementUsage('users', -1);

      res.json({ message: 'User removed from organization successfully' });
    } catch (error) {
      console.error('Error removing user from organization:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete organization (super admin only)
router.delete('/:organizationId', 
  protect, 
  async (req, res) => {
    try {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super admin access required' });
      }

      const organization = await Organization.findById(req.params.organizationId);
      if (!organization) {
        return res.status(404).json({ message: 'Organization not found' });
      }

      // Soft delete - change status to inactive
      organization.status = 'inactive';
      await organization.save();

      // Deactivate all users in the organization
      await User.updateMany(
        { organization: organization._id },
        { status: 'inactive' }
      );

      res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
      console.error('Error deleting organization:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
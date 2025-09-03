// emailxp/backend/routes/userManagement.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/authMiddleware');
const { 
  rbac, 
  canManageUser, 
  requireOrganizationAccess,
  checkUsageLimit,
  getDefaultPermissions
} = require('../middleware/rbac');

// Get all users in organization
router.get('/', protect, rbac('users', 'read'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, status } = req.query;
    
    const query = { organization: req.user.organization };
    
    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { companyOrOrganization: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add role filter
    if (role) {
      query.role = role;
    }
    
    // Add status filter
    if (status) {
      query.status = status;
    }

    const users = await User.find(query)
      .select('-password -verificationToken -twoFactorSecret -apiKey')
      .populate('organization', 'name slug')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific user
router.get('/:userId', protect, rbac('users', 'read'), async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -verificationToken -twoFactorSecret -apiKey')
      .populate('organization', 'name slug');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user belongs to same organization (unless super admin)
    if (req.user.role !== 'super_admin' && 
        user.organization._id.toString() !== req.user.organization.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new user
router.post('/', 
  protect, 
  rbac('users', 'create'), 
  checkUsageLimit('users'),
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role = 'user',
        companyOrOrganization,
        permissions
      } = req.body;

      // Validate required fields
      if (!name || !email || !password) {
        return res.status(400).json({ 
          message: 'Name, email, and password are required' 
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists with this email' });
      }

      // Check if current user can assign this role
      if (!User.canManageRole(req.user.role, role)) {
        return res.status(403).json({ 
          message: `Cannot assign role: ${role}` 
        });
      }

      // Create user
      const user = new User({
        name,
        email,
        password,
        role,
        companyOrOrganization: companyOrOrganization || req.organization?.name,
        organization: req.user.organization,
        status: 'active',
        isVerified: true, // Admin-created users are auto-verified
        permissions: permissions || getDefaultPermissions(role)
      });

      await user.save();

      // Increment organization user count
      await req.organization.incrementUsage('users');

      // Remove sensitive data before sending response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.verificationToken;
      delete userResponse.twoFactorSecret;
      delete userResponse.apiKey;

      res.status(201).json({
        message: 'User created successfully',
        user: userResponse
      });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update user
router.put('/:userId', 
  protect, 
  rbac('users', 'update'), 
  canManageUser,
  async (req, res) => {
    try {
      const {
        name,
        email,
        role,
        status,
        permissions,
        companyOrOrganization,
        website,
        industry,
        bio
      } = req.body;

      const user = req.targetUser;

      // Check if current user can assign this role
      if (role && role !== user.role) {
        if (!User.canManageRole(req.user.role, role)) {
          return res.status(403).json({ 
            message: `Cannot assign role: ${role}` 
          });
        }
      }

      // Check if email is being changed and if it's already taken
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ message: 'Email already in use' });
        }
      }

      // Update user fields
      if (name) user.name = name;
      if (email) user.email = email;
      if (role) user.role = role;
      if (status) user.status = status;
      if (companyOrOrganization) user.companyOrOrganization = companyOrOrganization;
      if (website) user.website = website;
      if (industry) user.industry = industry;
      if (bio) user.bio = bio;
      
      // Update permissions if provided and user has permission to manage
      if (permissions && req.user.hasPermission('users', 'manage')) {
        user.permissions = permissions;
      }

      user.lastModifiedBy = req.user._id;
      await user.save();

      // Remove sensitive data
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.verificationToken;
      delete userResponse.twoFactorSecret;
      delete userResponse.apiKey;

      res.json({
        message: 'User updated successfully',
        user: userResponse
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete user
router.delete('/:userId', 
  protect, 
  rbac('users', 'delete'), 
  canManageUser,
  async (req, res) => {
    try {
      const user = req.targetUser;

      // Prevent deleting organization owner
      const organization = await Organization.findById(user.organization);
      if (organization && organization.owner.toString() === user._id.toString()) {
        return res.status(400).json({ 
          message: 'Cannot delete organization owner. Transfer ownership first.' 
        });
      }

      // Soft delete - just deactivate the user
      user.status = 'inactive';
      user.email = `deleted_${Date.now()}_${user.email}`;
      await user.save();

      // Decrement organization user count
      if (organization) {
        await organization.incrementUsage('users', -1);
      }

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update user permissions
router.put('/:userId/permissions', 
  protect, 
  rbac('users', 'manage'), 
  canManageUser,
  async (req, res) => {
    try {
      const { permissions } = req.body;
      
      if (!permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ message: 'Valid permissions array is required' });
      }

      const user = req.targetUser;
      user.permissions = permissions;
      await user.save();

      res.json({
        message: 'User permissions updated successfully',
        permissions: user.permissions
      });
    } catch (error) {
      console.error('Error updating user permissions:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Reset user password
router.post('/:userId/reset-password', 
  protect, 
  rbac('users', 'manage'), 
  canManageUser,
  async (req, res) => {
    try {
      const { newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ 
          message: 'Password must be at least 6 characters long' 
        });
      }

      const user = req.targetUser;
      user.password = newPassword;
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Generate API key for user
router.post('/:userId/api-key', 
  protect, 
  rbac('users', 'manage'), 
  canManageUser,
  async (req, res) => {
    try {
      const user = req.targetUser;
      
      // Check if organization has API access
      const organization = await Organization.findById(user.organization);
      if (!organization.hasFeature('apiAccess')) {
        return res.status(403).json({ 
          message: 'API access is not available in your current plan' 
        });
      }

      const apiKey = user.generateApiKey();
      await user.save();

      res.json({
        message: 'API key generated successfully',
        apiKey: apiKey, // Return the unhashed key
        createdAt: user.apiKeyCreatedAt
      });
    } catch (error) {
      console.error('Error generating API key:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Revoke API key
router.delete('/:userId/api-key', 
  protect, 
  rbac('users', 'manage'), 
  canManageUser,
  async (req, res) => {
    try {
      const user = req.targetUser;
      user.apiKey = undefined;
      user.apiKeyCreatedAt = undefined;
      user.apiKeyLastUsed = undefined;
      await user.save();

      res.json({ message: 'API key revoked successfully' });
    } catch (error) {
      console.error('Error revoking API key:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get user activity log
router.get('/:userId/activity', 
  protect, 
  rbac('users', 'read'),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.params.userId;

      // Check access permissions
      if (req.user.role !== 'super_admin' && 
          req.user._id.toString() !== userId &&
          !req.user.hasPermission('users', 'manage')) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // This would typically come from an audit log collection
      // For now, return basic user information
      const user = await User.findById(userId)
        .select('lastLogin loginAttempts apiKeyLastUsed createdAt updatedAt');

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const activity = [
        {
          action: 'account_created',
          timestamp: user.createdAt,
          details: 'User account was created'
        },
        {
          action: 'last_login',
          timestamp: user.lastLogin,
          details: 'User last logged in'
        }
      ];

      if (user.apiKeyLastUsed) {
        activity.push({
          action: 'api_key_used',
          timestamp: user.apiKeyLastUsed,
          details: 'API key was last used'
        });
      }

      res.json({
        activity: activity.filter(a => a.timestamp).sort((a, b) => b.timestamp - a.timestamp),
        total: activity.length,
        page: parseInt(page),
        pages: 1
      });
    } catch (error) {
      console.error('Error fetching user activity:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Bulk operations
router.post('/bulk-action', 
  protect, 
  rbac('users', 'manage'),
  async (req, res) => {
    try {
      const { action, userIds, data } = req.body;
      
      if (!action || !userIds || !Array.isArray(userIds)) {
        return res.status(400).json({ 
          message: 'Action and user IDs array are required' 
        });
      }

      const results = [];
      
      for (const userId of userIds) {
        try {
          const user = await User.findById(userId);
          if (!user || user.organization.toString() !== req.user.organization.toString()) {
            results.push({ userId, success: false, error: 'User not found or access denied' });
            continue;
          }

          // Check if current user can manage this user
          if (!User.canManageRole(req.user.role, user.role)) {
            results.push({ userId, success: false, error: 'Cannot manage this user role' });
            continue;
          }

          switch (action) {
            case 'activate':
              user.status = 'active';
              await user.save();
              results.push({ userId, success: true, message: 'User activated' });
              break;
              
            case 'deactivate':
              user.status = 'inactive';
              await user.save();
              results.push({ userId, success: true, message: 'User deactivated' });
              break;
              
            case 'update_role':
              if (data.role && User.canManageRole(req.user.role, data.role)) {
                user.role = data.role;
                user.permissions = getDefaultPermissions(data.role);
                await user.save();
                results.push({ userId, success: true, message: 'Role updated' });
              } else {
                results.push({ userId, success: false, error: 'Cannot assign this role' });
              }
              break;
              
            default:
              results.push({ userId, success: false, error: 'Unknown action' });
          }
        } catch (error) {
          results.push({ userId, success: false, error: error.message });
        }
      }

      res.json({
        message: 'Bulk operation completed',
        results
      });
    } catch (error) {
      console.error('Error in bulk operation:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
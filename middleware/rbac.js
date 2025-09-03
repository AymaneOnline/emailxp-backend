// emailxp/backend/middleware/rbac.js

const User = require('../models/User');
const Organization = require('../models/Organization');

// Role-based access control middleware
const rbac = (requiredResource, requiredAction) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Access denied. No user found.' });
      }

      // Super admin has access to everything
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Check if user has the required permission
      if (!req.user.hasPermission(requiredResource, requiredAction)) {
        return res.status(403).json({ 
          message: `Access denied. Required permission: ${requiredAction} on ${requiredResource}` 
        });
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ message: 'Server error in access control' });
    }
  };
};

// Check if user can manage another user (based on role hierarchy)
const canManageUser = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.body.userId;
    if (!targetUserId) {
      return res.status(400).json({ message: 'Target user ID is required' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    // Super admin can manage anyone
    if (req.user.role === 'super_admin') {
      req.targetUser = targetUser;
      return next();
    }

    // Users can only manage users in their organization
    if (req.user.organization.toString() !== targetUser.organization.toString()) {
      return res.status(403).json({ message: 'Cannot manage users from different organizations' });
    }

    // Check role hierarchy
    if (!User.canManageRole(req.user.role, targetUser.role)) {
      return res.status(403).json({ 
        message: `Cannot manage user with role: ${targetUser.role}` 
      });
    }

    req.targetUser = targetUser;
    next();
  } catch (error) {
    console.error('User management check error:', error);
    res.status(500).json({ message: 'Server error in user management check' });
  }
};

// Check organization ownership or admin access
const requireOrganizationAccess = (action = 'read') => {
  return async (req, res, next) => {
    try {
      const organizationId = req.params.organizationId || req.user.organization;
      
      if (!organizationId) {
        return res.status(400).json({ message: 'Organization ID is required' });
      }

      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(404).json({ message: 'Organization not found' });
      }

      // Super admin has access to all organizations
      if (req.user.role === 'super_admin') {
        req.organization = organization;
        return next();
      }

      // Users can only access their own organization
      if (req.user.organization.toString() !== organizationId.toString()) {
        return res.status(403).json({ message: 'Access denied to this organization' });
      }

      // Check specific action permissions
      if (action === 'manage') {
        // Only organization owner or admin can manage
        if (organization.owner.toString() !== req.user._id.toString() && 
            req.user.role !== 'admin') {
          return res.status(403).json({ 
            message: 'Only organization owner or admin can manage organization' 
          });
        }
      }

      req.organization = organization;
      next();
    } catch (error) {
      console.error('Organization access check error:', error);
      res.status(500).json({ message: 'Server error in organization access check' });
    }
  };
};

// Check usage limits
const checkUsageLimit = (resource) => {
  return async (req, res, next) => {
    try {
      // Load organization if not already loaded
      if (!req.organization) {
        const organization = await Organization.findById(req.user.organization);
        if (!organization) {
          return res.status(404).json({ message: 'Organization not found' });
        }
        req.organization = organization;
      }

      // Check organization-level limits
      if (!req.organization.checkUsageLimit(resource)) {
        return res.status(429).json({ 
          message: `Usage limit exceeded for ${resource}`,
          limit: req.organization.limits[resource],
          current: req.organization.usage[resource]
        });
      }

      // Check user-level limits if applicable
      if (req.user.limits && req.user.limits[resource]) {
        if (!req.user.checkUsageLimit(resource)) {
          return res.status(429).json({ 
            message: `User usage limit exceeded for ${resource}`,
            limit: req.user.limits[resource],
            current: req.user.usage[resource]
          });
        }
      }

      next();
    } catch (error) {
      console.error('Usage limit check error:', error);
      res.status(500).json({ message: 'Server error in usage limit check' });
    }
  };
};

// Check feature access
const requireFeature = (feature) => {
  return async (req, res, next) => {
    try {
      // Load organization if not already loaded
      if (!req.organization) {
        const organization = await Organization.findById(req.user.organization);
        if (!organization) {
          return res.status(404).json({ message: 'Organization not found' });
        }
        req.organization = organization;
      }

      // Super admin has access to all features
      if (req.user.role === 'super_admin') {
        return next();
      }

      // Check if organization has the required feature
      if (!req.organization.hasFeature(feature)) {
        return res.status(403).json({ 
          message: `Feature '${feature}' is not available in your current plan`,
          currentPlan: req.organization.subscription.plan,
          feature: feature
        });
      }

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      res.status(500).json({ message: 'Server error in feature access check' });
    }
  };
};

// Check account status
const requireActiveAccount = async (req, res, next) => {
  try {
    // Check user status
    if (req.user.status !== 'active') {
      return res.status(403).json({ 
        message: `Account is ${req.user.status}. Please contact support.`,
        status: req.user.status
      });
    }

    // Check organization status
    if (!req.organization) {
      const organization = await Organization.findById(req.user.organization);
      if (!organization) {
        return res.status(404).json({ message: 'Organization not found' });
      }
      req.organization = organization;
    }

    if (req.organization.status !== 'active') {
      return res.status(403).json({ 
        message: `Organization is ${req.organization.status}. Please contact support.`,
        status: req.organization.status
      });
    }

    // Check subscription status
    const subscriptionStatus = req.organization.subscription.status;
    if (!['active', 'trialing'].includes(subscriptionStatus)) {
      return res.status(403).json({ 
        message: `Subscription is ${subscriptionStatus}. Please update your billing information.`,
        subscriptionStatus: subscriptionStatus
      });
    }

    next();
  } catch (error) {
    console.error('Account status check error:', error);
    res.status(500).json({ message: 'Server error in account status check' });
  }
};

// API key authentication
const apiKeyAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({ message: 'API key is required' });
    }

    // Hash the provided API key
    const crypto = require('crypto');
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Find user by API key
    const user = await User.findOne({ apiKey: hashedApiKey })
      .populate('organization');

    if (!user) {
      return res.status(401).json({ message: 'Invalid API key' });
    }

    // Update last used timestamp
    user.apiKeyLastUsed = new Date();
    await user.save();

    // Check if organization has API access feature
    if (!user.organization.hasFeature('apiAccess')) {
      return res.status(403).json({ 
        message: 'API access is not available in your current plan' 
      });
    }

    // Increment API usage
    await user.organization.incrementUsage('api');

    req.user = user;
    req.organization = user.organization;
    req.isApiRequest = true;

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ message: 'Server error in API authentication' });
  }
};

// Rate limiting for API requests
const apiRateLimit = async (req, res, next) => {
  try {
    if (!req.isApiRequest) {
      return next();
    }

    // Check daily API limit
    if (!req.organization.checkUsageLimit('api')) {
      return res.status(429).json({ 
        message: 'Daily API limit exceeded',
        limit: req.organization.limits.apiCallsPerDay,
        current: req.organization.usage.apiCallsToday,
        resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000) // Next day
      });
    }

    next();
  } catch (error) {
    console.error('API rate limit error:', error);
    res.status(500).json({ message: 'Server error in API rate limiting' });
  }
};

// Default role permissions
const getDefaultPermissions = (role) => {
  const permissions = {
    super_admin: [], // Super admin has all permissions by default
    admin: [
      { resource: 'campaigns', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'templates', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'subscribers', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'segments', actions: ['create', 'read', 'update', 'delete', 'manage'] },
      { resource: 'analytics', actions: ['read', 'manage'] },
      { resource: 'settings', actions: ['read', 'update', 'manage'] },
      { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'automation', actions: ['create', 'read', 'update', 'delete', 'manage'] }
    ],
    manager: [
      { resource: 'campaigns', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'templates', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'subscribers', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'segments', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'analytics', actions: ['read'] },
      { resource: 'users', actions: ['read'] },
      { resource: 'automation', actions: ['create', 'read', 'update'] }
    ],
    editor: [
      { resource: 'campaigns', actions: ['create', 'read', 'update'] },
      { resource: 'templates', actions: ['create', 'read', 'update'] },
      { resource: 'subscribers', actions: ['create', 'read', 'update'] },
      { resource: 'segments', actions: ['create', 'read', 'update'] },
      { resource: 'analytics', actions: ['read'] }
    ],
    viewer: [
      { resource: 'campaigns', actions: ['read'] },
      { resource: 'templates', actions: ['read'] },
      { resource: 'subscribers', actions: ['read'] },
      { resource: 'segments', actions: ['read'] },
      { resource: 'analytics', actions: ['read'] }
    ],
    user: [
      { resource: 'campaigns', actions: ['create', 'read', 'update'] },
      { resource: 'templates', actions: ['create', 'read', 'update'] },
      { resource: 'subscribers', actions: ['create', 'read', 'update'] },
      { resource: 'segments', actions: ['create', 'read', 'update'] }
    ]
  };

  return permissions[role] || permissions.user;
};

module.exports = {
  rbac,
  canManageUser,
  requireOrganizationAccess,
  checkUsageLimit,
  requireFeature,
  requireActiveAccount,
  apiKeyAuth,
  apiRateLimit,
  getDefaultPermissions
};
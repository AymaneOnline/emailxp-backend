// emailxp/backend/middleware/authMiddleware.js

const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { getDefaultPermissions } = require('./rbac');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  // Verify token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // Get user from the token (excluding password)
  const user = await User.findById(decoded.id).select('-password');

  if (!user) {
    res.status(401);
    throw new Error('Not authorized, user not found');
  }

  // Initialize permissions if they haven't been set
  if (!user.permissions || user.permissions.length === 0) {
    user.permissions = getDefaultPermissions(user.role);
    await user.save();
  }

  req.user = user; // Attach user to the request object

  // Check if user is verified
  // Whitelist the profile and verification email endpoints for unverified users.
  const isVerificationRoute = req.originalUrl.startsWith('/api/users/send-verification-email') || req.originalUrl.startsWith('/users/send-verification-email');
  const isProfileRoute = req.originalUrl.startsWith('/api/users/profile') || req.originalUrl.startsWith('/users/profile');

  if (!user.isVerified && !(isVerificationRoute || isProfileRoute)) {
    res.status(403); // Forbidden
    return next(new Error('Email not verified. Please verify your email to access this feature.'));
  }

  next();
});

module.exports = { protect };
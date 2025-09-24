// emailxp/backend/controllers/userController.js

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const generateToken = require('../utils/generateToken');
const { sendEmail } = require('../utils/resendEmailService');
const crypto = require('crypto'); // Ensure crypto is imported
const { uploadProfilePicture, deleteProfilePicture, getPublicIdFromUrl } = require('../utils/fileUpload');
const { normalizeWebsite } = require('../utils/website');

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { companyOrOrganization, name, email, password, website } = req.body;

  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!companyOrOrganization || !name || !email || !password) {
    res.status(400);
    throw new Error('Please add all fields: Company/Organization, Name, Email, and Password');
  }

  // Check if user exists (normalized email)
  const userExists = await User.findOne({ email: normalizedEmail });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Use a transaction to ensure both organization and user are created together
  const session = await mongoose.startSession();
  
  let user, organization;
  
  try {
    await session.withTransaction(async () => {
      // Create organization first
      const organizationSlug = companyOrOrganization
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      // Ensure unique slug
      let uniqueSlug = organizationSlug;
      let counter = 1;
      while (await Organization.findOne({ slug: uniqueSlug }).session(session)) {
        uniqueSlug = `${organizationSlug}-${counter}`;
        counter++;
      }

      const organizationData = {
        name: companyOrOrganization,
        slug: uniqueSlug,
        email: email, // Use 'email' not 'contactEmail'
        subscription: {
          plan: 'free',
          status: 'active',
          startDate: new Date()
        },
        settings: {
          timezone: 'UTC',
          dateFormat: 'MM/DD/YYYY',
          allowUserRegistration: true,
          requireEmailVerification: true
        }
      };
      const organizations = await Organization.create([organizationData], { session });
      organization = organizations[0];

      // Create user with organization reference
      let normalizedWebsite;
      try {
        normalizedWebsite = normalizeWebsite(website);
      } catch (e) {
        res.status(400);
        throw new Error(e.message);
      }

      const userData = {
        companyOrOrganization,
        name,
  email: normalizedEmail,
        password, // Mongoose pre-save hook will hash this
        role: 'admin', // First user in organization becomes admin
        organization: organization._id,
        isVerified: false, // Default to false
        isProfileComplete: false, // Default to false
        website: normalizedWebsite || '',
        // verificationToken and verificationTokenExpires are NOT set here initially
      };

      const users = await User.create([userData], { session });
      user = users[0];

      // Update organization with actual user references
      organization.owner = user._id;
      organization.createdBy = user._id;
      await organization.save({ session });
    });
  } finally {
    await session.endSession();
  }

  if (user) {
    res.status(201).json({
      _id: user._id,
      companyOrOrganization: user.companyOrOrganization,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: {
        _id: organization._id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.subscription.plan
      },
      isVerified: user.isVerified, // Will be false
      isProfileComplete: user.isProfileComplete, // Will be false
      profilePicture: user.profilePicture,
      website: user.website,
      industry: user.industry,
      bio: user.bio,
      address: user.address,
      city: user.city,
      country: user.country,
      hasVerifiedDomain: user.hasVerifiedDomain,
      token: generateToken(user._id),
      message: 'Registration successful! Please verify your email from the dashboard.',
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate a user
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const AUTH_DEBUG = process.env.AUTH_DEBUG === '1';
  const rawEmail = (email || '').trim();
  const normalizedEmail = rawEmail.toLowerCase();

  // Primary lookup using normalized email
  let user = await User.findOne({ email: normalizedEmail })
    .select('+password')
    .populate('organization', 'name slug subscription.plan');

  // Fallback case-insensitive exact match if not found (handles legacy mixed-case stored emails)
  if(!user && rawEmail && rawEmail !== normalizedEmail){
    const escaped = rawEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    user = await User.findOne({ email: { $regex: `^${escaped}$`, $options: 'i' } })
      .select('+password')
      .populate('organization', 'name slug subscription.plan');
  }
  if(AUTH_DEBUG){
    console.warn(`[AUTH_DEBUG] Login attempt raw='${rawEmail}' norm='${normalizedEmail}' found=${!!user}`);
  }

  let passwordOk = false;
  if(user){
    try { passwordOk = await user.matchPassword(password); } catch(_) { passwordOk = false; }
  }
  if(AUTH_DEBUG){
    console.warn(`[AUTH_DEBUG] Password match=${passwordOk}`);
  }

  if (user && passwordOk) {
    res.json({
      _id: user._id,
      companyOrOrganization: user.companyOrOrganization,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization ? {
        _id: user.organization._id,
        name: user.organization.name,
        slug: user.organization.slug,
        plan: user.organization.subscription?.plan || 'free'
      } : null,
      isVerified: user.isVerified, // Include verification status
      isProfileComplete: user.isProfileComplete, // Include profile completion status
      profilePicture: user.profilePicture,
      website: user.website,
      industry: user.industry,
      bio: user.bio,
      address: user.address,
      city: user.city,
      country: user.country,
      hasVerifiedDomain: user.hasVerifiedDomain,
      token: generateToken(user._id),
    });
  } else {
    // Explicit JSON response for invalid credentials to avoid HTML/redirects
    return res.status(401).json({ message: 'Invalid credentials' });
  }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = asyncHandler(async (req, res) => {
  // req.user is set by the protect middleware
  const user = await User.findById(req.user.id).select('-password'); // Exclude password

  if (user) {
    res.json({
      _id: user._id,
      companyOrOrganization: user.companyOrOrganization,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      isProfileComplete: user.isProfileComplete,
      profilePicture: user.profilePicture,
      website: user.website,
      industry: user.industry,
      bio: user.bio,
      address: user.address,
      city: user.city,
      country: user.country,
      hasVerifiedDomain: user.hasVerifiedDomain,
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.companyOrOrganization = req.body.companyOrOrganization || user.companyOrOrganization;
    // Website normalization (allow clearing with empty string)
    if ('website' in req.body) {
      try {
        const normalized = normalizeWebsite(req.body.website);
        user.website = normalized === undefined ? user.website : normalized; // undefined means no change
      } catch (e) {
        res.status(400);
        throw new Error(e.message);
      }
    }
    user.industry = req.body.industry || user.industry;
    user.bio = req.body.bio || user.bio;
  if ('address' in req.body) user.address = req.body.address || '';
  if ('city' in req.body) user.city = req.body.city || '';
  if ('country' in req.body) user.country = req.body.country || '';

    // Set isProfileComplete to true if all required fields are present
    // This logic should ideally be handled on the frontend and sent as part of the payload,
    // but we can also set it here if all fields are updated.
    if (user.companyOrOrganization && user.name && user.email && !user.isProfileComplete) {
      user.isProfileComplete = true;
    }

    if (req.body.password) {
      user.password = req.body.password; // Pre-save hook will hash this
    }

    const updatedUser = await user.save(); // Password will be re-hashed if modified

    res.json({
      _id: updatedUser._id,
      companyOrOrganization: updatedUser.companyOrOrganization,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      isVerified: updatedUser.isVerified,
      isProfileComplete: updatedUser.isProfileComplete,
      profilePicture: updatedUser.profilePicture,
      website: updatedUser.website,
      industry: updatedUser.industry,
      bio: updatedUser.bio,
      address: updatedUser.address,
      city: updatedUser.city,
      country: updatedUser.country,
      hasVerifiedDomain: updatedUser.hasVerifiedDomain,
      token: generateToken(updatedUser._id),
    });
  } else {
    res.status(404);
    throw new Error('User not found');
  }
});

// @desc    Upload profile picture
// @route   POST /api/users/profile-picture
// @access  Private
const uploadProfilePictureHandler = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('No file uploaded');
  }

  try {
    console.log('File uploaded successfully:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    // Delete old profile picture if it exists
    if (user.profilePicture) {
      const oldPublicId = getPublicIdFromUrl(user.profilePicture);
      if (oldPublicId) {
        console.log('Deleting old profile picture:', oldPublicId);
        await deleteProfilePicture(oldPublicId);
      }
    }

    // Update user with new profile picture URL
    user.profilePicture = req.file.path;
    await user.save();

    console.log('Profile picture updated successfully:', user.profilePicture);

    res.json({
      success: true,
      profilePicture: user.profilePicture,
      message: 'Profile picture uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500);
    throw new Error(`Failed to upload profile picture: ${error.message}`);
  }
});

// @desc    Verify user email
// @route   GET /api/users/verify-email/:token
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
  // --- DEBUGGING LINE ---
  console.log('Type of crypto.createHash:', typeof crypto.createHash);
  // --- END DEBUGGING LINE ---

  // Hash the token from the URL to compare with the stored hashed token
  const verificationToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    verificationToken,
    verificationTokenExpires: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400);
    // Redirect to a frontend error page or display a message
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=invalid_or_expired_token`);
  }

  user.isVerified = true;
  user.verificationToken = undefined; // Clear the token
  user.verificationTokenExpires = undefined; // Clear the expiry
  await user.save({ validateBeforeSave: false }); // Save without re-running password hash pre-save hook

  // Redirect to the dashboard on the frontend with a success flag
  res.redirect(`${process.env.FRONTEND_URL}/dashboard?verified=true`);
});

// @desc    Send (or resend) verification email
// @route   POST /api/users/send-verification-email
// @access  Private (user must be logged in but not verified)
const sendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.isVerified) {
    res.status(400);
    throw new Error('Email is already verified');
  }

  // Generate new token and save it to the user document
  const verificationToken = user.getVerificationToken(); // This method is on the User model
  await user.save({ validateBeforeSave: false }); // Save the user with the new token

  // Construct verification URL (API endpoint that finalizes verification & redirects)
  const verificationUrl = `${req.protocol}://${req.get('host')}/api/users/verify-email/${verificationToken}`;

  // Build branded template
  const { buildVerificationEmail } = require('../utils/emailTemplates/verificationEmail');
  const { subject, html, text } = buildVerificationEmail({
    userName: user.name,
    verificationUrl,
    website: user.website || ''
  });

  try {
    await sendEmail({
      to: user.email,
      subject,
      html,
      text,
      from: process.env.EMAIL_FROM,
      fromName: 'EmailXP'
    });
    return res.status(200).json({ message: 'Verification email sent successfully! Please check your inbox.' });
  } catch (emailError) {
    console.error('Error sending verification email:', emailError);
    if (emailError?.sandbox) {
      return res.status(409).json({
        message: 'Domain not verified yet – verification email not sent.',
        sandbox: true
      });
    }
    return res.status(500).json({ message: 'Failed to send verification email. Please try again later.' });
  }
});


module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  uploadProfilePictureHandler,
  verifyEmail,
  sendVerificationEmail,
};

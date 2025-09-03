// emailxp/backend/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  uploadProfilePictureHandler,
  verifyEmail,
  sendVerificationEmail, // Import the renamed function
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { check } = require('express-validator');
const { validate } = require('../middleware/validationMiddleware');
const { authLimiter } = require('../middleware/rateLimitMiddleware');
const { uploadProfilePicture, handleUploadError } = require('../utils/fileUpload');

router.post('/register',
  authLimiter,
  validate([
    check('companyOrOrganization').notEmpty().withMessage('Company/Organization is required'),
    check('name').notEmpty().withMessage('Name is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ]),
  registerUser
);
router.post('/login',
  authLimiter,
  validate([
    check('email').isEmail().withMessage('Valid email is required'),
    check('password').notEmpty().withMessage('Password is required'),
  ]),
  loginUser
);
router.get('/profile', protect, getUserProfile);
router.put('/profile', protect, updateUserProfile);
router.post('/profile-picture', protect, uploadProfilePicture, handleUploadError, uploadProfilePictureHandler);
router.get('/verify-email/:token', verifyEmail); // Public route for email verification
router.post('/send-verification-email', protect, sendVerificationEmail); // New route: send (or resend) verification email

module.exports = router;

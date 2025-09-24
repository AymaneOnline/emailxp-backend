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
const rateLimit = require('express-rate-limit');

// Lightweight per-user/email limiter for verification email resends
const verificationEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 5, // max attempts per IP in window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many verification email requests. Please try again later.' }
});

// Additional custom cooldown (e.g., 60s) stored server-side to align with client cooldown
const verificationCooldowns = new Map(); // key: userId, value: timestamp when can request again
function verificationCooldown(req, res, next){
  if(!req.user) return res.status(401).json({ message: 'Not authorized' });
  const now = Date.now();
  const until = verificationCooldowns.get(req.user.id) || 0;
  if (now < until) {
    const remaining = Math.ceil((until - now)/1000);
    return res.status(429).json({ message: `Please wait ${remaining}s before requesting another verification email.` });
  }
  // set new cooldown 60s
  verificationCooldowns.set(req.user.id, now + 60*1000);
  next();
}
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
router.post('/send-verification-email', protect, verificationEmailLimiter, verificationCooldown, sendVerificationEmail); // send (or resend) verification email with rate limiting

module.exports = router;

// emailxp/backend/middleware/rateLimitMiddleware.js

const rateLimit = require('express-rate-limit');

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    message: 'Too many requests from this IP, please try again after a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for domain verification (more restrictive)
const domainVerificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 domain verification requests per windowMs
  message: {
    message: 'Too many domain verification attempts. Please wait 5 minutes before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for domain creation
const domainCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 domain creation requests per windowMs
  message: {
    message: 'Too many domains created. Please wait 15 minutes before creating another domain.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  domainVerificationLimiter,
  domainCreationLimiter
};

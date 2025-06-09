const express = require('express');
const router = express.Router();
const { trackOpen } = require('../controllers/trackingController');

// This route does NOT require authentication because it's hit by email clients
// which don't have user tokens.
router.get('/open/:campaignId/:subscriberId', trackOpen);

module.exports = router;
// emailxp/backend/routes/trackingRoutes.js
const express = require('express');
const router = express.Router();
const { trackOpen, trackClick } = require('../controllers/trackingController'); // --- MODIFIED: Import trackClick ---

// This route does NOT require authentication because it's hit by email clients
// which don't have user tokens.

router.get('/open/:campaignId/:subscriberId', trackOpen);

// --- NEW ROUTE: For click tracking ---
// The actual URL being clicked will be passed as a query parameter (e.g., ?url=...)
router.get('/click/:campaignId/:subscriberId', trackClick);

module.exports = router;
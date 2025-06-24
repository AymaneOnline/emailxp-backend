// emailxp/backend/routes/trackingRoutes.js

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

// --- Manual Tracking Routes ---
// Route for open tracking pixel
router.get('/track/open', trackingController.trackOpen);

// Route for click tracking and redirection
router.get('/track/click', trackingController.trackClick);

// Route for your custom unsubscribe link (GET requests from email clicks) - this remains
router.get('/unsubscribe/:subscriberId', trackingController.unsubscribe);

// Optional: Add a test route to verify endpoint is working
router.get('/test', (req, res) => { // Changed from /webhook/test to just /test
    res.status(200).json({ 
        message: 'Tracking endpoint is accessible',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
// emailxp/backend/routes/trackingRoutes.js

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

// Route for SendGrid Webhook events (POST requests from SendGrid)
// The verification middleware will handle signature verification and body parsing
router.post('/webhook', trackingController.verifyWebhookSignature, trackingController.handleWebhook);

// Route for your custom unsubscribe link (GET requests from email clicks)
router.get('/unsubscribe/:subscriberId', trackingController.unsubscribe);

// Optional: Add a test route to verify webhook endpoint is working
router.get('/webhook/test', (req, res) => {
    res.status(200).json({ 
        message: 'Webhook endpoint is accessible',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
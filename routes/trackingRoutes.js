// emailxp/backend/routes/trackingRoutes.js

const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

// Route for SendGrid Webhook events (POST requests from SendGrid)
router.post('/webhook', trackingController.handleWebhook);

// Route for your custom unsubscribe link (GET requests from email clicks)
router.get('/unsubscribe/:subscriberId', trackingController.unsubscribe);

module.exports = router;
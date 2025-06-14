const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually, // Renamed for clarity in controller import
    getCampaignOpenStats,
    getCampaignClickStats,
    getDashboardStats,
    getCampaignAnalytics,
    handleSendGridWebhook, // <--- NEW IMPORT: Import the new webhook handler
} = require('../controllers/campaignController');

// All campaign routes are protected

// --- IMPORTANT: Place more specific routes BEFORE more general ones ---

// Dashboard Analytics (overall)
router.get('/dashboard-stats', protect, getDashboardStats);

// Campaign Specific Analytics - NEW ROUTE
router.get('/:id/analytics', protect, getCampaignAnalytics);

router.route('/')
    .get(protect, getCampaigns)
    .post(protect, createCampaign);

router.route('/:id')
    .get(protect, getCampaignById)
    .put(protect, updateCampaign)
    .delete(protect, deleteCampaign);

// Route for manual campaign sending
router.post('/:id/send', protect, sendCampaignManually); // Using the renamed function

// Routes for raw tracking statistics
router.get('/:id/opens', protect, getCampaignOpenStats);
router.get('/:id/clicks', protect, getCampaignClickStats);

// --- NEW ROUTE FOR SENDGRID WEBHOOKS ---
// This route should NOT be protected by 'protect' middleware
// SendGrid will POST event data to this URL
router.post('/webhooks/sendgrid', handleSendGridWebhook); // <--- ADDED ROUTE

module.exports = router;
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
    // REMOVED: getCampaignOpenStats, getCampaignClickStats as they are no longer in campaignController.js
    getDashboardStats,
    getCampaignAnalytics,
    // REMOVED: handleSendGridWebhook as it is now in trackingController.js
} = require('../controllers/campaignController');

// All campaign routes are protected (except external webhooks which are handled elsewhere)

// --- IMPORTANT: Place more specific routes BEFORE more general ones ---

// Dashboard Analytics (overall)
router.get('/dashboard-stats', protect, getDashboardStats);

// Campaign Specific Analytics - This is the consolidated analytics route
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

module.exports = router;
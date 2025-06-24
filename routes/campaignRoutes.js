// emailxp/backend/routes/campaignRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign: sendCampaignManually,
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries, // Import the new function
} = require('../controllers/campaignController');

// All campaign routes are protected (except external webhooks which are handled elsewhere)

// --- IMPORTANT: Place more specific routes BEFORE more general ones ---

// Dashboard Analytics (overall)
router.get('/dashboard-stats', protect, getDashboardStats);

// Campaign Specific Analytics - This is the consolidated analytics route
router.get('/:id/analytics', protect, getCampaignAnalytics);

// Add this new route for time-series analytics
router.get('/:id/analytics/time-series', protect, getCampaignAnalyticsTimeSeries);

router.route('/')
    .get(protect, getCampaigns)
    .post(protect, createCampaign);

router.route('/:id')
    .get(protect, getCampaignById)
    .put(protect, updateCampaign)
    .delete(protect, deleteCampaign);

// Route for manual campaign sending
router.post('/:id/send', protect, sendCampaignManually);

module.exports = router;
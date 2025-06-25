// emailxp/backend/routes/campaignRoutes.js

const express = require('express');
const router = express.Router();
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendTestEmail,
    sendCampaign, // NOW CORRECTLY IMPORTS 'sendCampaign'
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries // NEW: Import the new controller function
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

// Protect all campaign routes
router.use(protect);

router.route('/')
    .get(getCampaigns)
    .post(createCampaign);

router.route('/:id')
    .get(getCampaignById)
    .put(updateCampaign)
    .delete(deleteCampaign);

router.post('/:id/send-test', sendTestEmail);
router.post('/:id/send', sendCampaign); // Uses the correctly imported 'sendCampaign'

router.get('/dashboard-stats', getDashboardStats);

// Route for campaign-specific analytics
router.get('/:id/analytics', getCampaignAnalytics);
// Route for time-series analytics
router.get('/:id/analytics/time-series', getCampaignAnalyticsTimeSeries); // Use :id for campaign ID

module.exports = router;
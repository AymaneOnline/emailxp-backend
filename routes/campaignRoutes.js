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
    sendCampaign, // This should now correctly import the function
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries
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
router.post('/:id/send', sendCampaign); // Now 'sendCampaign' should be a valid function

router.get('/dashboard-stats', getDashboardStats);

router.get('/:id/analytics', getCampaignAnalytics);
router.get('/:id/analytics/time-series', getCampaignAnalyticsTimeSeries);

module.exports = router;
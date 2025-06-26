// emailxp/backend/routes/campaignRoutes.js

const express = require('express');
const router = express.Router();
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendTestEmail, // Will now be imported correctly
    sendCampaign,
    getDashboardStats,
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries
} = require('../controllers/campaignController'); // Import directly from module.exports
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

router.post('/:id/send-test', sendTestEmail); // This should now work!
router.post('/:id/send', sendCampaign);

router.get('/dashboard-stats', getDashboardStats);

router.get('/:id/analytics', getCampaignAnalytics);
router.get('/:id/analytics/time-series', getCampaignAnalyticsTimeSeries);

module.exports = router;
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
    sendCampaign,
    getDashboardStats, // Make sure this is still imported
    getCampaignAnalytics,
    getCampaignAnalyticsTimeSeries
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

// Protect all campaign routes
router.use(protect);

// IMPORTANT: Place the more specific dashboard-stats route BEFORE the general :id routes
router.get('/dashboard-stats', getDashboardStats); // THIS LINE MOVED UP!

router.route('/')
    .get(getCampaigns)
    .post(createCampaign);

router.route('/:id')
    .get(getCampaignById)
    .put(updateCampaign)
    .delete(deleteCampaign);

router.post('/:id/send-test', sendTestEmail);
router.post('/:id/send', sendCampaign);

router.get('/:id/analytics', getCampaignAnalytics);
router.get('/:id/analytics/time-series', getCampaignAnalyticsTimeSeries);

module.exports = router;
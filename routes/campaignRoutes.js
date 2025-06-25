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
    getDashboardStats,
    getCampaignAnalytics // NEW: Import the new controller function
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
router.post('/:id/send', sendCampaign);

router.get('/dashboard-stats', getDashboardStats); // This was already there

// NEW ROUTE: Get analytics for a specific campaign
router.get('/:id/analytics', getCampaignAnalytics); // Use :id for campaign ID

module.exports = router;
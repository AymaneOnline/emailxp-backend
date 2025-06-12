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
    sendCampaign,
    getCampaignOpenStats,
    getCampaignClickStats,
    getDashboardStats, // <--- ADDED: Import new dashboard stats function
} = require('../controllers/campaignController');

// All campaign routes are protected
router.route('/')
    .get(protect, getCampaigns)
    .post(protect, createCampaign);

router.route('/:id')
    .get(protect, getCampaignById)
    .put(protect, updateCampaign)
    .delete(protect, deleteCampaign);

// Route for manual campaign sending
router.post('/:id/send', protect, sendCampaign);

// Routes for tracking statistics
router.get('/:id/opens', protect, getCampaignOpenStats);
router.get('/:id/clicks', protect, getCampaignClickStats);

// --- NEW ROUTE FOR DASHBOARD ANALYTICS ---
router.get('/dashboard-stats', protect, getDashboardStats); // <--- ADDED ROUTE
// --- END NEW ROUTE ---

module.exports = router;
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
    getDashboardStats, // Import new dashboard stats function
} = require('../controllers/campaignController');

// All campaign routes are protected

// --- IMPORTANT: Place more specific routes BEFORE more general ones ---

// NEW ROUTE FOR DASHBOARD ANALYTICS - MUST BE BEFORE /:id
router.get('/dashboard-stats', protect, getDashboardStats);

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


module.exports = router;
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
    getDashboardStats,
    getCampaignAnalytics, // <--- NEW IMPORT: Import the new function
} = require('../controllers/campaignController');

// All campaign routes are protected

// --- IMPORTANT: Place more specific routes BEFORE more general ones ---

// Dashboard Analytics (overall)
router.get('/dashboard-stats', protect, getDashboardStats);

// Campaign Specific Analytics - NEW ROUTE
router.get('/:id/analytics', protect, getCampaignAnalytics); // <--- ADDED ROUTE: Placed before /:id

router.route('/')
    .get(protect, getCampaigns)
    .post(protect, createCampaign);

router.route('/:id')
    .get(protect, getCampaignById)
    .put(protect, updateCampaign)
    .delete(protect, deleteCampaign);

// Route for manual campaign sending
router.post('/:id/send', protect, sendCampaign);

// Routes for raw tracking statistics
router.get('/:id/opens', protect, getCampaignOpenStats);
router.get('/:id/clicks', protect, getCampaignClickStats);


module.exports = router;
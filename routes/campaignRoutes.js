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
    sendCampaignManually, // <--- Add this
    getCampaignOpenStats,
    getCampaignClickStats,
} = require('../controllers/campaignController');

// All campaign routes are protected
router.route('/')
    .get(protect, getCampaigns)
    .post(protect, createCampaign);

router.route('/:id')
    .get(protect, getCampaignById)
    .put(protect, updateCampaign)
    .delete(protect, deleteCampaign);

// New route for manual campaign sending
router.post('/:id/send', protect, sendCampaignManually); // <--- Add this route

// Routes for tracking statistics (already present from previous steps)
router.get('/:id/opens', protect, getCampaignOpenStats);
router.get('/:id/clicks', protect, getCampaignClickStats);


module.exports = router;
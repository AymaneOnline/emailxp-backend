const express = require('express');
const router = express.Router();
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

// Campaign Management Routes
router.route('/')
    .get(protect, getCampaigns)    // Get all campaigns for authenticated user
    .post(protect, createCampaign); // Create a new campaign

router.route('/:id')
    .get(protect, getCampaignById)    // Get a single campaign by ID
    .put(protect, updateCampaign)     // Update a campaign
    .delete(protect, deleteCampaign); // Delete a campaign

router.post('/:id/send', protect, sendCampaign); // POST request to trigger sending

module.exports = router;
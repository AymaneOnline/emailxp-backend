// emailxp/backend/routes/campaignRoutes.js

const express = require('express');
const router = express.Router();
const {
    getCampaigns,
    createCampaign,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
    getCampaignOpenStats,
    getCampaignClickStats, // Ensure this is imported from your controller
} = require('../controllers/campaignController');
const { protect } = require('../middleware/authMiddleware');

// Campaign Management Routes
router.route('/')
    .get(protect, getCampaigns)      // Get all campaigns for authenticated user
    .post(protect, createCampaign); // Create a new campaign

router.route('/:id')
    .get(protect, getCampaignById)     // Get a single campaign by ID
    .put(protect, updateCampaign)      // Update a campaign
    .delete(protect, deleteCampaign);  // Delete a campaign

router.post('/:id/send', protect, sendCampaign); // POST request to trigger sending

router.get('/:campaignId/opens', protect, getCampaignOpenStats); // Route for Open Stats

// --- NEW ROUTE: Get Click Stats for a specific campaign ---
// Note: Frontend uses '/api/campaigns/:campaignId/clicks'
// This matches your frontend's `getCampaignClickStats` in `campaignService.js`
router.get('/:campaignId/clicks', protect, getCampaignClickStats);

module.exports = router;
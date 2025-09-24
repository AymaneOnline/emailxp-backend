// emailxp/backend/routes/abTestRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const abTestService = require('../services/abTestService');

// Protect all A/B testing routes
router.use(protect);

// Create a new A/B test
router.post('/', async (req, res) => {
  try {
    const { campaignData, abTestData } = req.body;
    
    // Validation
    if (!campaignData || !abTestData) {
      return res.status(400).json({ message: 'Campaign data and A/B test data are required' });
    }
    
    const result = await abTestService.createABTest(req.user, campaignData, abTestData);
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating A/B test:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Get all A/B tests for user
router.get('/', async (req, res) => {
  try {
    const filters = {};
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.campaign) {
      filters.campaign = req.query.campaign;
    }
    
    const abTests = await abTestService.getABTests(req.user, filters);
    
    res.json(abTests);
  } catch (error) {
    console.error('Error fetching A/B tests:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Get a specific A/B test
router.get('/:id', async (req, res) => {
  try {
    const abTest = await abTestService.getABTestResults(req.user, req.params.id);
    
    if (!abTest) {
      return res.status(404).json({ message: 'A/B test not found' });
    }
    
    res.json(abTest);
  } catch (error) {
    console.error('Error fetching A/B test:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
});

// Start an A/B test
router.post('/:id/start', async (req, res) => {
  try {
    const abTest = await abTestService.startABTest(req.user, req.params.id);
    
    res.json(abTest);
  } catch (error) {
    console.error('Error starting A/B test:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// Stop an A/B test
router.post('/:id/stop', async (req, res) => {
  try {
    const abTest = await abTestService.stopABTest(req.user, req.params.id);
    
    res.json(abTest);
  } catch (error) {
    console.error('Error stopping A/B test:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// Declare a winner for an A/B test
router.post('/:id/declare-winner', async (req, res) => {
  try {
    const { variantId } = req.body;
    const abTest = await abTestService.declareWinner(req.user, req.params.id, variantId);
    
    res.json(abTest);
  } catch (error) {
    console.error('Error declaring A/B test winner:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

// Delete an A/B test
router.delete('/:id', async (req, res) => {
  try {
    const result = await abTestService.deleteABTest(req.user, req.params.id);
    
    res.json(result);
  } catch (error) {
    console.error('Error deleting A/B test:', error);
    res.status(400).json({ message: error.message || 'Server error' });
  }
});

module.exports = router;
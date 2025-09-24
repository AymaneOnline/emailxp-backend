// emailxp/backend/routes/recommendations.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { rbac } = require('../middleware/rbac');
const recommendationEngine = require('../services/recommendationEngine');

// Get content recommendations for a subscriber
router.get('/subscriber/:subscriberId', protect, rbac('campaigns', 'read'), async (req, res) => {
  try {
    const { limit = 10, contentType = 'template' } = req.query;
    
    const recommendations = await recommendationEngine.getRecommendations(
      req.user.id,
      req.params.subscriberId,
      { limit: parseInt(limit), contentType }
    );
    
    res.json(recommendations);
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get personalized content for a subscriber
router.get('/personalized/:subscriberId', protect, rbac('campaigns', 'read'), async (req, res) => {
  try {
    const { contentType = 'template' } = req.query;
    
    const content = await recommendationEngine.getPersonalizedContent(
      req.user.id,
      req.params.subscriberId,
      { contentType }
    );
    
    res.json(content);
  } catch (error) {
    console.error('Error fetching personalized content:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update recommendations with feedback
router.post('/feedback', protect, rbac('campaigns', 'read'), async (req, res) => {
  try {
    const { subscriberId, contentId, feedback } = req.body;
    
    if (!subscriberId || !contentId || !feedback) {
      return res.status(400).json({ message: 'subscriberId, contentId, and feedback are required' });
    }
    
    await recommendationEngine.updateRecommendationsWithFeedback(
      req.user.id,
      subscriberId,
      contentId,
      feedback
    );
    
    res.json({ message: 'Feedback recorded successfully' });
  } catch (error) {
    console.error('Error recording feedback:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get subscriber engagement profile
router.get('/profile/:subscriberId', protect, rbac('subscribers', 'read'), async (req, res) => {
  try {
    const profile = await recommendationEngine.getSubscriberEngagementProfile(
      req.params.subscriberId
    );
    
    res.json(profile);
  } catch (error) {
    console.error('Error fetching engagement profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get recommendations for multiple subscribers
router.post('/batch', protect, rbac('campaigns', 'read'), async (req, res) => {
  try {
    const { subscriberIds, limit = 5, contentType = 'template' } = req.body;
    
    if (!subscriberIds || !Array.isArray(subscriberIds)) {
      return res.status(400).json({ message: 'subscriberIds array is required' });
    }
    
    const batchRecommendations = {};
    
    for (const subscriberId of subscriberIds) {
      try {
        const recommendations = await recommendationEngine.getRecommendations(
          req.user.id,
          subscriberId,
          { limit, contentType }
        );
        batchRecommendations[subscriberId] = recommendations;
      } catch (error) {
        console.error(`Error fetching recommendations for subscriber ${subscriberId}:`, error);
        batchRecommendations[subscriberId] = [];
      }
    }
    
    res.json(batchRecommendations);
  } catch (error) {
    console.error('Error fetching batch recommendations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
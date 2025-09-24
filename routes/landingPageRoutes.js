const express = require('express');
const router = express.Router();
const landingPageController = require('../controllers/landingPageController');
const { protect } = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.route('/')
  .get(protect, landingPageController.getLandingPages)
  .post(protect, landingPageController.createLandingPage);

router.route('/:id')
  .get(protect, landingPageController.getLandingPageById)
  .put(protect, landingPageController.updateLandingPage)
  .delete(protect, landingPageController.deleteLandingPage);

router.route('/:id/conversion')
  .post(protect, landingPageController.recordConversion);

// Public route (no authentication required)
router.route('/public/:slug')
  .get(landingPageController.getLandingPageBySlug);

module.exports = router;
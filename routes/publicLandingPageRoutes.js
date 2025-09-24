const express = require('express');
const router = express.Router();
const landingPageController = require('../controllers/landingPageController');

// Public route to serve landing pages by slug
router.route('/landing/:slug')
  .get(landingPageController.getLandingPageBySlug);

module.exports = router;
const express = require('express');
const router = express.Router();
const AudienceController = require('../controllers/audienceController');
const { protect } = require('../middleware/authMiddleware');

// protect these endpoints
router.use(protect);

router.post('/estimate', AudienceController.estimate);
router.post('/sample', AudienceController.sample);

module.exports = router;

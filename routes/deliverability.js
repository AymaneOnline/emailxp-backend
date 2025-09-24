const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { summary, trends, getInsights } = require('../services/deliverabilityMetricsService');

router.use(protect);

router.get('/summary', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30',10);
    const data = await summary({ userId: req.user.id, days });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '14',10);
    const data = await trends({ userId: req.user.id, days });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.get('/insights', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const data = await getInsights({ userId: req.user.id, days });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;

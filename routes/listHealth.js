const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const listHealthService = require('../services/listHealthService');
const asyncHandler = require('express-async-handler');

router.get('/', protect, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days||'30',10);
  const data = await listHealthService.getListHealth({ userId: req.user._id, days });
  res.json(data);
}));

module.exports = router;

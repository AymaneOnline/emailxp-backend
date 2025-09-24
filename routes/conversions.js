const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const ConversionEvent = require('../models/ConversionEvent');
const asyncHandler = require('express-async-handler');

// Authenticated ingestion (server-to-server)
router.post('/', protect, asyncHandler(async (req, res) => {
  const { type, value = 0, currency = 'USD', subscriberId, campaignId, metadata } = req.body;
  if (!type) return res.status(400).json({ message: 'type required' });
  const evt = await ConversionEvent.create({
    user: req.user._id,
    organization: req.user.organization,
    subscriberId, campaignId, type, value, currency, metadata,
    attribution: { model: 'last_touch', source: 'api' }
  });
  res.status(201).json({ id: evt._id });
}));

// Lightweight pixel: /api/conversions/pixel.gif?u=USER_ID&c=CAMPAIGN_ID&s=SUBSCRIBER_ID&t=signup&v=123
router.get('/pixel.gif', asyncHandler(async (req, res) => {
  const { u, c, s, t, v } = req.query;
  if (!u || !t) {
    // Always return a 1x1 gif even if invalid to avoid revealing logic
    return sendGif(res);
  }
  try {
    await ConversionEvent.create({
      user: u,
      organization: null, // Could be resolved by lookup; left null for minimal pixel ingestion
      subscriberId: s || null,
      campaignId: c || null,
      type: t,
      value: v ? Number(v) : 0,
      attribution: { model: 'last_touch', source: 'pixel' }
    });
  } catch (e) {
    // swallow errors for pixel
  }
  sendGif(res);
}));

function sendGif(res){
  const gif = Buffer.from('R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==','base64');
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
  res.end(gif);
}

// Simple metrics aggregation (for funnel extension) - sums by user timeframe
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;
  const days = parseInt(timeframe) || 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const pipeline = [
    { $match: { user: req.user._id, occurredAt: { $gte: start } } },
    { $group: { _id: '$type', total: { $sum: 1 }, value: { $sum: '$value' } } }
  ];
  const rows = await ConversionEvent.aggregate(pipeline);
  res.json({ timeframe, types: rows });
}));

module.exports = router;

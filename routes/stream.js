const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');
const analyticsService = require('../services/analyticsService');
const { summary } = require('../services/deliverabilityMetricsService');

// Simple in-memory rate limiter (per process) to avoid abuse (basic)
const clientConnections = new Map();

// GET /api/stream/token - returns a short-lived token for SSE auth
router.get('/token', protect, (req, res) => {
  try {
    // Create a short-lived token (5 minutes) containing user id
    const token = jwt.sign(
      { id: req.user._id, type: 'sse' },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate token' });
  }
});

router.get('/', async (req, res) => {
  let user;
  const token = req.query.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'sse') throw new Error('Invalid token type');
      // Get user
      user = await User.findById(decoded.id).select('-password');
      if (!user) throw new Error('User not found');
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  } else {
    // Fallback to header auth for backward compatibility
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
      return res.status(401).json({ message: 'No auth provided' });
    }
    try {
      const authToken = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
      user = await User.findById(decoded.id).select('-password');
      if (!user) throw new Error('User not found');
    } catch (error) {
      return res.status(401).json({ message: 'Invalid auth' });
    }
  }

  req.user = user; // Set for the rest of the handler
  // Basic per-user connection limit (1 active)
  const existing = clientConnections.get(req.user._id.toString());
  if (existing) {
    res.status(429).json({ message: 'Stream already open' });
    return;
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.flushHeaders && res.flushHeaders();

  const userKey = req.user._id.toString();
  clientConnections.set(userKey, res);

  let lastFunnelSignature = null;
  let closed = false;

  function send(event, data) {
    if (closed) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  // Heartbeat (comment line keeps connection alive through proxies)
  const heartbeat = setInterval(() => {
    if (!closed) res.write(`:keep-alive ${Date.now()}\n\n`);
  }, 25000);

  const intervalMs = parseInt(process.env.SSE_INTERVAL_MS || '15000', 10);

  const tick = setInterval(async () => {
    try {
      // Deliverability snapshot (30d window for rates)
      const deliverability = await summary({ userId: req.user._id, days: 30 });
      // Light trim
      const deliverabilitySnapshot = {
        attempted: deliverability.attempted,
        delivered: deliverability.delivered,
        openRate: deliverability.openRate,
        clickRate: deliverability.clickRate,
        bounceRate: deliverability.bounceRate,
        complaintRate: deliverability.complaintRate
      };

      // Funnel (30d window)
      const funnel = await analyticsService.getEngagementFunnel(req.user._id, '30d');
      const signature = funnel.stages.map(s => `${s.key}:${s.value ?? 0}`).join('|');

      // Emit metric snapshot always
      send('metric.snapshot', { ts: Date.now(), deliverability: deliverabilitySnapshot });

      if (signature !== lastFunnelSignature) {
        lastFunnelSignature = signature;
        send('funnel.delta', { ts: Date.now(), stages: funnel.stages });
      }
    } catch (e) {
      send('stream.error', { message: e.message });
    }
  }, intervalMs);

  req.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    clearInterval(tick);
    clientConnections.delete(userKey);
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const analyticsService = require('../services/analyticsService');
const { summary } = require('../services/deliverabilityMetricsService');

// Simple in-memory rate limiter (per process) to avoid abuse (basic)
const clientConnections = new Map();

router.get('/', protect, async (req, res) => {
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

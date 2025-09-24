const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Lightweight auth that allows unverified users (for onboarding analytics capture)
async function softAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user; // even if not verified
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Not authorized' });
  }
}
const OnboardingEvent = require('../models/OnboardingEvent');

// POST /api/analytics-events
// Body: { events: [{ event: string, payload?: object, ts?: number }] }
router.post('/', softAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: 'events array required' });
    }
    const docs = events.slice(0, 100).map(e => ({
      userId,
      event: e.event,
      payload: e.payload || {},
      ts: e.ts ? new Date(e.ts) : new Date()
    })).filter(d => d.event);
    if (docs.length === 0) return res.status(400).json({ message: 'no valid events' });
    await OnboardingEvent.insertMany(docs, { ordered: false });
    res.status(201).json({ stored: docs.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

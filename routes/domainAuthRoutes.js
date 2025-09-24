const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const domainAuthService = require('../services/domainAuthService');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', protect, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  if (!domain) {
    res.status(400); throw new Error('Domain is required');
  }
  const record = await domainAuthService.createDomain({ domain, organization: req.user.organization, user: req.user._id });
  res.status(201).json({ domain: record.domain, dkim: domainAuthService.buildDkimRecord(record), spf: domainAuthService.buildSpfRecord(record.domain), tracking: domainAuthService.buildTrackingCname(record), status: record.status, id: record._id, isPrimary: record.isPrimary });
}));

router.get('/', protect, asyncHandler(async (req, res) => {
  const list = await domainAuthService.listDomains({ organization: req.user.organization });
  res.json(list.map(d => ({ _id: d._id, domain: d.domain, status: d.status, dkimVerified: d.dkimVerified, spfVerified: d.spfVerified, trackingVerified: d.trackingVerified, lastCheckedAt: d.lastCheckedAt, isPrimary: d.isPrimary })));
}));

router.get('/:id', protect, asyncHandler(async (req, res) => {
  const d = await domainAuthService.getDomain(req.params.id);
  if (!d) { res.status(404); throw new Error('Domain not found'); }
  res.json({ ...d, dkimRecord: domainAuthService.buildDkimRecord(d), spfRecord: domainAuthService.buildSpfRecord(d.domain), trackingRecord: domainAuthService.buildTrackingCname(d), isPrimary: d.isPrimary });
}));

router.post('/:id/regenerate-dkim', protect, asyncHandler(async (req, res) => {
  const updated = await domainAuthService.regenerateDkim(req.params.id);
  res.json({ id: updated._id, dkim: domainAuthService.buildDkimRecord(updated), status: updated.status });
}));

router.post('/:id/verify', protect, asyncHandler(async (req, res) => {
  const existing = await domainAuthService.getDomain(req.params.id);
  if (!existing) { res.status(404); throw new Error('Domain not found'); }
  const verified = await domainAuthService.verifyDns(existing);
  res.json({ id: verified._id, status: verified.status, dkimVerified: verified.dkimVerified, spfVerified: verified.spfVerified, trackingVerified: verified.trackingVerified, lastCheckedAt: verified.lastCheckedAt, isPrimary: verified.isPrimary });
}));

module.exports = router;

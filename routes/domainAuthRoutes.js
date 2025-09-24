const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const { domainVerificationLimiter, domainCreationLimiter } = require('../middleware/rateLimitMiddleware');
const domainAuthService = require('../services/domainAuthService');
const cloudflareService = require('../services/cloudflareService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/sending-domains - List domains with pagination and filtering
router.get('/', protect, asyncHandler(async (req, res) => {
  const { page, limit, search, status } = req.query;
  const options = {
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 20, 100), // Max 100 per page
    search,
    status
  };

  const result = await domainAuthService.listDomains(
    { organization: req.user.organization || null },
    options
  );

  res.json({
    domains: result.domains.map(d => ({
      _id: d._id,
      domain: d.domain,
      status: d.status,
      dkimVerified: d.dkimVerified,
      spfVerified: d.spfVerified,
      trackingVerified: d.trackingVerified,
      lastCheckedAt: d.lastCheckedAt,
      isPrimary: d.isPrimary,
      error: d.error,
      createdAt: d.createdAt
    })),
    pagination: result.pagination
  });
}));

// GET /api/sending-domains/stats - Get domain statistics
router.get('/stats', protect, asyncHandler(async (req, res) => {
  const stats = await domainAuthService.getDomainStats(
    req.user._id,
    req.user.organization
  );
  res.json(stats);
}));

// POST /api/sending-domains - Create new domain
router.post('/', protect, domainCreationLimiter, asyncHandler(async (req, res) => {
  const { domain } = req.body;
  if (!domain) {
    res.status(400);
    throw new Error('Domain is required');
  }

  const record = await domainAuthService.createDomain({
    domain,
    organization: req.user.organization || null,
    user: req.user._id
  });

  res.status(201).json({
    domain: record.domain,
    dkim: domainAuthService.buildDkimRecord(record),
    spf: domainAuthService.buildSpfRecord(record.domain),
    tracking: domainAuthService.buildTrackingCname(record),
    status: record.status,
    id: record._id,
    isPrimary: record.isPrimary
  });
}));

// GET /api/sending-domains/:id - Get specific domain details
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const d = await domainAuthService.getDomain(req.params.id);
  if (!d) {
    res.status(404);
    throw new Error('Domain not found');
  }

  // Check ownership
  if (d.organization && d.organization.toString() !== req.user.organization) {
    res.status(403);
    throw new Error('Unauthorized to access this domain');
  }
  if (!d.organization && d.user.toString() !== req.user._id) {
    res.status(403);
    throw new Error('Unauthorized to access this domain');
  }

  res.json({
    ...d,
    dkimRecord: domainAuthService.buildDkimRecord(d),
    spfRecord: domainAuthService.buildSpfRecord(d.domain),
    trackingRecord: domainAuthService.buildTrackingCname(d),
    isPrimary: d.isPrimary
  });
}));

// POST /api/sending-domains/:id/regenerate-dkim - Regenerate DKIM keys
router.post('/:id/regenerate-dkim', protect, asyncHandler(async (req, res) => {
  const domain = await domainAuthService.getDomain(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }

  // Check ownership
  if (domain.organization && domain.organization.toString() !== req.user.organization) {
    res.status(403);
    throw new Error('Unauthorized to modify this domain');
  }
  if (!domain.organization && domain.user.toString() !== req.user._id) {
    res.status(403);
    throw new Error('Unauthorized to modify this domain');
  }

  const updated = await domainAuthService.regenerateDkim(req.params.id);
  res.json({
    id: updated._id,
    dkim: domainAuthService.buildDkimRecord(updated),
    status: updated.status
  });
}));

// POST /api/sending-domains/:id/verify - Verify domain DNS records
router.post('/:id/verify', protect, domainVerificationLimiter, asyncHandler(async (req, res) => {
  const existing = await domainAuthService.getDomain(req.params.id);
  if (!existing) {
    res.status(404);
    throw new Error('Domain not found');
  }

  // Check ownership
  if (existing.organization && existing.organization.toString() !== req.user.organization) {
    res.status(403);
    throw new Error('Unauthorized to verify this domain');
  }
  if (!existing.organization && existing.user.toString() !== req.user._id) {
    res.status(403);
    throw new Error('Unauthorized to verify this domain');
  }

  const verified = await domainAuthService.verifyDns(existing);
  res.json({
    id: verified._id,
    status: verified.status,
    dkimVerified: verified.dkimVerified,
    spfVerified: verified.spfVerified,
    trackingVerified: verified.trackingVerified,
    lastCheckedAt: verified.lastCheckedAt,
    isPrimary: verified.isPrimary,
    error: verified.error
  });
}));

// PUT /api/sending-domains/:id/primary - Set domain as primary
router.put('/:id/primary', protect, asyncHandler(async (req, res) => {
  const updated = await domainAuthService.setPrimaryDomain(
    req.params.id,
    req.user._id,
    req.user.organization
  );
  res.json({
    id: updated._id,
    domain: updated.domain,
    isPrimary: updated.isPrimary
  });
}));

// DELETE /api/sending-domains/:id - Delete domain
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const result = await domainAuthService.deleteDomain(
    req.params.id,
    req.user._id,
    req.user.organization
  );
  res.json(result);
}));

// POST /api/sending-domains/:id/cloudflare-setup - Setup DNS via Cloudflare API
router.post('/:id/cloudflare-setup', protect, asyncHandler(async (req, res) => {
  const { apiToken } = req.body;

  if (!apiToken) {
    res.status(400);
    throw new Error('Cloudflare API token is required');
  }

  const domain = await domainAuthService.getDomain(req.params.id);
  if (!domain) {
    res.status(404);
    throw new Error('Domain not found');
  }

  // Check ownership
  if (domain.organization && domain.organization.toString() !== req.user.organization) {
    res.status(403);
    throw new Error('Unauthorized to modify this domain');
  }
  if (!domain.organization && domain.user.toString() !== req.user._id) {
    res.status(403);
    throw new Error('Unauthorized to modify this domain');
  }

  // Validate API token
  const isValidToken = await cloudflareService.validateToken(apiToken);
  if (!isValidToken) {
    res.status(400);
    throw new Error('Invalid Cloudflare API token');
  }

  // Build DNS records
  const dnsRecords = {
    dkim: domainAuthService.buildDkimRecord(domain),
    spf: domainAuthService.buildSpfRecord(domain.domain),
    tracking: domainAuthService.buildTrackingCname(domain)
  };

  // Setup DNS via Cloudflare API
  const result = await cloudflareService.setupDomainDNS(apiToken, domain.domain, dnsRecords);

  if (result.success) {
    res.json({
      success: true,
      message: `Successfully created ${result.createdRecords} DNS records in Cloudflare`,
      zoneId: result.zoneId,
      recordsCreated: result.createdRecords
    });
  } else {
    res.status(400);
    throw new Error(result.error);
  }
}));

module.exports = router;

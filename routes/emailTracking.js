// emailxp/backend/routes/emailTracking.js

const express = require('express');
const router = express.Router();
const EmailTracking = require('../models/EmailTracking');
const emailService = require('../utils/emailService');

// Track email opens
router.get('/open/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress;

    // Record the open
    await emailService.recordOpen(messageId, {
      userAgent,
      ipAddress
    });

    // Return a 1x1 transparent pixel
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.send(pixel);
  } catch (error) {
    console.error('Error tracking email open:', error);
    
    // Still return pixel even if tracking fails
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.set('Content-Type', 'image/gif');
    res.send(pixel);
  }
});

// Track email clicks
router.get('/click/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { url } = req.query;
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!url) {
      return res.status(400).json({ message: 'URL parameter is required' });
    }

    // Record the click
    await emailService.recordClick(messageId, {
      url: decodeURIComponent(url),
      userAgent,
      ipAddress
    });

    // Redirect to the original URL
    res.redirect(decodeURIComponent(url));
  } catch (error) {
    console.error('Error tracking email click:', error);
    
    // Still redirect even if tracking fails
    const { url } = req.query;
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.status(400).json({ message: 'URL parameter is required' });
    }
  }
});

// Unsubscribe endpoint
router.get('/unsubscribe/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    // Record the unsubscribe
    const tracking = await emailService.recordUnsubscribe(messageId);
    
    if (tracking) {
      // Also update the subscriber status
      const Subscriber = require('../models/Subscriber');
      await Subscriber.findByIdAndUpdate(
        tracking.subscriber,
        { 
          status: 'unsubscribed',
          unsubscribedAt: new Date()
        }
      );
    }

    // Redirect to unsubscribe confirmation page
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribed?success=true`);
  } catch (error) {
    console.error('Error processing unsubscribe:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribed?error=true`);
  }
});

// Webhook endpoint for email service providers
router.post('/webhook/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const payload = req.body;

    await emailService.handleWebhook(provider, payload);

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ message: 'Error processing webhook' });
  }
});

// Get tracking data for a specific email
router.get('/data/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;

    const tracking = await EmailTracking.findOne({ messageId })
      .populate('campaign', 'name')
      .populate('subscriber', 'email name');

    if (!tracking) {
      return res.status(404).json({ message: 'Tracking data not found' });
    }

    res.json(tracking);
  } catch (error) {
    console.error('Error fetching tracking data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get campaign tracking statistics
router.get('/campaign/:campaignId/stats', async (req, res) => {
  try {
    const { campaignId } = req.params;

    const stats = await EmailTracking.getCampaignStats(campaignId);

    if (!stats || stats.length === 0) {
      return res.json({
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalUnsubscribed: 0,
        totalSpam: 0,
        openRate: 0,
        clickRate: 0,
        bounceRate: 0
      });
    }

    const data = stats[0];
    
    // Calculate rates
    const openRate = data.totalSent > 0 ? (data.totalOpened / data.totalSent) * 100 : 0;
    const clickRate = data.totalSent > 0 ? (data.totalClicked / data.totalSent) * 100 : 0;
    const bounceRate = data.totalSent > 0 ? (data.totalBounced / data.totalSent) * 100 : 0;
    const deliveryRate = data.totalSent > 0 ? (data.totalDelivered / data.totalSent) * 100 : 0;

    res.json({
      ...data,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      deliveryRate: Math.round(deliveryRate * 100) / 100
    });
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get organization tracking statistics
router.get('/organization/:organizationId/stats', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const stats = await EmailTracking.getOrganizationStats(organizationId, dateRange);

    if (!stats || stats.length === 0) {
      return res.json({
        totalSent: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalUnsubscribed: 0,
        totalSpam: 0,
        avgOpenRate: 0,
        avgClickRate: 0
      });
    }

    const data = stats[0];
    
    res.json({
      ...data,
      avgOpenRate: Math.round(data.avgOpenRate * 10000) / 100, // Convert to percentage
      avgClickRate: Math.round(data.avgClickRate * 10000) / 100
    });
  } catch (error) {
    console.error('Error fetching organization stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get detailed tracking data for a campaign
router.get('/campaign/:campaignId/details', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const tracking = await EmailTracking.find({ campaign: campaignId })
      .populate('subscriber', 'email name')
      .sort({ sentAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await EmailTracking.countDocuments({ campaign: campaignId });

    res.json({
      tracking,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching campaign tracking details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
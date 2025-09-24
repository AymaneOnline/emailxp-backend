// Enhanced campaign routes with email queue integration
const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');
const emailQueueService = require('../services/emailQueueService');
const emailService = require('../services/emailService');
const { 
  getCampaigns, 
  getDashboardStats, 
  getCampaignById,
  deleteCampaign,
  getCampaignAnalytics,
  getCampaignAnalyticsTimeSeries
} = require('../controllers/campaignController');

const router = express.Router();

// Get all campaigns
router.get('/', protect, getCampaigns);

// Get dashboard statistics
router.get('/dashboard-stats', protect, getDashboardStats);

/**
 * @desc    Get campaign analytics
 * @route   GET /api/campaigns/:id/analytics
 * @access  Private
 */
router.get('/:id/analytics', protect, getCampaignAnalytics);

/**
 * @desc    Get campaign time-series analytics  
 * @route   GET /api/campaigns/:id/analytics/time-series
 * @access  Private
 */
router.get('/:id/analytics/time-series', protect, getCampaignAnalyticsTimeSeries);

// Get single campaign by ID (must come after specific routes)
router.get('/:id', protect, getCampaignById);

// Create campaign
router.post('/', protect, asyncHandler(async (req, res) => {
  const { name, subject, fromEmail, fromName, htmlContent, group, groups = [], segments = [], individuals = [], scheduledAt, scheduleType, scheduleTimezone, template } = req.body;

  if (!name || !subject || (!htmlContent && !template)) {
    res.status(400);
    throw new Error('Please include required fields: name, subject, and either htmlContent or template');
  }

  const campaign = await Campaign.create({
    user: req.user.id,
    name,
    subject,
    fromEmail: fromEmail || req.user.email,
    fromName: fromName || req.user.name,
    htmlContent: htmlContent || '',
    group: groups?.[0] || group || undefined,
    groups: groups || [],
    segments: segments || [],
    individualSubscribers: individuals || [],
    scheduledAt: scheduledAt || null,
    scheduleType: scheduleType || 'fixed',
    scheduleTimezone: scheduleTimezone || null,
    status: scheduledAt && new Date(scheduledAt) > new Date() ? 'scheduled' : 'draft',
    template: template || null
  });

  res.status(201).json(campaign);
}));

// Update campaign
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const { name, subject, fromEmail, fromName, htmlContent, group, groups = [], segments = [], individuals = [], scheduledAt, scheduleType, scheduleTimezone, template } = req.body;

  const update = {
    name,
    subject,
    fromEmail: fromEmail || req.user.email,
    fromName: fromName || req.user.name,
    htmlContent,
    group: groups?.[0] || group,
    groups,
    segments,
    individualSubscribers: individuals,
    scheduledAt: scheduledAt || null,
    scheduleType: scheduleType || 'fixed',
    scheduleTimezone: scheduleTimezone || null,
    template: template || null
  };

  const updated = await Campaign.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!updated) {
    res.status(404);
    throw new Error('Campaign not found');
  }
  res.json(updated);
}));

// Delete campaign
router.delete('/:id', protect, deleteCampaign);

/**
 * @desc    Send campaign immediately
 * @route   POST /api/campaigns/:id/send
 * @access  Private
 */
router.post('/:id/send', protect, asyncHandler(async (req, res) => {
  console.log(`🚀 Campaign send request received for campaign: ${req.params.id}, user: ${req.user.id}`);
  
  const campaign = await Campaign.findById(req.params.id);
  
  if (!campaign) {
    res.status(404);
    throw new Error('Campaign not found');
  }
  
  if (campaign.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  if (campaign.status !== 'draft') {
    res.status(400);
    throw new Error('Campaign must be in draft status to send');
  }
  
  console.log(`📊 Campaign found: ${campaign.name}, status: ${campaign.status}`);
  
  try {
    // Check if campaign is scheduled for later
    if (campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date()) {
      // Schedule for later
      campaign.status = 'scheduled';
      await campaign.save();
      
      console.log(`📅 Campaign scheduled for later: ${campaign.scheduledAt}`);
      
      // Add to scheduled campaigns (this would be handled by the scheduler)
      // For now, just mark as scheduled
      res.json({
        message: 'Campaign scheduled successfully',
        campaignId: campaign._id,
        scheduledAt: campaign.scheduledAt
      });
    } else {
      // Send immediately
      // Update campaign status
      campaign.status = 'sending';
      campaign.startedAt = new Date();
      await campaign.save();
      
      console.log(`📤 Campaign status updated to 'sending', adding to queue...`);
      
      // Add to email queue
      const jobId = await emailQueueService.addCampaignToQueue(campaign._id);
      
      console.log(`✅ Campaign added to queue with job ID: ${jobId}`);
      
      // Update campaign with job ID
      campaign.jobId = jobId;
      await campaign.save();
      
      res.json({
        message: 'Campaign queued for sending',
        campaignId: campaign._id,
        jobId
      });
    }
    
  } catch (error) {
    campaign.status = 'failed';
    campaign.error = error.message;
    await campaign.save();
    
    res.status(500);
    throw new Error(`Failed to queue campaign: ${error.message}`);
  }
}));

/**
 * @desc    Schedule campaign for future sending
 * @route   POST /api/campaigns/:id/schedule
 * @access  Private
 */
router.post('/:id/schedule', protect, asyncHandler(async (req, res) => {
  const { scheduledTime } = req.body;
  const campaign = await Campaign.findById(req.params.id);
  
  if (!campaign) {
    res.status(404);
    throw new Error('Campaign not found');
  }
  
  if (campaign.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  if (campaign.status !== 'draft') {
    res.status(400);
    throw new Error('Campaign must be in draft status to schedule');
  }
  
  if (!scheduledTime || new Date(scheduledTime) <= new Date()) {
    res.status(400);
    throw new Error('Scheduled time must be in the future');
  }
  
  try {
    const jobId = await emailQueueService.scheduleCampaign(campaign._id, scheduledTime);
    
    res.json({
      message: 'Campaign scheduled successfully',
      campaignId: campaign._id,
      scheduledTime,
      jobId
    });
    
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to schedule campaign: ${error.message}`);
  }
}));

/**
 * @desc    Cancel scheduled campaign
 * @route   POST /api/campaigns/:id/cancel
 * @access  Private
 */
router.post('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  
  if (!campaign) {
    res.status(404);
    throw new Error('Campaign not found');
  }
  
  if (campaign.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  if (campaign.status !== 'scheduled') {
    res.status(400);
    throw new Error('Only scheduled campaigns can be cancelled');
  }
  
  try {
    await emailQueueService.cancelScheduledCampaign(campaign._id);
    
    res.json({
      message: 'Campaign cancelled successfully',
      campaignId: campaign._id
    });
    
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to cancel campaign: ${error.message}`);
  }
}));

/**
 * @desc    Get email queue status
 * @route   GET /api/campaigns/queue/status
 * @access  Private
 */
router.get('/queue/status', protect, asyncHandler(async (req, res) => {
  try {
    const queueStats = await emailQueueService.getQueueStats();
    res.json(queueStats);
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to get queue status: ${error.message}`);
  }
}));

/**
 * @desc    Test email sending
 * @route   POST /api/campaigns/test-email
 * @access  Private
 */
router.post('/test-email', protect, asyncHandler(async (req, res) => {
  const { to, subject, htmlContent } = req.body;
  
  if (!to || !subject || !htmlContent) {
    res.status(400);
    throw new Error('Missing required fields: to, subject, htmlContent');
  }
  
  try {
    const result = await emailService.sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      html: htmlContent,
      campaignType: 'test'
    });
    
    res.json({
      message: 'Test email sent successfully',
      messageId: result.messageId
    });
    
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to send test email: ${error.message}`);
  }
}));

/**
 * @desc    Validate email addresses
 * @route   POST /api/campaigns/validate-emails
 * @access  Private
 */
router.post('/validate-emails', protect, asyncHandler(async (req, res) => {
  const { emails } = req.body;
  
  if (!emails || !Array.isArray(emails)) {
    res.status(400);
    throw new Error('Emails array is required');
  }
  
  try {
    const validationResults = await Promise.all(
      emails.map(async (email) => {
        const result = await emailService.validateEmail(email);
        return { email, ...result };
      })
    );
    
    res.json({
      results: validationResults,
      summary: {
        total: emails.length,
        valid: validationResults.filter(r => r.isValid).length,
        invalid: validationResults.filter(r => !r.isValid).length,
        disposable: validationResults.filter(r => r.isDisposable).length,
        roleAccount: validationResults.filter(r => r.isRoleAccount).length
      }
    });
    
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to validate emails: ${error.message}`);
  }
}));

/**
 * @desc    Get suppression lists
 * @route   GET /api/campaigns/suppressions/:type
 * @access  Private
 */
router.get('/suppressions/:type', protect, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const map = { bounces: 'bounce', unsubscribes: 'unsubscribe', complaints: 'complaint' };
  const suppressionType = map[type];
  if (!suppressionType) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${Object.keys(map).join(', ')}`);
  }
  const Suppression = require('../models/Suppression');
  try {
    const query = { type: suppressionType };
    if (req.user && req.user.organization) query.organization = req.user.organization;
    const items = await Suppression.find(query).lean();
    res.json({ type, count: items.length, items });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to get suppression list: ${error.message}`);
  }
}));

/**
 * @desc    Add email to suppression list
 * @route   POST /api/campaigns/suppressions/:type
 * @access  Private
 */
router.post('/suppressions/:type', protect, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { email, reason, source = 'user' } = req.body;
  const map = { bounces: 'bounce', unsubscribes: 'unsubscribe', complaints: 'complaint' };
  const suppressionType = map[type];
  if (!suppressionType) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${Object.keys(map).join(', ')}`);
  }
  if (!email) {
    res.status(400);
    throw new Error('Email address is required');
  }
  const Suppression = require('../models/Suppression');
  try {
    const doc = await Suppression.recordEvent({
      email,
      type: suppressionType,
      reason: reason || `Manual ${suppressionType}`,
      source,
      user: req.user?._id,
      organization: req.user?.organization || null
    });
    res.status(201).json({ message: 'Suppressed', item: doc });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to add email to suppression list: ${error.message}`);
  }
}));

/**
 * @desc    Remove email from suppression list
 * @route   DELETE /api/campaigns/suppressions/:type/:email
 * @access  Private
 */
router.delete('/suppressions/:type/:email', protect, asyncHandler(async (req, res) => {
  const { type, email } = req.params;
  const map = { bounces: 'bounce', unsubscribes: 'unsubscribe', complaints: 'complaint' };
  const suppressionType = map[type];
  if (!suppressionType) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${Object.keys(map).join(', ')}`);
  }
  const Suppression = require('../models/Suppression');
  try {
    const query = { email: email.toLowerCase(), type: suppressionType };
    if (req.user && req.user.organization) query.organization = req.user.organization;
    await Suppression.deleteOne(query);
    res.json({ message: 'Removed from suppression list', email, type });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to remove email from suppression list: ${error.message}`);
  }
}));

module.exports = router;
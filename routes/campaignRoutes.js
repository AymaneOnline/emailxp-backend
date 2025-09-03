// Enhanced campaign routes with email queue integration
const express = require('express');
const asyncHandler = require('express-async-handler');
const { protect } = require('../middleware/authMiddleware');
const Campaign = require('../models/Campaign');
const EmailLog = require('../models/EmailLog');
const emailQueueService = require('../services/emailQueueService');
const mailgunService = require('../services/mailgunService');

const router = express.Router();

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

/**
 * @desc    Send campaign immediately
 * @route   POST /api/campaigns/:id/send
 * @access  Private
 */
router.post('/:id/send', protect, asyncHandler(async (req, res) => {
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
  
  try {
    // Update campaign status
    campaign.status = 'sending';
    campaign.startedAt = new Date();
    await campaign.save();
    
    // Add to email queue
    const jobId = await emailQueueService.addCampaignToQueue(campaign._id);
    
    // Update campaign with job ID
    campaign.jobId = jobId;
    await campaign.save();
    
    res.json({
      message: 'Campaign queued for sending',
      campaignId: campaign._id,
      jobId
    });
    
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
 * @desc    Get campaign analytics
 * @route   GET /api/campaigns/:id/analytics
 * @access  Private
 */
router.get('/:id/analytics', protect, asyncHandler(async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  
  if (!campaign) {
    res.status(404);
    throw new Error('Campaign not found');
  }
  
  if (campaign.user.toString() !== req.user.id) {
    res.status(401);
    throw new Error('Not authorized');
  }
  
  try {
    // Get detailed stats from EmailLog
    const stats = await EmailLog.getCampaignStats(campaign._id);
    
    // Get recent activity
    const recentActivity = await EmailLog.find({ campaignId: campaign._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('subscriberId', 'email firstName lastName');
    
    // Calculate additional metrics
    const analytics = {
      ...stats,
      campaign: {
        id: campaign._id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        createdAt: campaign.createdAt,
        sentAt: campaign.sentAt,
        scheduledAt: campaign.scheduledAt
      },
      recentActivity,
      performance: {
        deliveryRate: stats.deliveryRate,
        openRate: stats.openRate,
        clickRate: stats.clickRate,
        bounceRate: stats.bounceRate,
        unsubscribeRate: stats.unsubscribeRate
      }
    };
    
    res.json(analytics);
    
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to get campaign analytics: ${error.message}`);
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
    const result = await mailgunService.sendEmail({
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
        const result = await mailgunService.validateEmail(email);
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
  const validTypes = ['bounces', 'unsubscribes', 'complaints'];
  
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  try {
    const suppressionList = await mailgunService.getSuppressionList(type);
    res.json(suppressionList);
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
  const { email, reason } = req.body;
  const validTypes = ['bounces', 'unsubscribes', 'complaints'];
  
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  if (!email) {
    res.status(400);
    throw new Error('Email address is required');
  }
  
  try {
    const result = await mailgunService.addToSuppressionList(type, email, reason);
    res.json({
      message: `Email added to ${type} suppression list`,
      result
    });
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
  const validTypes = ['bounces', 'unsubscribes', 'complaints'];
  
  if (!validTypes.includes(type)) {
    res.status(400);
    throw new Error(`Invalid suppression type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  try {
    const result = await mailgunService.removeFromSuppressionList(type, email);
    res.json({
      message: `Email removed from ${type} suppression list`,
      result
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to remove email from suppression list: ${error.message}`);
  }
}));

module.exports = router;
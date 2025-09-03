// Test route for email service setup verification
const express = require('express');
const router = express.Router();

/**
 * Test email service configuration
 */
router.get('/config', (req, res) => {
  const emailService = require('../services/emailService');
  const serviceInfo = emailService.getServiceInfo();
  
  const config = {
    emailProvider: serviceInfo.provider,
    emailConfigured: serviceInfo.configured,
    mailerSendConfigured: !!process.env.MAILERSEND_API_KEY,
    amazonSESConfigured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    smtp2goConfigured: !!(process.env.SMTP2GO_USERNAME && process.env.SMTP2GO_PASSWORD),
    mailgunConfigured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    resendConfigured: !!process.env.RESEND_API_KEY,
    sendgridConfigured: !!process.env.SENDGRID_API_KEY,
    redisConfigured: !!(process.env.REDIS_HOST && process.env.REDIS_PORT),
    redisHost: process.env.REDIS_HOST || 'Not configured',
    redisPort: process.env.REDIS_PORT || 'Not configured',
    serviceInfo
  };
  
  res.json(config);
});

/**
 * Test email sending (simple version)
 */
router.post('/send-test', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, subject, message' 
      });
    }

    // Try to load and use email service
    const emailService = require('../services/emailService');
    
    const result = await emailService.sendEmail({
      to,
      subject: `[TEST] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>🧪 Test Email from EmailXP</h2>
          <p>${message}</p>
          <hr>
          <p><small>This is a test email sent via EmailXP</small></p>
          <p><small>Sent at: ${new Date().toISOString()}</small></p>
        </div>
      `,
      text: `Test Email: ${message}`,
      campaignType: 'test'
    });

    res.json({
      success: true,
      message: 'Test email sent successfully!',
      messageId: result.messageId,
      to,
      subject
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Check server logs for more information'
    });
  }
});

/**
 * Test email validation
 */
router.post('/validate-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email address is required' 
      });
    }

    const emailService = require('../services/emailService');
    const result = await emailService.validateEmail(email);

    res.json({
      success: true,
      email,
      validation: result
    });

  } catch (error) {
    console.error('Email validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test queue status
 */
router.get('/queue-status', async (req, res) => {
  try {
    const emailQueueService = require('../services/emailQueueService');
    const stats = await emailQueueService.getQueueStats();
    
    res.json({
      success: true,
      queueStats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Queue status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
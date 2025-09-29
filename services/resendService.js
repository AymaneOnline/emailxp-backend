// Resend email service integration (minimal wrapper around utils/resendEmailService)
const resendUtil = require('../utils/resendEmailService');
const domainAuthService = require('./domainAuthService');
const emailTrackingUtil = require('../utils/emailService');

class ResendService {
  constructor() {
    this.initialized = !!process.env.RESEND_API_KEY;
    if (!this.initialized) {
      console.warn('⚠️  Resend API key not configured');
    }
  }

  async sendEmail(emailData) {
    if (!this.initialized) {
      throw new Error('Resend not configured. Please add RESEND_API_KEY and EMAIL_FROM to .env file');
    }

  const { to, from, subject, html, text, fromName, campaignId, automationId, subscriberId, campaignType = 'marketing', organizationId } = emailData;
    console.log('ResendService sendEmail called with html length:', html ? html.length : 'undefined');
    console.log('HTML content preview:', html ? html.substring(0, 200) + '...' : 'no html');
    
    if (from) {
      const domainPart = from.split('@').pop();
      const check = await domainAuthService.requireVerifiedDomain(domainPart);
      if (!check.allowed) {
        throw new Error(`Sending domain not verified (${check.reason})`);
      }
    }

    // Generate unique message ID for tracking
    const messageId = emailTrackingUtil.generateMessageId();
    console.log('Generated messageId for tracking:', messageId);

    // Add tracking pixel to HTML content
    const htmlWithTracking = emailTrackingUtil.addTrackingPixel(html, messageId);
    console.log('HTML after tracking pixel:', htmlWithTracking ? htmlWithTracking.substring(0, 200) + '...' : 'no html');

    // Add click tracking to links
    const htmlWithClickTracking = emailTrackingUtil.addClickTracking(htmlWithTracking, messageId);
    console.log('HTML after click tracking:', htmlWithClickTracking ? htmlWithClickTracking.substring(0, 200) + '...' : 'no html');

    // Pass through to util. Util sets verified from and optional reply_to.
    const data = await resendUtil.sendEmail({ 
      to, 
      subject, 
      html: htmlWithClickTracking, 
      text, 
      from, 
      fromName: fromName || process.env.MAILERSEND_FROM_NAME || 'EmailXP',
      subscriberId,
      campaignId,
      templateDisableAutoFooter: emailData.templateDisableAutoFooter || false
    });

    // Create tracking record for campaign or automation sends
    if ((campaignId || automationId) && subscriberId) {
      console.log(`Creating EmailTracking record for campaign:${campaignId || 'none'} automation:${automationId || 'none'} subscriber: ${subscriberId}, org: ${organizationId}`);
      await emailTrackingUtil.createTrackingRecord({
        campaign: campaignId || null,
        automation: automationId || null,
        subscriber: subscriberId,
        organization: organizationId || null,
        emailAddress: to,
        subject,
        messageId,
        status: 'sent',
        from: from || null,
        fromName: fromName || null,
        // propagate template/action info when present in emailData
        template: emailData.templateId || emailData.template || null,
        actionId: emailData.actionId || null
      });
      // Note: we purposely do not modify the return payload to include from/fromName
      console.log(`EmailTracking record creation attempted for messageId: ${messageId}`);
    } else {
      console.log(`Skipping EmailTracking creation - missing params: campaignId=${!!campaignId}, automationId=${!!automationId}, subscriberId=${!!subscriberId}`);
    }

    return {
      success: true,
      messageId: data?.id || messageId,
      provider: 'resend',
      to: Array.isArray(to) ? to : [to],
      subject,
      meta: { campaignId, subscriberId, campaignType }
    };
  }

  async recordClick(messageId, clickData) {
    // Record click event in both ClickEvent collection and EmailTracking document
    const ClickEvent = require('../models/ClickEvent');
    const EmailTracking = require('../models/EmailTracking');
    
    try {
      // Record in ClickEvent collection (for detailed analytics)
      const clickEvent = new ClickEvent({
        messageId,
        url: clickData.url,
        userAgent: clickData.userAgent,
        ipAddress: clickData.ipAddress,
        clickedAt: new Date()
      });
      await clickEvent.save();
      
      // Also record in EmailTracking document (for campaign analytics)
      const trackingDoc = await EmailTracking.findOne({ messageId });
      if (trackingDoc) {
        // Add click to the clicks array
        trackingDoc.clicks.push({
          timestamp: new Date(),
          url: clickData.url,
          userAgent: clickData.userAgent,
          ipAddress: clickData.ipAddress
        });
        
        // Update firstClickedAt if this is the first click
        if (!trackingDoc.firstClickedAt) {
          trackingDoc.firstClickedAt = new Date();
        }
        
        await trackingDoc.save();
        console.log('Click recorded in both ClickEvent and EmailTracking for messageId:', messageId);
      } else {
        console.warn('EmailTracking document not found for messageId:', messageId);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error recording click event:', error);
      return { success: false, error: error.message };
    }
  }

  async recordOpen(messageId, openData) {
    // Record open event in EmailTracking document
    const EmailTracking = require('../models/EmailTracking');
    
    try {
      const trackingDoc = await EmailTracking.findOne({ messageId });
      if (trackingDoc) {
        // Add open to the opens array
        trackingDoc.opens.push({
          timestamp: new Date(),
          userAgent: openData.userAgent,
          ipAddress: openData.ipAddress
        });
        
        // Update openedAt if this is the first open
        if (!trackingDoc.openedAt) {
          trackingDoc.openedAt = new Date();
        }
        
        await trackingDoc.save();
        console.log('Open recorded in EmailTracking for messageId:', messageId);
      } else {
        console.warn('EmailTracking document not found for messageId:', messageId);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error recording open event:', error);
      return { success: false, error: error.message };
    }
  }

  getServiceInfo() {
    return {
      provider: 'Resend',
      configured: !!process.env.RESEND_API_KEY,
      features: {
        bulkSending: false,
        analytics: 'basic',
        webhooks: false,
        validation: 'basic',
        templates: false
      }
    };
  }
}

module.exports = new ResendService();
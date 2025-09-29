// emailxp/backend/utils/emailService.js

const nodemailer = require('nodemailer');
const EmailTracking = require('../models/EmailTracking');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configure based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production email service (e.g., SendGrid, AWS SES, etc.)
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
    } else {
      // Development - use Ethereal Email for testing
      this.createTestAccount();
    }
  }

  async createTestAccount() {
    try {
      const testAccount = await nodemailer.createTestAccount();
      
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });

      console.log('Test email account created:', testAccount.user);
    } catch (error) {
      console.error('Error creating test email account:', error);
    }
  }

  async sendEmail(emailData) {
    try {
      const {
        to,
        subject,
        html,
        text,
        from,
        campaignId,
        subscriberId,
        organizationId
      } = emailData;

      // Generate unique message ID for tracking
      const messageId = this.generateMessageId();

      // Add tracking pixel to HTML content
      const htmlWithTracking = this.addTrackingPixel(html, messageId);

      // Add click tracking to links
      const htmlWithClickTracking = this.addClickTracking(htmlWithTracking, messageId);

      const mailOptions = {
        from: from || process.env.DEFAULT_FROM_EMAIL || 'noreply@emailxp.com',
        to,
        subject,
        text,
        html: htmlWithClickTracking,
        messageId
      };

      // Ensure transporter is initialized (create test account on demand in dev)
      if (!this.transporter) {
        console.log('[EmailService] transporter not ready, creating test account...');
        await this.createTestAccount();
      }

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      // Create tracking record
      if (campaignId && subscriberId && organizationId) {
        await this.createTrackingRecord({
          campaign: campaignId,
          subscriber: subscriberId,
          organization: organizationId,
          emailAddress: to,
          subject,
          messageId,
          status: 'sent'
        });
      }

      // Log preview URL for development
      if (process.env.NODE_ENV !== 'production') {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(result));
      }

      return {
        success: true,
        messageId: result.messageId,
        previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(result) : null
      };

    } catch (error) {
      console.error('Error sending email:', error);
      
      // Record failed send if tracking info is available
      if (emailData.campaignId && emailData.subscriberId && emailData.organizationId) {
        await this.createTrackingRecord({
          campaign: emailData.campaignId,
          subscriber: emailData.subscriberId,
          organization: emailData.organizationId,
          emailAddress: emailData.to,
          subject: emailData.subject,
          messageId: this.generateMessageId(),
          status: 'failed'
        });
      }

      throw error;
    }
  }

  async sendBulkEmails(emailsData) {
    const results = [];
    
    for (const emailData of emailsData) {
      try {
        const result = await this.sendEmail(emailData);
        results.push({ ...result, email: emailData.to });
        
        // Add small delay to avoid rate limiting
        await this.delay(100);
      } catch (error) {
        results.push({
          success: false,
          email: emailData.to,
          error: error.message
        });
      }
    }

    return results;
  }

  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@emailxp.com`;
  }

  addTrackingPixel(html, messageId) {
    if (!html) return html;

      // Use explicit BACKEND_URL when provided (production). Always encode messageId
      // so characters such as @ do not break URL parsing in some mail clients.
    const backendUrl = process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
      try { console.log('Generating tracking pixel with backendUrl:', backendUrl); } catch (e) { /* ignore */ }
      const trackingPixel = `<img src="${backendUrl.replace(/\/$/, '')}/api/track/open/${encodeURIComponent(messageId)}" width="1" height="1" style="display:none;" alt="" />`;
    
    // Try to insert before closing body tag, otherwise append
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    } else {
      return html + trackingPixel;
    }
  }

  addClickTracking(html, messageId) {
    console.log('addClickTracking called with messageId:', messageId);
    console.log('HTML input length:', html ? html.length : 'undefined');
    
    if (!html) {
      console.log('No HTML provided, returning empty string');
      return html;
    }

    console.log('Original HTML before click tracking:', html.substring(0, 500) + '...');

    // Replace all links with tracking links
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/gi;
    
    let matchCount = 0;
    const result = html.replace(linkRegex, (match, quote, url) => {
      matchCount++;
      console.log(`Processing link ${matchCount}:`, match, 'URL:', url);
      
      // Skip if already a tracking link or mailto/tel links
        // If the url already points to a tracking endpoint or is a mailto/tel link, skip
        if (url.includes('/api/track/click/') || url.startsWith('mailto:') || url.startsWith('tel:')) {
        console.log('Skipping link (already tracked or special):', url);
        return match;
      }

        // Build click tracking URL. Use BACKEND_URL when set, and ensure messageId
        // and target url are properly encoded.
    const backend = (process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
        const trackingUrl = `${backend}/api/track/click/${encodeURIComponent(messageId)}?url=${encodeURIComponent(url)}`;
      console.log('Converting URL:', url, 'to tracking URL:', trackingUrl);
      
      return match.replace(url, trackingUrl);
    });
    
    console.log('Total links processed:', matchCount);
    console.log('Final HTML length:', result.length);
    
    return result;
  }

  async createTrackingRecord(trackingData) {
    try {
      console.log('Creating EmailTracking record for campaign:', trackingData.campaign, 'messageId:', trackingData.messageId);
      // Only pick known fields to avoid accidental extra data
      const payload = {
        campaign: trackingData.campaign || null,
        automation: trackingData.automation || null,
        subscriber: trackingData.subscriber,
        organization: trackingData.organization || null,
        emailAddress: trackingData.emailAddress,
        subject: trackingData.subject,
        messageId: trackingData.messageId,
        status: trackingData.status || 'sent',
        from: trackingData.from || null,
        fromName: trackingData.fromName || null,
        template: trackingData.template || null,
        actionId: trackingData.actionId || null
      };
      const tracking = new EmailTracking(payload);
      await tracking.save();
      console.log('EmailTracking record created successfully with ID:', tracking._id);
      return tracking;
    } catch (error) {
      console.error('Error creating tracking record:', error);
      throw error;
    }
  }

  async recordOpen(messageId, openData = {}) {
    try {
      const tracking = await EmailTracking.findOne({ messageId });
      if (tracking) {
        await tracking.recordOpen(openData);
        // Increment subscriber open stats
        if (tracking.subscriber) {
          const Subscriber = require('../models/Subscriber');
          await Subscriber.findByIdAndUpdate(tracking.subscriber, {
            $inc: { openCount: 1 },
            $set: { lastOpenAt: new Date(), lastActivityAt: new Date() }
          });
        }
        return tracking;
      }
    } catch (error) {
      console.error('Error recording email open:', error);
    }
  }

  async recordClick(messageId, clickData = {}) {
    try {
      const tracking = await EmailTracking.findOne({ messageId });
      if (tracking) {
        await tracking.recordClick(clickData);
        if (tracking.subscriber) {
          const Subscriber = require('../models/Subscriber');
            await Subscriber.findByIdAndUpdate(tracking.subscriber, {
              $inc: { clickCount: 1 },
              $set: { lastClickAt: new Date(), lastActivityAt: new Date() }
            });
        }
        return tracking;
      }
    } catch (error) {
      console.error('Error recording email click:', error);
    }
  }

  async recordBounce(messageId, bounceData = {}) {
    try {
      const tracking = await EmailTracking.findOne({ messageId });
      if (tracking) {
        await tracking.recordBounce(bounceData);
        return tracking;
      }
    } catch (error) {
      console.error('Error recording email bounce:', error);
    }
  }

  async recordUnsubscribe(messageId) {
    try {
      const tracking = await EmailTracking.findOne({ messageId });
      if (tracking) {
        await tracking.recordUnsubscribe();
        return tracking;
      }
    } catch (error) {
      console.error('Error recording unsubscribe:', error);
    }
  }

  // Template email methods
  async sendWelcomeEmail(userEmail, userName) {
    const emailData = {
      to: userEmail,
      subject: 'Welcome to EmailXP!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Welcome to EmailXP, ${userName}!</h1>
          <p>Thank you for joining EmailXP. We're excited to help you create amazing email campaigns.</p>
          <p>Get started by:</p>
          <ul>
            <li>Creating your first email template</li>
            <li>Importing your subscriber list</li>
            <li>Launching your first campaign</li>
          </ul>
          <p>If you have any questions, don't hesitate to reach out to our support team.</p>
          <p>Best regards,<br>The EmailXP Team</p>
        </div>
      `,
      text: `Welcome to EmailXP, ${userName}! Thank you for joining us. Get started by creating your first template, importing subscribers, and launching campaigns.`
    };

    return this.sendEmail(emailData);
  }

  async sendPasswordResetEmail(userEmail, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const emailData = {
      to: userEmail,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Password Reset Request</h1>
          <p>You requested a password reset for your EmailXP account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p>If you didn't request this reset, please ignore this email.</p>
          <p>This link will expire in 1 hour.</p>
          <p>Best regards,<br>The EmailXP Team</p>
        </div>
      `,
      text: `Password reset requested. Visit: ${resetUrl} (expires in 1 hour)`
    };

    return this.sendEmail(emailData);
  }

  async sendVerificationEmail(userEmail, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    
    const emailData = {
      to: userEmail,
      subject: 'Verify Your Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Verify Your Email Address</h1>
          <p>Please verify your email address to complete your EmailXP registration.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          </div>
          <p>If you didn't create this account, please ignore this email.</p>
          <p>Best regards,<br>The EmailXP Team</p>
        </div>
      `,
      text: `Please verify your email address: ${verificationUrl}`
    };

    return this.sendEmail(emailData);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Webhook handlers for email service providers
  async handleWebhook(provider, payload) {
    try {
      switch (provider) {
        case 'sendgrid':
          return this.handleSendGridWebhook(payload);
        case 'resend':
          return this.handleResendWebhook(payload);
        default:
          console.log('Unknown webhook provider:', provider);
      }
    } catch (error) {
      console.error('Error handling webhook:', error);
    }
  }

  async handleSendGridWebhook(events) {
    for (const event of events) {
      const messageId = event.sg_message_id;
      
      switch (event.event) {
        case 'delivered':
          await this.updateTrackingStatus(messageId, 'delivered');
          break;
        case 'open':
          await this.recordOpen(messageId, {
            userAgent: event.useragent,
            ipAddress: event.ip
          });
          break;
        case 'click':
          await this.recordClick(messageId, {
            url: event.url,
            userAgent: event.useragent,
            ipAddress: event.ip
          });
          break;
        case 'bounce':
          await this.recordBounce(messageId, {
            type: event.type,
            reason: event.reason
          });
          break;
        case 'unsubscribe':
          await this.recordUnsubscribe(messageId);
          break;
      }
    }
  }

  async handleResendWebhook(payload) {
    // Basic Resend webhook handling
    // Resend webhook format may differ from SendGrid
    const { type, data } = payload;
    const messageId = data?.email_id;
    
    if (!messageId) return;
    
    switch (type) {
      case 'email.delivered':
        await this.updateTrackingStatus(messageId, 'delivered');
        break;
      case 'email.opened':
        await this.recordOpen(messageId, {
          userAgent: data?.user_agent,
          ipAddress: data?.ip_address
        });
        break;
      case 'email.clicked':
        await this.recordClick(messageId, {
          url: data?.link?.url,
          userAgent: data?.user_agent,
          ipAddress: data?.ip_address
        });
        break;
      case 'email.bounced':
        await this.recordBounce(messageId, {
          type: data?.bounce?.type,
          reason: data?.bounce?.reason
        });
        break;
    }
  }

  async updateTrackingStatus(messageId, status) {
    try {
      await EmailTracking.findOneAndUpdate(
        { messageId },
        { 
          status,
          deliveredAt: status === 'delivered' ? new Date() : undefined
        }
      );
    } catch (error) {
      console.error('Error updating tracking status:', error);
    }
  }
}

module.exports = new EmailService();
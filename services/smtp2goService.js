// SMTP2GO email service integration
const nodemailer = require('nodemailer');
const axios = require('axios');

class SMTP2GOService {
  constructor() {
    this.transporter = null;
    this.apiKey = process.env.SMTP2GO_API_KEY;
    this.apiUrl = 'https://api.smtp2go.com/v3';
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter
   */
  initializeTransporter() {
    if (!process.env.SMTP2GO_USERNAME || !process.env.SMTP2GO_PASSWORD) {
      console.warn('⚠️  SMTP2GO credentials not configured');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: 'mail.smtp2go.com',
      port: 587, // or 2525, 25
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP2GO_USERNAME,
        pass: process.env.SMTP2GO_PASSWORD,
      },
      // Additional options for better deliverability
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateLimit: 10, // 10 emails per second max
    });

    console.log('✅ SMTP2GO transporter initialized');
  }

  /**
   * Send single email
   */
  async sendEmail(emailData) {
    if (!this.transporter) {
      throw new Error('SMTP2GO not configured. Please add credentials to .env file');
    }

    const {
      to,
      from,
      subject,
      html,
      text,
      campaignId,
      subscriberId,
      campaignType = 'marketing'
    } = emailData;

    // Prepare email options
    const mailOptions = {
      from: from || `${process.env.APP_NAME || 'EmailXP'} <${process.env.SMTP2GO_FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || this.htmlToText(html),
      // Custom headers for tracking
      headers: {
        'X-Campaign-ID': campaignId,
        'X-Subscriber-ID': subscriberId,
        'X-Campaign-Type': campaignType,
        'X-Mailer': 'EmailXP-SMTP2GO'
      }
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent via SMTP2GO: ${result.messageId}`);
      
      return {
        success: true,
        messageId: result.messageId,
        provider: 'smtp2go',
        to,
        subject
      };

    } catch (error) {
      console.error('❌ SMTP2GO send error:', error);
      throw new Error(`Failed to send email via SMTP2GO: ${error.message}`);
    }
  }

  /**
   * Send bulk emails with rate limiting
   */
  async sendBulkEmails(emails, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    const delayBetweenBatches = options.delay || 1000; // 1 second

    console.log(`📧 Sending ${emails.length} emails via SMTP2GO in batches of ${batchSize}`);

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (emailData, index) => {
        try {
          // Small delay between emails in same batch
          if (index > 0) {
            await this.delay(100);
          }
          
          const result = await this.sendEmail(emailData);
          return { success: true, ...result };
        } catch (error) {
          return { 
            success: false, 
            error: error.message, 
            to: emailData.to 
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || r.reason));

      // Progress logging
      console.log(`📊 Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(emails.length/batchSize)}`);

      // Delay between batches (except for last batch)
      if (i + batchSize < emails.length) {
        await this.delay(delayBetweenBatches);
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`✅ Bulk send complete: ${successful} sent, ${failed} failed`);

    return {
      total: emails.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Get account statistics (if API key is provided)
   */
  async getAccountStats() {
    if (!this.apiKey) {
      return { error: 'API key not configured' };
    }

    try {
      const response = await axios.get(`${this.apiUrl}/stats`, {
        headers: {
          'X-Smtp2go-Api-Key': this.apiKey
        }
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get SMTP2GO stats:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Validate email address (basic validation)
   */
  async validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    // Basic checks
    const isDisposable = this.isDisposableEmail(email);
    const isRoleAccount = this.isRoleAccount(email);
    
    return {
      email,
      isValid,
      isDisposable,
      isRoleAccount,
      provider: 'smtp2go-basic-validation'
    };
  }

  /**
   * Check if email is from disposable domain
   */
  isDisposableEmail(email) {
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
      'mailinator.com', 'yopmail.com', 'temp-mail.org'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.includes(domain);
  }

  /**
   * Check if email is a role account
   */
  isRoleAccount(email) {
    const roleAccounts = [
      'admin', 'support', 'info', 'contact', 'sales', 'marketing',
      'noreply', 'no-reply', 'help', 'service', 'team'
    ];
    
    const localPart = email.split('@')[0]?.toLowerCase();
    return roleAccounts.includes(localPart);
  }

  /**
   * Convert HTML to plain text (simple version)
   */
  htmlToText(html) {
    if (!html) return '';
    
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Test connection
   */
  async testConnection() {
    if (!this.transporter) {
      throw new Error('SMTP2GO not configured');
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP2GO connection verified' };
    } catch (error) {
      throw new Error(`SMTP2GO connection failed: ${error.message}`);
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'SMTP2GO',
      configured: !!(process.env.SMTP2GO_USERNAME && process.env.SMTP2GO_PASSWORD),
      features: {
        bulkSending: true,
        analytics: 'basic',
        webhooks: false,
        validation: 'basic',
        freeLimit: '1000 emails/month'
      }
    };
  }
}

module.exports = new SMTP2GOService();
// Unified email service - supports multiple providers
const smtp2goService = require('./smtp2goService');

class EmailService {
  constructor() {
    this.provider = this.detectProvider();
    console.log(`📧 Email service initialized with provider: ${this.provider}`);
  }

  /**
   * Detect which email provider to use based on configuration
   */
  detectProvider() {
    // Check MailerSend first (great for no domain setup)
    if (process.env.MAILERSEND_API_KEY) {
      return 'mailersend';
    }
    
    // Check Amazon SES (best free tier)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      return 'amazon-ses';
    }
    
    // Check SMTP2GO (good free tier)
    if (process.env.SMTP2GO_USERNAME && process.env.SMTP2GO_PASSWORD) {
      return 'smtp2go';
    }
    
    // Check Mailgun
    if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) {
      return 'mailgun';
    }
    
    // Check Resend (existing)
    if (process.env.RESEND_API_KEY) {
      return 'resend';
    }
    
    // Check SendGrid (existing)
    if (process.env.SENDGRID_API_KEY) {
      return 'sendgrid';
    }
    
    return 'none';
  }

  /**
   * Get the appropriate service instance
   */
  getService() {
    switch (this.provider) {
      case 'mailersend':
        return require('./mailerSendService');
      
      case 'amazon-ses':
        return require('./amazonSESService');
      
      case 'smtp2go':
        return smtp2goService;
      
      case 'mailgun':
        try {
          return require('./mailgunService');
        } catch (error) {
          console.warn('Mailgun service not available, falling back to SMTP2GO');
          return smtp2goService;
        }
      
      case 'resend':
        // You can implement resend service here if needed
        throw new Error('Resend service not implemented in unified service');
      
      case 'sendgrid':
        // You can implement sendgrid service here if needed
        throw new Error('SendGrid service not implemented in unified service');
      
      default:
        throw new Error('No email provider configured. Please configure MailerSend, Amazon SES, SMTP2GO, Mailgun, Resend, or SendGrid');
    }
  }

  /**
   * Send single email
   */
  async sendEmail(emailData) {
    const service = this.getService();
    return await service.sendEmail(emailData);
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails, options = {}) {
    const service = this.getService();
    
    if (service.sendBulkEmails) {
      return await service.sendBulkEmails(emails, options);
    }
    
    // Fallback: send emails one by one
    const results = [];
    for (const emailData of emails) {
      try {
        const result = await service.sendEmail(emailData);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ 
          success: false, 
          error: error.message, 
          to: emailData.to 
        });
      }
    }
    
    return {
      total: emails.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Validate email
   */
  async validateEmail(email) {
    const service = this.getService();
    
    if (service.validateEmail) {
      return await service.validateEmail(email);
    }
    
    // Basic fallback validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      email,
      isValid: emailRegex.test(email),
      provider: this.provider + '-basic'
    };
  }

  /**
   * Test connection
   */
  async testConnection() {
    const service = this.getService();
    
    if (service.testConnection) {
      return await service.testConnection();
    }
    
    // Try sending a test email to verify
    try {
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Connection Test',
        html: '<p>Test email</p>',
        campaignType: 'test'
      });
      return { success: true, message: `${this.provider} connection verified` };
    } catch (error) {
      throw new Error(`${this.provider} connection failed: ${error.message}`);
    }
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    const service = this.getService();
    
    if (service.getServiceInfo) {
      return service.getServiceInfo();
    }
    
    return {
      provider: this.provider,
      configured: this.provider !== 'none'
    };
  }

  /**
   * Get account statistics
   */
  async getAccountStats() {
    const service = this.getService();
    
    if (service.getAccountStats) {
      return await service.getAccountStats();
    }
    
    return { error: 'Statistics not available for this provider' };
  }
}

module.exports = new EmailService();
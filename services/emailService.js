// Simplified email service now dedicated to Resend only

class EmailService {
  constructor() {
    this.provider = 'resend';
    console.log('📧 Email service initialized with provider: resend');
  }

  /**
   * Get the appropriate service instance
   */
  getService() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('Resend not configured. Please set RESEND_API_KEY');
    }
    return require('./resendService');
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
      return service.sendBulkEmails(emails, options);
    }
    const results = [];
    for (const emailData of emails) {
      try {
        const result = await service.sendEmail(emailData);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message, to: emailData.to });
      }
    }
    return { total: emails.length, successful: results.filter(r=>r.success).length, failed: results.filter(r=>!r.success).length, results };
  }

  /**
   * Validate email
   */
  async validateEmail(email) {
    const service = this.getService();
    if (service.validateEmail) return service.validateEmail(email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return { email, isValid: emailRegex.test(email), provider: 'resend-basic' };
  }

  /**
   * Test connection
   */
  async testConnection() {
    const service = this.getService();
    if (service.testConnection) return service.testConnection();
    return { success: !!process.env.RESEND_API_KEY, message: 'Resend API key present' };
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    const service = this.getService();
    if (service.getServiceInfo) return service.getServiceInfo();
    return { provider: 'resend', configured: true };
  }

  /**
   * Record email click
   */
  async recordClick(messageId, clickData) {
    const service = this.getService();
    if (service.recordClick) return service.recordClick(messageId, clickData);
    // Fallback implementation
    console.log('Recording click:', messageId, clickData);
    return { success: true };
  }

  /**
   * Record email open
   */
  async recordOpen(messageId, openData) {
    const service = this.getService();
    if (service.recordOpen) return service.recordOpen(messageId, openData);
    // Fallback implementation
    console.log('Recording open:', messageId, openData);
    return { success: true };
  }
}

module.exports = new EmailService();
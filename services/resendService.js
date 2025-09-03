// Resend email service integration (minimal wrapper around utils/resendEmailService)
const resendUtil = require('../utils/resendEmailService');

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

    const { to, from, subject, html, text, campaignId, subscriberId, campaignType = 'marketing' } = emailData;

    // Pass through to util. Util sets verified from and optional reply_to.
    const data = await resendUtil.sendEmail({ to, subject, html, text, from, fromName: process.env.MAILERSEND_FROM_NAME || 'EmailXP' });

    return {
      success: true,
      messageId: data?.id || undefined,
      provider: 'resend',
      to: Array.isArray(to) ? to : [to],
      subject,
      meta: { campaignId, subscriberId, campaignType }
    };
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
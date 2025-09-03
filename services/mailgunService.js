// Mailgun service for email delivery
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

class MailgunService {
  constructor() {
    this.mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
      url: process.env.MAILGUN_URL || 'https://api.mailgun.net' // EU: https://api.eu.mailgun.net
    });
    this.domain = process.env.MAILGUN_DOMAIN;
  }

  /**
   * Send a single email
   */
  async sendEmail(emailData) {
    try {
      const messageData = {
        from: emailData.from || `${process.env.APP_NAME} <noreply@${this.domain}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        // Tracking and analytics
        'o:tracking': 'yes',
        'o:tracking-clicks': 'yes',
        'o:tracking-opens': 'yes',
        // Custom variables for campaign tracking
        'v:campaign_id': emailData.campaignId,
        'v:subscriber_id': emailData.subscriberId,
        'v:template_id': emailData.templateId,
        // Tags for organization
        'o:tag': [emailData.campaignType || 'campaign', emailData.category || 'marketing']
      };

      // Add custom headers if provided
      if (emailData.headers) {
        Object.keys(emailData.headers).forEach(key => {
          messageData[`h:${key}`] = emailData.headers[key];
        });
      }

      const response = await this.mg.messages.create(this.domain, messageData);
      
      return {
        success: true,
        messageId: response.id,
        message: response.message
      };
    } catch (error) {
      console.error('Mailgun send error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Send bulk emails (batch processing)
   */
  async sendBulkEmails(emails) {
    const results = [];
    const batchSize = 1000; // Mailgun limit
    
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(email => this.sendEmail(email))
      );
      
      results.push(...batchResults);
      
      // Rate limiting - respect Mailgun limits
      if (i + batchSize < emails.length) {
        await this.delay(1000); // 1 second between batches
      }
    }
    
    return results;
  }

  /**
   * Validate email address
   */
  async validateEmail(email) {
    try {
      const response = await this.mg.validate.get(email);
      return {
        isValid: response.is_valid,
        isDisposable: response.is_disposable_address,
        isRoleAccount: response.is_role_address,
        reason: response.reason,
        risk: response.risk
      };
    } catch (error) {
      console.error('Email validation error:', error);
      return { isValid: false, reason: 'validation_failed' };
    }
  }

  /**
   * Get email statistics
   */
  async getStats(domain, startDate, endDate) {
    try {
      const response = await this.mg.stats.getDomain(domain, {
        start: startDate,
        end: endDate,
        resolution: 'day',
        duration: '30d'
      });
      
      return response;
    } catch (error) {
      console.error('Stats retrieval error:', error);
      throw error;
    }
  }

  /**
   * Get suppression lists (bounces, unsubscribes, complaints)
   */
  async getSuppressionList(type = 'bounces') {
    try {
      const response = await this.mg.suppressions[type].list(this.domain);
      return response;
    } catch (error) {
      console.error(`Suppression list (${type}) error:`, error);
      throw error;
    }
  }

  /**
   * Add email to suppression list
   */
  async addToSuppressionList(type, email, reason = '') {
    try {
      const data = { address: email };
      if (reason) data.reason = reason;
      
      const response = await this.mg.suppressions[type].create(this.domain, data);
      return response;
    } catch (error) {
      console.error(`Add to suppression list (${type}) error:`, error);
      throw error;
    }
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppressionList(type, email) {
    try {
      const response = await this.mg.suppressions[type].destroy(this.domain, email);
      return response;
    } catch (error) {
      console.error(`Remove from suppression list (${type}) error:`, error);
      throw error;
    }
  }

  /**
   * Get webhook events
   */
  async getEvents(filters = {}) {
    try {
      const response = await this.mg.events.get(this.domain, filters);
      return response;
    } catch (error) {
      console.error('Events retrieval error:', error);
      throw error;
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new MailgunService();
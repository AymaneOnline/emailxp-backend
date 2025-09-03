// MailerSend email service integration
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');

class MailerSendService {
  constructor() {
    this.mailerSend = null;
    this.initializeClient();
  }

  /**
   * Initialize MailerSend client
   */
  initializeClient() {
    if (!process.env.MAILERSEND_API_KEY) {
      console.warn('⚠️  MailerSend API key not configured');
      return;
    }

    this.mailerSend = new MailerSend({
      apiKey: process.env.MAILERSEND_API_KEY,
    });

    console.log('✅ MailerSend client initialized');
  }

  /**
   * Send single email
   */
  async sendEmail(emailData) {
    if (!this.mailerSend) {
      throw new Error('MailerSend not configured. Please add MAILERSEND_API_KEY to .env file');
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

    try {
      // Prepare sender
      const sentFrom = new Sender(
        from || process.env.MAILERSEND_FROM_EMAIL || process.env.EMAIL_FROM,
        process.env.MAILERSEND_FROM_NAME || 'EmailXP'
      );

      // Prepare recipients
      const recipients = Array.isArray(to) ? 
        to.map(email => new Recipient(email)) : 
        [new Recipient(to)];

      // Create email parameters
      const emailParams = new EmailParams()
        .setFrom(sentFrom)
        .setTo(recipients)
        .setSubject(subject);

      // Add content
      if (html) {
        emailParams.setHtml(html);
      }
      if (text) {
        emailParams.setText(text);
      }

      // Add tags for tracking
      const tags = [
        `campaign:${campaignId || 'unknown'}`,
        `type:${campaignType}`,
        'app:emailxp'
      ];
      emailParams.setTags(tags);

      // Add custom variables for tracking
      if (campaignId || subscriberId) {
        const variables = [];
        if (campaignId) {
          variables.push({
            email: Array.isArray(to) ? to[0] : to,
            substitutions: [
              {
                var: 'campaign_id',
                value: campaignId
              }
            ]
          });
        }
        if (subscriberId) {
          variables.push({
            email: Array.isArray(to) ? to[0] : to,
            substitutions: [
              {
                var: 'subscriber_id',
                value: subscriberId
              }
            ]
          });
        }
        emailParams.setVariables(variables);
      }

      // Send email
      const response = await this.mailerSend.email.send(emailParams);
      
      console.log(`✅ Email sent via MailerSend: ${response.headers['x-message-id']}`);
      
      return {
        success: true,
        messageId: response.headers['x-message-id'],
        provider: 'mailersend',
        to: Array.isArray(to) ? to : [to],
        subject
      };

    } catch (error) {
      console.error('❌ MailerSend send error:', error);
      
      // Handle specific MailerSend errors
      if (error.response) {
        const errorData = error.response.data;
        if (errorData.message) {
          throw new Error(`MailerSend error: ${errorData.message}`);
        }
      }
      
      throw new Error(`Failed to send email via MailerSend: ${error.message}`);
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(emails, options = {}) {
    if (!this.mailerSend) {
      throw new Error('MailerSend not configured');
    }

    const results = [];
    const batchSize = options.batchSize || 10; // MailerSend rate limits
    const delayBetweenBatches = options.delay || 2000; // 2 second delay

    console.log(`📧 Sending ${emails.length} emails via MailerSend in batches of ${batchSize}`);

    // Process in batches
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      try {
        // Send batch concurrently but with rate limiting
        const batchPromises = batch.map(emailData => 
          this.sendEmail(emailData).catch(error => ({
            success: false,
            error: error.message,
            to: emailData.to
          }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        console.log(`📊 Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(emails.length/batchSize)}`);
        
        // Delay between batches (except for last batch)
        if (i + batchSize < emails.length) {
          await this.delay(delayBetweenBatches);
        }
      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
        
        // Add failed results for this batch
        batch.forEach(emailData => {
          results.push({
            success: false,
            error: error.message,
            to: emailData.to
          });
        });
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
   * Get account statistics
   */
  async getAccountStats() {
    if (!this.mailerSend) {
      return { error: 'MailerSend client not configured' };
    }

    try {
      // Get analytics data for the last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const analytics = await this.mailerSend.analytics.getByDate({
        date_from: Math.floor(startDate.getTime() / 1000),
        date_to: Math.floor(endDate.getTime() / 1000),
        tags: ['app:emailxp']
      });

      return {
        sent: analytics.data?.sent || 0,
        delivered: analytics.data?.delivered || 0,
        opened: analytics.data?.opened || 0,
        clicked: analytics.data?.clicked || 0,
        bounced: analytics.data?.bounced || 0,
        complained: analytics.data?.complained || 0,
        unsubscribed: analytics.data?.unsubscribed || 0,
        provider: 'mailersend',
        period: '30 days'
      };
    } catch (error) {
      console.error('Failed to get MailerSend analytics:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Validate email address using MailerSend
   */
  async validateEmail(email) {
    // MailerSend doesn't have a built-in validation API in the free tier
    // So we'll do enhanced basic validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    // Enhanced checks
    const isDisposable = this.isDisposableEmail(email);
    const isRoleAccount = this.isRoleAccount(email);
    const domain = email.split('@')[1]?.toLowerCase();
    const isCommonProvider = this.isCommonEmailProvider(domain);
    
    return {
      email,
      isValid,
      isDisposable,
      isRoleAccount,
      isCommonProvider,
      domain,
      provider: 'mailersend-enhanced-validation'
    };
  }

  /**
   * Check if email is from disposable domain
   */
  isDisposableEmail(email) {
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
      'mailinator.com', 'yopmail.com', 'temp-mail.org',
      'throwaway.email', 'getnada.com', 'maildrop.cc'
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
      'noreply', 'no-reply', 'help', 'service', 'team', 'office'
    ];
    
    const localPart = email.split('@')[0]?.toLowerCase();
    return roleAccounts.includes(localPart);
  }

  /**
   * Check if email is from common provider
   */
  isCommonEmailProvider(domain) {
    const commonProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'protonmail.com', 'zoho.com'
    ];
    
    return commonProviders.includes(domain);
  }

  /**
   * Test connection
   */
  async testConnection() {
    if (!this.mailerSend) {
      throw new Error('MailerSend not configured');
    }

    try {
      // Try to get account info to test connection
      await this.getAccountStats();
      return { success: true, message: 'MailerSend connection verified' };
    } catch (error) {
      throw new Error(`MailerSend connection failed: ${error.message}`);
    }
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'MailerSend',
      configured: !!process.env.MAILERSEND_API_KEY,
      features: {
        bulkSending: true,
        analytics: 'advanced',
        webhooks: true,
        validation: 'enhanced-basic',
        templates: true,
        freeLimit: '3,000 emails first month, then 1,000/month'
      }
    };
  }

  /**
   * Get suppression list (bounced/complained emails)
   */
  async getSuppressionList() {
    if (!this.mailerSend) {
      return { error: 'MailerSend client not configured' };
    }

    try {
      const suppressions = await this.mailerSend.suppressions.getAll();
      return {
        total: suppressions.data?.length || 0,
        suppressions: suppressions.data || [],
        provider: 'mailersend'
      };
    } catch (error) {
      console.error('Failed to get suppression list:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new MailerSendService();
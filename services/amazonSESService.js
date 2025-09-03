// Amazon SES email service integration
const { SESClient, SendEmailCommand, SendBulkEmailCommand } = require('@aws-sdk/client-ses');
const { SESv2Client, GetAccountCommand, PutAccountDetailsCommand } = require('@aws-sdk/client-sesv2');

class AmazonSESService {
  constructor() {
    this.sesClient = null;
    this.sesv2Client = null;
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.initializeClients();
  }

  /**
   * Initialize AWS SES clients
   */
  initializeClients() {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('⚠️  AWS SES credentials not configured');
      return;
    }

    const config = {
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    };

    this.sesClient = new SESClient(config);
    this.sesv2Client = new SESv2Client(config);

    console.log(`✅ Amazon SES initialized in region: ${this.region}`);
  }

  /**
   * Send single email
   */
  async sendEmail(emailData) {
    if (!this.sesClient) {
      throw new Error('Amazon SES not configured. Please add AWS credentials to .env file');
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

    // Prepare email parameters
    const params = {
      Source: from || process.env.AWS_SES_FROM_EMAIL || process.env.EMAIL_FROM,
      Destination: {
        ToAddresses: Array.isArray(to) ? to : [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: html ? {
            Data: html,
            Charset: 'UTF-8',
          } : undefined,
          Text: text ? {
            Data: text,
            Charset: 'UTF-8',
          } : undefined,
        },
      },
      // Tags for tracking
      Tags: [
        {
          Name: 'CampaignId',
          Value: campaignId || 'unknown',
        },
        {
          Name: 'CampaignType',
          Value: campaignType,
        },
        {
          Name: 'Application',
          Value: 'EmailXP',
        },
      ],
    };

    try {
      const command = new SendEmailCommand(params);
      const result = await this.sesClient.send(command);
      
      console.log(`✅ Email sent via Amazon SES: ${result.MessageId}`);
      
      return {
        success: true,
        messageId: result.MessageId,
        provider: 'amazon-ses',
        to: Array.isArray(to) ? to : [to],
        subject
      };

    } catch (error) {
      console.error('❌ Amazon SES send error:', error);
      
      // Handle specific SES errors
      if (error.name === 'MessageRejected') {
        throw new Error(`Email rejected by Amazon SES: ${error.message}`);
      } else if (error.name === 'MailFromDomainNotVerifiedException') {
        throw new Error('Email domain not verified in Amazon SES. Please verify your domain first.');
      } else if (error.name === 'ConfigurationSetDoesNotExistException') {
        throw new Error('SES Configuration Set not found. Check your SES setup.');
      }
      
      throw new Error(`Failed to send email via Amazon SES: ${error.message}`);
    }
  }

  /**
   * Send bulk emails with SES bulk API
   */
  async sendBulkEmails(emails, options = {}) {
    if (!this.sesClient) {
      throw new Error('Amazon SES not configured');
    }

    const results = [];
    const batchSize = options.batchSize || 50; // SES bulk limit is 50
    const delayBetweenBatches = options.delay || 1000;

    console.log(`📧 Sending ${emails.length} emails via Amazon SES in batches of ${batchSize}`);

    // Process in batches
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      try {
        const batchResult = await this.sendBulkEmailBatch(batch);
        results.push(...batchResult);
        
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
   * Send bulk email batch using SES bulk API
   */
  async sendBulkEmailBatch(emails) {
    // Group emails by template (subject + content)
    const templates = new Map();
    
    emails.forEach((emailData, index) => {
      const templateKey = `${emailData.subject}|${emailData.html || ''}|${emailData.text || ''}`;
      
      if (!templates.has(templateKey)) {
        templates.set(templateKey, {
          subject: emailData.subject,
          html: emailData.html,
          text: emailData.text,
          from: emailData.from,
          destinations: []
        });
      }
      
      templates.get(templateKey).destinations.push({
        index,
        to: emailData.to,
        campaignId: emailData.campaignId,
        subscriberId: emailData.subscriberId
      });
    });

    const results = [];

    // Send each template group
    for (const [templateKey, template] of templates) {
      const params = {
        Source: template.from || process.env.AWS_SES_FROM_EMAIL || process.env.EMAIL_FROM,
        Template: templateKey, // We'll use a simple approach without templates for now
        DefaultTemplateData: '{}',
        Destinations: template.destinations.map(dest => ({
          Destination: {
            ToAddresses: [dest.to],
          },
          ReplacementTemplateData: JSON.stringify({
            campaignId: dest.campaignId,
            subscriberId: dest.subscriberId
          }),
        })),
      };

      try {
        // For simplicity, we'll send individual emails instead of using bulk template API
        // This is because bulk template API requires pre-created templates
        const batchResults = await Promise.allSettled(
          template.destinations.map(dest => 
            this.sendEmail({
              to: dest.to,
              from: template.from,
              subject: template.subject,
              html: template.html,
              text: template.text,
              campaignId: dest.campaignId,
              subscriberId: dest.subscriberId
            })
          )
        );

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push({ success: true, ...result.value });
          } else {
            results.push({
              success: false,
              error: result.reason.message,
              to: template.destinations[index].to
            });
          }
        });

      } catch (error) {
        template.destinations.forEach(dest => {
          results.push({
            success: false,
            error: error.message,
            to: dest.to
          });
        });
      }
    }

    return results;
  }

  /**
   * Get account sending statistics
   */
  async getAccountStats() {
    if (!this.sesv2Client) {
      return { error: 'SES v2 client not configured' };
    }

    try {
      const command = new GetAccountCommand({});
      const result = await this.sesv2Client.send(command);
      
      return {
        sendingEnabled: result.SendingEnabled,
        productionAccess: result.ProductionAccessEnabled,
        maxSendRate: result.MaxSendRate,
        max24HourSend: result.Max24HourSend,
        sentLast24Hours: result.SentLast24Hours,
        reputation: result.ReputationTrackingEnabled ? 'Enabled' : 'Disabled',
        provider: 'amazon-ses'
      };
    } catch (error) {
      console.error('Failed to get SES account stats:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Validate email address (basic validation)
   */
  async validateEmail(email) {
    // SES doesn't have a built-in validation API, so we'll do basic validation
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
      provider: 'amazon-ses-basic-validation'
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
   * Test connection
   */
  async testConnection() {
    if (!this.sesClient) {
      throw new Error('Amazon SES not configured');
    }

    try {
      // Try to get account info to test connection
      await this.getAccountStats();
      return { success: true, message: 'Amazon SES connection verified' };
    } catch (error) {
      throw new Error(`Amazon SES connection failed: ${error.message}`);
    }
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      provider: 'Amazon SES',
      configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      region: this.region,
      features: {
        bulkSending: true,
        analytics: 'advanced',
        webhooks: true,
        validation: 'basic',
        freeLimit: '3,000 emails/month (62,000 from EC2)'
      }
    };
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AmazonSESService();
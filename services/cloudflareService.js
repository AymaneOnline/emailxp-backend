// emailxp/backend/services/cloudflareService.js

const axios = require('axios');
const logger = require('../utils/logger');

class CloudflareService {
  constructor() {
    this.baseURL = 'https://api.cloudflare.com/client/v4';
  }

  /**
   * Get zone ID for a domain
   * @param {string} apiToken - Cloudflare API token
   * @param {string} domain - Domain name
   * @returns {string|null} Zone ID or null if not found
   */
  async getZoneId(apiToken, domain) {
    try {
      const response = await axios.get(`${this.baseURL}/zones`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        params: {
          name: domain
        }
      });

      if (response.data.success && response.data.result.length > 0) {
        return response.data.result[0].id;
      }

      return null;
    } catch (error) {
      logger.error('Failed to get Cloudflare zone ID', {
        domain,
        error: error.message,
        response: error.response?.data
      });
      throw new Error('Failed to find domain in Cloudflare account');
    }
  }

  /**
   * Create DNS records in Cloudflare
   * @param {string} apiToken - Cloudflare API token
   * @param {string} zoneId - Zone ID
   * @param {Array} records - Array of DNS records to create
   * @returns {Array} Created records
   */
  async createDNSRecords(apiToken, zoneId, records) {
    const createdRecords = [];

    for (const record of records) {
      try {
        const response = await axios.post(
          `${this.baseURL}/zones/${zoneId}/dns_records`,
          {
            type: record.type,
            name: record.name,
            content: record.content,
            ttl: record.ttl || 1, // Auto TTL
            proxied: record.proxied || false
          },
          {
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.success) {
          createdRecords.push(response.data.result);
          logger.info('Created Cloudflare DNS record', {
            zoneId,
            record: record.name,
            type: record.type
          });
        } else {
          logger.warn('Failed to create Cloudflare DNS record', {
            zoneId,
            record: record.name,
            errors: response.data.errors
          });
        }
      } catch (error) {
        logger.error('Error creating Cloudflare DNS record', {
          zoneId,
          record: record.name,
          error: error.message
        });
      }
    }

    return createdRecords;
  }

  /**
   * Setup domain DNS records automatically
   * @param {string} apiToken - Cloudflare API token
   * @param {string} domain - Domain name
   * @param {Object} dnsRecords - DNS records from domain service
   * @returns {Object} Setup result
   */
  async setupDomainDNS(apiToken, domain, dnsRecords) {
    try {
      // Get zone ID
      const zoneId = await this.getZoneId(apiToken, domain);
      if (!zoneId) {
        throw new Error(`Domain ${domain} not found in Cloudflare account`);
      }

      // Prepare records for Cloudflare API
      const records = [
        {
          type: 'CNAME',
          name: dnsRecords.dkim.name,
          content: dnsRecords.dkim.value,
          proxied: false
        },
        {
          type: 'TXT',
          name: dnsRecords.spf.name,
          content: dnsRecords.spf.value,
          proxied: false
        },
        {
          type: 'CNAME',
          name: dnsRecords.tracking.name,
          content: dnsRecords.tracking.value,
          proxied: false
        }
      ];

      // Create records
      const createdRecords = await this.createDNSRecords(apiToken, zoneId, records);

      return {
        success: true,
        zoneId,
        createdRecords: createdRecords.length,
        totalRecords: records.length
      };

    } catch (error) {
      logger.error('Failed to setup Cloudflare DNS', {
        domain,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate API token
   * @param {string} apiToken - Cloudflare API token
   * @returns {boolean} True if token is valid
   */
  async validateToken(apiToken) {
    try {
      const response = await axios.get(`${this.baseURL}/user/tokens/verify`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.success;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new CloudflareService();
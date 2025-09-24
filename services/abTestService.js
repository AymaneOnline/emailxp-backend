// emailxp/backend/services/abTestService.js

const ABTest = require('../models/ABTest');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');

/**
 * A/B Testing Service
 * Provides functionality for creating, managing, and analyzing A/B tests
 */

class ABTestService {
  /**
   * Create a new A/B test
   * @param {Object} userData - User information
   * @param {Object} campaignData - Campaign data
   * @param {Object} abTestData - A/B test configuration
   * @returns {Promise<Object>} - Created A/B test
   */
  async createABTest(userData, campaignData, abTestData) {
    try {
      const { name, description, testType, winnerCriteria, testPercentage, variants } = abTestData;
      
      // Validate test type and variants
      if (!variants || variants.length < 2) {
        throw new Error('At least two variants are required for A/B testing');
      }
      
      // Create the base campaign
      const campaign = new Campaign({
        user: userData.id,
        name: campaignData.name,
        subject: campaignData.subject,
        fromName: campaignData.fromName,
        fromEmail: campaignData.fromEmail,
        htmlContent: campaignData.htmlContent,
        plainTextContent: campaignData.plainTextContent,
        status: 'draft'
      });
      
      await campaign.save();
      
      // Create A/B test
      const abTest = new ABTest({
        user: userData.id,
        campaign: campaign._id,
        name: name.trim(),
        description: description?.trim(),
        testType,
        winnerCriteria,
        testPercentage,
        variants: variants.map(variant => ({
          name: variant.name,
          subject: variant.subject,
          htmlContent: variant.htmlContent,
          fromName: variant.fromName,
          fromEmail: variant.fromEmail
        })),
        status: 'draft'
      });
      
      await abTest.save();
      
      logger.info(`A/B test created: ${abTest.name} for campaign ${campaign.name}`);
      
      return { campaign, abTest };
    } catch (error) {
      logger.error('Error creating A/B test:', error);
      throw new Error(`Failed to create A/B test: ${error.message}`);
    }
  }
  
  /**
   * Start an A/B test
   * @param {Object} userData - User information
   * @param {string} abTestId - A/B test ID
   * @returns {Promise<Object>} - Updated A/B test
   */
  async startABTest(userData, abTestId) {
    try {
      const abTest = await ABTest.findOne({
        _id: abTestId,
        user: userData.id
      }).populate('campaign');
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      if (abTest.status !== 'draft') {
        throw new Error('A/B test must be in draft status to start');
      }
      
      // Update status
      abTest.status = 'running';
      abTest.startDate = new Date();
      await abTest.save();
      
      logger.info(`A/B test started: ${abTest.name}`);
      
      return abTest;
    } catch (error) {
      logger.error('Error starting A/B test:', error);
      throw new Error(`Failed to start A/B test: ${error.message}`);
    }
  }
  
  /**
   * Stop an A/B test
   * @param {Object} userData - User information
   * @param {string} abTestId - A/B test ID
   * @returns {Promise<Object>} - Updated A/B test
   */
  async stopABTest(userData, abTestId) {
    try {
      const abTest = await ABTest.findOne({
        _id: abTestId,
        user: userData.id
      });
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      if (abTest.status !== 'running') {
        throw new Error('A/B test must be running to stop');
      }
      
      // Update status
      abTest.status = 'completed';
      abTest.endDate = new Date();
      await abTest.save();
      
      logger.info(`A/B test stopped: ${abTest.name}`);
      
      return abTest;
    } catch (error) {
      logger.error('Error stopping A/B test:', error);
      throw new Error(`Failed to stop A/B test: ${error.message}`);
    }
  }
  
  /**
   * Declare a winner for an A/B test
   * @param {Object} userData - User information
   * @param {string} abTestId - A/B test ID
   * @param {string} variantId - Winning variant ID (optional, auto-detect if not provided)
   * @returns {Promise<Object>} - Updated A/B test
   */
  async declareWinner(userData, abTestId, variantId = null) {
    try {
      const abTest = await ABTest.findOne({
        _id: abTestId,
        user: userData.id
      });
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      if (abTest.status !== 'running') {
        throw new Error('A/B test must be running to declare a winner');
      }
      
      let winnerVariant;
      
      if (variantId) {
        // Manual winner declaration
        winnerVariant = abTest.variants.id(variantId);
        if (!winnerVariant) {
          throw new Error('Variant not found');
        }
        abTest.manuallyDeclaredWinner = true;
      } else {
        // Auto-detect winner
        if (!abTest.hasEnoughData()) {
          throw new Error('Not enough data to automatically declare a winner');
        }
        winnerVariant = abTest.determineWinner();
        if (!winnerVariant) {
          throw new Error('Could not determine a winner');
        }
      }
      
      // Update A/B test
      abTest.winnerVariant = winnerVariant._id;
      abTest.winnerDeclaredAt = new Date();
      abTest.status = 'completed';
      abTest.endDate = new Date();
      await abTest.save();
      
      logger.info(`Winner declared for A/B test ${abTest.name}: ${winnerVariant.name}`);
      
      return abTest;
    } catch (error) {
      logger.error('Error declaring A/B test winner:', error);
      throw new Error(`Failed to declare A/B test winner: ${error.message}`);
    }
  }
  
  /**
   * Get A/B test results
   * @param {Object} userData - User information
   * @param {string} abTestId - A/B test ID
   * @returns {Promise<Object>} - A/B test with results
   */
  async getABTestResults(userData, abTestId) {
    try {
      const abTest = await ABTest.findOne({
        _id: abTestId,
        user: userData.id
      }).populate('campaign');
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      // Calculate rates for each variant
      const results = {
        ...abTest.toObject(),
        variants: abTest.variants.map(variant => ({
          ...variant.toObject(),
          openRate: abTest.getOpenRate(variant),
          clickRate: abTest.getClickRate(variant)
        }))
      };
      
      return results;
    } catch (error) {
      logger.error('Error getting A/B test results:', error);
      throw new Error(`Failed to get A/B test results: ${error.message}`);
    }
  }
  
  /**
   * Get all A/B tests for a user
   * @param {Object} userData - User information
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} - List of A/B tests
   */
  async getABTests(userData, filters = {}) {
    try {
      const query = {
        user: userData.id
      };
      
      // Apply filters
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.campaign) {
        query.campaign = filters.campaign;
      }
      
      const abTests = await ABTest.find(query)
        .populate('campaign')
        .sort({ createdAt: -1 });
      
      return abTests;
    } catch (error) {
      logger.error('Error getting A/B tests:', error);
      throw new Error(`Failed to get A/B tests: ${error.message}`);
    }
  }
  
  /**
   * Delete an A/B test
   * @param {Object} userData - User information
   * @param {string} abTestId - A/B test ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deleteABTest(userData, abTestId) {
    try {
      const abTest = await ABTest.findOne({
        _id: abTestId,
        user: userData.id
      });
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      if (abTest.status === 'running') {
        throw new Error('Cannot delete a running A/B test');
      }
      
      await abTest.remove();
      
      logger.info(`A/B test deleted: ${abTest.name}`);
      
      return { message: 'A/B test deleted successfully' };
    } catch (error) {
      logger.error('Error deleting A/B test:', error);
      throw new Error(`Failed to delete A/B test: ${error.message}`);
    }
  }
  
  /**
   * Update variant statistics
   * @param {string} abTestId - A/B test ID
   * @param {string} variantId - Variant ID
   * @param {Object} stats - Statistics to update
   * @returns {Promise<Object>} - Updated A/B test
   */
  async updateVariantStats(abTestId, variantId, stats) {
    try {
      const abTest = await ABTest.findById(abTestId);
      
      if (!abTest) {
        throw new Error('A/B test not found');
      }
      
      const variant = abTest.variants.id(variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }
      
      // Update statistics
      if (stats.sentCount !== undefined) variant.sentCount += stats.sentCount;
      if (stats.openCount !== undefined) variant.openCount += stats.openCount;
      if (stats.clickCount !== undefined) variant.clickCount += stats.clickCount;
      if (stats.bounceCount !== undefined) variant.bounceCount += stats.bounceCount;
      if (stats.unsubscribeCount !== undefined) variant.unsubscribeCount += stats.unsubscribeCount;
      if (stats.complaintCount !== undefined) variant.complaintCount += stats.complaintCount;
      
      await abTest.save();
      
      return abTest;
    } catch (error) {
      logger.error('Error updating variant stats:', error);
      throw new Error(`Failed to update variant stats: ${error.message}`);
    }
  }
}

module.exports = new ABTestService();
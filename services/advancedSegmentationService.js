// emailxp/backend/services/advancedSegmentationService.js

const Segment = require('../models/Segment');
const Subscriber = require('../models/Subscriber');

/**
 * Advanced Segmentation Service
 * Provides advanced segmentation capabilities beyond basic filter-based segments
 */

class AdvancedSegmentationService {
  /**
   * Create a dynamic segment based on behavioral patterns
   * @param {Object} userData - User information
   * @param {Object} segmentData - Segment configuration
   * @returns {Promise<Object>} - Created segment
   */
  async createBehavioralSegment(userData, segmentData) {
    try {
      const { name, description, behaviorRules, timeframe } = segmentData;
      
      // Convert behavior rules to standard filters
      const filters = this.convertBehaviorRulesToFilters(behaviorRules);
      
      // Create segment
      const segment = new Segment({
        name: name.trim(),
        description: description?.trim(),
        user: userData.id,
        filters,
        logic: 'AND' // Default to AND for behavior rules
      });
      
      await segment.save();
      
      // Calculate initial subscriber count
      await segment.countSubscribers();
      
      return segment;
    } catch (error) {
      throw new Error(`Failed to create behavioral segment: ${error.message}`);
    }
  }
  
  /**
   * Convert behavior rules to standard filters
   * @param {Array} behaviorRules - Behavior rules configuration
   * @returns {Array} - Standard filters
   */
  convertBehaviorRulesToFilters(behaviorRules) {
    return behaviorRules.map(rule => {
      // This is a simplified conversion - in a real implementation,
      // this would be more complex based on the behavior rule types
      return {
        field: rule.field,
        operator: rule.operator,
        value: rule.value
      };
    });
  }
  
  /**
   * Calculate overlap between multiple segments
   * @param {Object} userData - User information
   * @param {Array} segmentIds - Array of segment IDs
   * @returns {Promise<Array>} - Overlap analysis data
   */
  async calculateSegmentOverlap(userData, segmentIds) {
    try {
      // Get segments
      const segments = await Segment.find({
        _id: { $in: segmentIds },
        user: userData.id,
        isActive: true
      });
      
      if (segments.length !== segmentIds.length) {
        throw new Error('One or more segments not found');
      }
      
      // Get subscribers for each segment
      const segmentSubscribers = {};
      for (const segment of segments) {
        const subscribers = await segment.getSubscribers();
        segmentSubscribers[segment._id] = subscribers.map(s => s._id.toString());
      }
      
      // Calculate overlaps
      const overlapData = [];
      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          const segmentA = segments[i];
          const segmentB = segments[j];
          
          const subscribersA = new Set(segmentSubscribers[segmentA._id]);
          const subscribersB = new Set(segmentSubscribers[segmentB._id]);
          
          // Find intersection
          const intersection = [...subscribersA].filter(id => subscribersB.has(id));
          
          overlapData.push({
            segmentA: {
              id: segmentA._id,
              name: segmentA.name
            },
            segmentB: {
              id: segmentB._id,
              name: segmentB.name
            },
            overlapCount: intersection.length,
            overlapPercentageA: segmentSubscribers[segmentA._id].length > 0 
              ? (intersection.length / segmentSubscribers[segmentA._id].length) * 100 
              : 0,
            overlapPercentageB: segmentSubscribers[segmentB._id].length > 0 
              ? (intersection.length / segmentSubscribers[segmentB._id].length) * 100 
              : 0
          });
        }
      }
      
      return overlapData;
    } catch (error) {
      throw new Error(`Failed to calculate segment overlap: ${error.message}`);
    }
  }
  
  /**
   * Generate segment analytics
   * @param {Object} userData - User information
   * @param {string} segmentId - Segment ID
   * @returns {Promise<Object>} - Analytics data
   */
  async generateSegmentAnalytics(userData, segmentId) {
    try {
      const segment = await Segment.findOne({
        _id: segmentId,
        user: userData.id
      });
      
      if (!segment) {
        throw new Error('Segment not found');
      }
      
      // Get subscribers in segment
      const subscribers = await segment.getSubscribers();
      
      // Calculate analytics
      const analytics = {
        totalSubscribers: subscribers.length,
        engagement: {
          totalOpens: 0,
          totalClicks: 0,
          avgOpenRate: 0,
          avgClickRate: 0
        },
        demographics: {
          countries: {},
          cities: {},
          timezones: {}
        },
        activity: {
          activeLast7Days: 0,
          activeLast30Days: 0,
          inactive90Days: 0
        }
      };
      
      // Process subscriber data for analytics
      subscribers.forEach(subscriber => {
        // Engagement data would come from tracking data in a real implementation
        // For now we'll use mock data
        
        // Demographics
        if (subscriber.location) {
          if (subscriber.location.country) {
            analytics.demographics.countries[subscriber.location.country] = 
              (analytics.demographics.countries[subscriber.location.country] || 0) + 1;
          }
          
          if (subscriber.location.city) {
            analytics.demographics.cities[subscriber.location.city] = 
              (analytics.demographics.cities[subscriber.location.city] || 0) + 1;
          }
          
          if (subscriber.location.timezone) {
            analytics.demographics.timezones[subscriber.location.timezone] = 
              (analytics.demographics.timezones[subscriber.location.timezone] || 0) + 1;
          }
        }
        
        // Activity data
        const lastActivity = subscriber.lastActivity ? new Date(subscriber.lastActivity) : new Date(subscriber.createdAt);
        const daysSinceActivity = (new Date() - lastActivity) / (1000 * 60 * 60 * 24);
        
        if (daysSinceActivity <= 7) {
          analytics.activity.activeLast7Days++;
        } else if (daysSinceActivity <= 30) {
          analytics.activity.activeLast30Days++;
        } else if (daysSinceActivity > 90) {
          analytics.activity.inactive90Days++;
        }
      });
      
      // Sort demographics data
      const sortObjectByValue = (obj) => {
        return Object.entries(obj)
          .sort(([,a], [,b]) => b - a)
          .reduce((r, [k, v]) => ({ ...r, [k]: v }), {});
      };
      
      analytics.demographics.countries = sortObjectByValue(analytics.demographics.countries);
      analytics.demographics.cities = sortObjectByValue(analytics.demographics.cities);
      analytics.demographics.timezones = sortObjectByValue(analytics.demographics.timezones);
      
      return analytics;
    } catch (error) {
      throw new Error(`Failed to generate segment analytics: ${error.message}`);
    }
  }
  
  /**
   * Export segment data
   * @param {Object} userData - User information
   * @param {string} segmentId - Segment ID
   * @returns {Promise<Object>} - Export data
   */
  async exportSegmentData(userData, segmentId) {
    try {
      const segment = await Segment.findOne({
        _id: segmentId,
        user: userData.id
      });
      
      if (!segment) {
        throw new Error('Segment not found');
      }
      
      // Get subscribers in segment
      const subscribers = await segment.getSubscribers();
      
      // Format data for export
      const exportData = subscribers.map(subscriber => ({
        email: subscriber.email,
        firstName: subscriber.firstName,
        lastName: subscriber.lastName,
        status: subscriber.status,
        tags: subscriber.tags ? subscriber.tags.join(';') : '',
        groups: subscriber.groups ? subscriber.groups.join(';') : '',
        createdAt: subscriber.createdAt,
        lastActivity: subscriber.lastActivity,
        engagementScore: subscriber.engagementScore || 0,
        lifetimeValue: subscriber.lifetimeValue || 0,
        purchaseCount: subscriber.purchaseCount || 0
      }));
      
      return {
        segmentName: segment.name,
        exportData
      };
    } catch (error) {
      throw new Error(`Failed to export segment data: ${error.message}`);
    }
  }
  
  /**
   * Create a smart segment based on RFM analysis (Recency, Frequency, Monetary)
   * @param {Object} userData - User information
   * @param {Object} rfmData - RFM configuration
   * @returns {Promise<Object>} - Created segment
   */
  async createRFMSegment(userData, rfmData) {
    try {
      const { name, description, recency, frequency, monetary } = rfmData;
      
      // Build RFM filters
      const filters = [];
      
      // Recency filter (days since last activity)
      if (recency && recency.operator && recency.value) {
        filters.push({
          field: 'lastActivity',
          operator: recency.operator,
          value: recency.value
        });
      }
      
      // Frequency filter (number of purchases)
      if (frequency && frequency.operator && frequency.value) {
        filters.push({
          field: 'purchaseCount',
          operator: frequency.operator,
          value: frequency.value
        });
      }
      
      // Monetary filter (lifetime value)
      if (monetary && monetary.operator && monetary.value) {
        filters.push({
          field: 'lifetimeValue',
          operator: monetary.operator,
          value: monetary.value
        });
      }
      
      // Create segment
      const segment = new Segment({
        name: name.trim(),
        description: description?.trim(),
        user: userData.id,
        filters,
        logic: 'AND'
      });
      
      await segment.save();
      
      // Calculate initial subscriber count
      await segment.countSubscribers();
      
      return segment;
    } catch (error) {
      throw new Error(`Failed to create RFM segment: ${error.message}`);
    }
  }
}

module.exports = new AdvancedSegmentationService();
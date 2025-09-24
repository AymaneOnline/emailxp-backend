// emailxp/backend/services/recommendationEngine.js

const BehavioralEvent = require('../models/BehavioralEvent');
const Template = require('../models/Template');
const Subscriber = require('../models/Subscriber');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');

/**
 * Predictive Content Recommendation Engine
 * Analyzes subscriber behavior to suggest relevant content
 */

/**
 * Calculate content relevance score based on subscriber behavior
 * @param {Object} subscriber - The subscriber object
 * @param {Object} content - The content object (template or campaign)
 * @returns {Number} - Relevance score (0-100)
 */
const calculateRelevanceScore = async (subscriber, content) => {
  try {
    // Get recent behavioral events for this subscriber
    const recentEvents = await BehavioralEvent.find({
      subscriber: subscriber._id,
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }).sort({ timestamp: -1 });
    
    if (recentEvents.length === 0) {
      // No behavior data, return baseline score
      return 50;
    }
    
    let score = 0;
    let maxScore = 0;
    
    // Weight different event types
    const eventWeights = {
      'page_view': 1,
      'product_view': 3,
      'cart_add': 5,
      'purchase': 10,
      'form_submit': 2,
      'link_click': 1,
      'video_view': 2,
      'download': 3,
      'custom': 1
    };
    
    // Analyze content tags/keywords
    const contentTags = extractContentTags(content);
    
    // Score based on event recency (more recent events have higher weight)
    const now = new Date();
    recentEvents.forEach((event, index) => {
      const daysAgo = (now - event.timestamp) / (24 * 60 * 60 * 1000);
      const recencyWeight = Math.max(0.1, 1 - (daysAgo / 30)); // Decreases from 1 to 0.1 over 30 days
      
      // Get event weight
      const eventWeight = eventWeights[event.eventType] || 1;
      
      // Check if event target matches content tags
      let tagMatchScore = 0;
      if (event.target && contentTags.length > 0) {
        const eventTags = extractTagsFromTarget(event.target);
        tagMatchScore = calculateTagSimilarity(eventTags, contentTags);
      }
      
      // Base score for this event
      const eventScore = eventWeight * recencyWeight * (1 + tagMatchScore);
      
      score += eventScore;
      maxScore += eventWeight * recencyWeight * 2; // Max possible score for this event
    });
    
    // Normalize score to 0-100 range
    const normalizedScore = maxScore > 0 ? (score / maxScore) * 100 : 50;
    
    return Math.min(100, Math.max(0, normalizedScore));
  } catch (error) {
    logger.error('Error calculating relevance score:', error);
    return 50; // Return baseline score on error
  }
};

/**
 * Extract tags/keywords from content
 * @param {Object} content - The content object
 * @returns {Array} - Array of tags
 */
const extractContentTags = (content) => {
  const tags = [];
  
  // Extract from content name
  if (content.name) {
    tags.push(...content.name.toLowerCase().split(/\s+/));
  }
  
  // Extract from content description
  if (content.description) {
    tags.push(...content.description.toLowerCase().split(/\s+/));
  }
  
  // Extract from content category
  if (content.category) {
    tags.push(content.category.toLowerCase());
  }
  
  // Extract from explicit tags
  if (content.tags && Array.isArray(content.tags)) {
    content.tags.forEach(tag => {
      if (typeof tag === 'string') {
        tags.push(tag.toLowerCase());
      }
    });
  }
  
  // Remove duplicates and common words
  const commonWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'];
  return [...new Set(tags.filter(tag => tag.length > 2 && !commonWords.includes(tag)))];
};

/**
 * Extract tags from event target
 * @param {String} target - The event target
 * @returns {Array} - Array of tags
 */
const extractTagsFromTarget = (target) => {
  if (!target) return [];
  
  // Extract words from URL or text
  const cleanTarget = target
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  return cleanTarget.split(/\s+/).filter(word => word.length > 2);
};

/**
 * Calculate similarity between two tag arrays
 * @param {Array} tags1 - First array of tags
 * @param {Array} tags2 - Second array of tags
 * @returns {Number} - Similarity score (0-1)
 */
const calculateTagSimilarity = (tags1, tags2) => {
  if (tags1.length === 0 || tags2.length === 0) return 0;
  
  // Calculate intersection
  const intersection = tags1.filter(tag => tags2.includes(tag));
  
  // Jaccard similarity coefficient
  const union = [...new Set([...tags1, ...tags2])];
  return union.length > 0 ? intersection.length / union.length : 0;
};

/**
 * Get content recommendations for a subscriber
 * @param {String} userId - The user ID
 * @param {String} subscriberId - The subscriber ID
 * @param {Object} options - Recommendation options
 * @returns {Promise<Array>} - Array of recommended content
 */
const getRecommendations = async (userId, subscriberId, options = {}) => {
  try {
    const { limit = 10, contentType = 'template', excludeIds = [] } = options;
    
    // Get subscriber
    const subscriber = await Subscriber.findById(subscriberId);
    if (!subscriber) {
      throw new Error('Subscriber not found');
    }
    
    // Get available content
    let contentQuery = { user: userId, isActive: true };
    
    if (excludeIds.length > 0) {
      contentQuery._id = { $nin: excludeIds };
    }
    
    let contentItems;
    if (contentType === 'campaign') {
      contentItems = await Campaign.find(contentQuery).limit(100);
    } else {
      contentItems = await Template.find(contentQuery).limit(100);
    }
    
    // Calculate relevance scores for each content item
    const scoredContent = [];
    
    for (const content of contentItems) {
      const score = await calculateRelevanceScore(subscriber, content);
      scoredContent.push({
        content,
        score,
        contentType
      });
    }
    
    // Sort by score (descending) and limit results
    scoredContent.sort((a, b) => b.score - a.score);
    
    return scoredContent.slice(0, limit);
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    throw error;
  }
};

/**
 * Get personalized content for a subscriber based on their segment
 * @param {String} userId - The user ID
 * @param {String} subscriberId - The subscriber ID
 * @param {Object} options - Personalization options
 * @returns {Promise<Object>} - Personalized content
 */
const getPersonalizedContent = async (userId, subscriberId, options = {}) => {
  try {
    const { contentType = 'template', limit = 5 } = options;
    
    // Get recommendations
    const recommendations = await getRecommendations(userId, subscriberId, {
      limit,
      contentType
    });
    
    // If we have recommendations, return the top one
    if (recommendations.length > 0) {
      return recommendations[0].content;
    }
    
    // Fallback: get random content
    let contentQuery = { user: userId, isActive: true };
    
    let content;
    if (contentType === 'campaign') {
      content = await Campaign.findOne(contentQuery).sort({ 'stats.timesUsed': -1 });
    } else {
      content = await Template.findOne(contentQuery).sort({ 'stats.timesUsed': -1 });
    }
    
    return content;
  } catch (error) {
    logger.error('Error getting personalized content:', error);
    throw error;
  }
};

/**
 * Update content recommendations based on subscriber feedback
 * @param {String} userId - The user ID
 * @param {String} subscriberId - The subscriber ID
 * @param {String} contentId - The content ID
 * @param {String} feedback - The feedback (open, click, purchase, etc.)
 * @returns {Promise<void>}
 */
const updateRecommendationsWithFeedback = async (userId, subscriberId, contentId, feedback) => {
  try {
    // Create a behavioral event for this feedback
    const feedbackEvent = new BehavioralEvent({
      user: userId,
      subscriber: subscriberId,
      eventType: 'custom',
      customEventType: `content_${feedback}`,
      target: contentId,
      data: { feedback, timestamp: new Date() }
    });
    
    await feedbackEvent.save();
    
    logger.info(`Updated recommendations with feedback: ${feedback} for content ${contentId}`);
  } catch (error) {
    logger.error('Error updating recommendations with feedback:', error);
  }
};

/**
 * Get subscriber engagement profile
 * @param {String} subscriberId - The subscriber ID
 * @returns {Promise<Object>} - Engagement profile
 */
const getSubscriberEngagementProfile = async (subscriberId) => {
  try {
    // Get recent behavioral events
    const recentEvents = await BehavioralEvent.find({
      subscriber: subscriberId,
      timestamp: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
    }).sort({ timestamp: -1 });
    
    if (recentEvents.length === 0) {
      return {
        engagementLevel: 'low',
        preferredCategories: [],
        preferredContentTypes: [],
        activityFrequency: 'inactive'
      };
    }
    
    // Calculate engagement metrics
    const eventCounts = {};
    const categoryCounts = {};
    const contentTypeCounts = {};
    
    // Count event types
    recentEvents.forEach(event => {
      eventCounts[event.eventType] = (eventCounts[event.eventType] || 0) + 1;
      
      // Extract category from target if possible
      if (event.target) {
        const urlParts = event.target.split('/');
        if (urlParts.length > 1) {
          const category = urlParts[1];
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
      }
    });
    
    // Determine engagement level based on activity
    const totalEvents = recentEvents.length;
    let engagementLevel = 'low';
    if (totalEvents > 50) {
      engagementLevel = 'high';
    } else if (totalEvents > 10) {
      engagementLevel = 'medium';
    }
    
    // Determine activity frequency
    const firstEvent = recentEvents[recentEvents.length - 1];
    const lastEvent = recentEvents[0];
    const daysActive = (lastEvent.timestamp - firstEvent.timestamp) / (24 * 60 * 60 * 1000);
    const eventsPerDay = totalEvents / Math.max(1, daysActive);
    
    let activityFrequency = 'inactive';
    if (eventsPerDay > 1) {
      activityFrequency = 'daily';
    } else if (eventsPerDay > 0.1) {
      activityFrequency = 'weekly';
    } else if (eventsPerDay > 0.01) {
      activityFrequency = 'monthly';
    }
    
    // Get preferred categories (top 3)
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category]) => category);
    
    // Get preferred content types
    const sortedContentTypes = Object.entries(contentTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
    
    return {
      engagementLevel,
      preferredCategories: sortedCategories,
      preferredContentTypes: sortedContentTypes,
      activityFrequency,
      totalEvents,
      eventDistribution: eventCounts
    };
  } catch (error) {
    logger.error('Error getting subscriber engagement profile:', error);
    return {
      engagementLevel: 'unknown',
      preferredCategories: [],
      preferredContentTypes: [],
      activityFrequency: 'unknown'
    };
  }
};

module.exports = {
  calculateRelevanceScore,
  getRecommendations,
  getPersonalizedContent,
  updateRecommendationsWithFeedback,
  getSubscriberEngagementProfile
};
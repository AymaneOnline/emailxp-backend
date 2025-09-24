// emailxp/backend/services/personalizationService.js

/**
 * Personalization Service
 * Handles dynamic content personalization based on subscriber data
 */

/**
 * Get personalized value for a variable from subscriber data
 * @param {string} variable - The variable name (e.g., 'name', 'location.country')
 * @param {object} subscriber - The subscriber data
 * @returns {string} - The personalized value
 */
const getPersonalizedValue = (variable, subscriber) => {
  // Handle nested properties (e.g., 'location.country')
  if (variable.includes('.')) {
    const parts = variable.split('.');
    let value = subscriber;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return '';
      }
    }
    
    return value || '';
  }
  
  // Handle direct properties
  switch (variable) {
    case 'name':
      return subscriber.name || '';
    case 'firstName':
      return subscriber.name ? subscriber.name.split(' ')[0] : '';
    case 'lastName':
      return subscriber.name && subscriber.name.split(' ').length > 1 ? 
        subscriber.name.split(' ').slice(1).join(' ') : '';
    case 'email':
      return subscriber.email || '';
    default:
      // Check custom fields
      if (subscriber.customFields && variable in subscriber.customFields) {
        return subscriber.customFields[variable] || '';
      }
      return '';
  }
};

/**
 * Evaluate a condition against subscriber data
 * @param {object} condition - The condition to evaluate
 * @param {object} subscriber - The subscriber data
 * @returns {boolean} - Whether the condition is met
 */
const evaluateCondition = (condition, subscriber) => {
  const { variable, operator, value } = condition;
  const subscriberValue = getPersonalizedValue(variable, subscriber);
  
  switch (operator) {
    case 'equals':
      return subscriberValue === value;
    case 'notEquals':
      return subscriberValue !== value;
    case 'contains':
      return subscriberValue.includes(value);
    case 'notContains':
      return !subscriberValue.includes(value);
    case 'startsWith':
      return subscriberValue.startsWith(value);
    case 'endsWith':
      return subscriberValue.endsWith(value);
    case 'greaterThan':
      return parseFloat(subscriberValue) > parseFloat(value);
    case 'lessThan':
      return parseFloat(subscriberValue) < parseFloat(value);
    default:
      return false;
  }
};

/**
 * Get content for a dynamic block based on subscriber data and conditions
 * @param {object} block - The dynamic content block
 * @param {object} subscriber - The subscriber data
 * @returns {string} - The personalized content
 */
const getDynamicContent = (block, subscriber) => {
  const { conditions = [], defaultContent = '', variable } = block.content || {};
  
  // If there are conditions, find the first matching one
  for (const condition of conditions) {
    if (evaluateCondition(condition, subscriber)) {
      return condition.content || '';
    }
  }
  
  // If there's a variable specified, use that for personalization
  if (variable) {
    const personalizedValue = getPersonalizedValue(variable, subscriber);
    if (personalizedValue) {
      return personalizedValue;
    }
  }
  
  // Return default content if no conditions match or no variable is specified
  return defaultContent;
};

/**
 * Personalize dynamic content in HTML
 * @param {string} htmlContent - The HTML content with dynamic blocks
 * @param {object} subscriber - The subscriber data
 * @param {array} dynamicBlocks - The dynamic blocks configuration from template
 * @returns {string} - The personalized HTML content
 */
const personalizeDynamicContent = (htmlContent, subscriber, dynamicBlocks = []) => {
  if (!htmlContent || dynamicBlocks.length === 0) {
    // If no dynamic blocks, do basic personalization
    return htmlContent
      .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
      .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
      .replace(/\{\{email\}\}/g, subscriber.email || '');
  }
  
  let result = htmlContent;
  
  // Process each dynamic block
  for (const block of dynamicBlocks) {
    if (block.type === 'dynamic') {
      // Find the dynamic block in the HTML
      const blockRegex = new RegExp(
        `<div class="dynamic-content-block[^>]*data-dynamic-content="${block.id}"[^>]*>[\\s\\S]*?<\\/div>`, 
        'g'
      );
      
      // Get personalized content for this block
      const personalizedContent = getDynamicContent(block, subscriber);
      
      // Replace the block with personalized content
      result = result.replace(blockRegex, 
        `<div class="personalized-content" data-block-id="${block.id}">${personalizedContent}</div>`);
    }
  }
  
  // Apply basic personalization to any remaining merge tags
  result = result
    .replace(/\{\{name\}\}/g, subscriber.name || subscriber.firstName || 'there')
    .replace(/\{\{firstName\}\}/g, subscriber.firstName || subscriber.name || 'there')
    .replace(/\{\{email\}\}/g, subscriber.email || '');
  
  return result;
};

module.exports = {
  getPersonalizedValue,
  evaluateCondition,
  getDynamicContent,
  personalizeDynamicContent
};
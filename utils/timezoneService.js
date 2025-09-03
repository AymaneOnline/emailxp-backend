// emailxp/backend/utils/timezoneService.js

const moment = require('moment-timezone');
const axios = require('axios');
const logger = require('./logger');

/**
 * Get timezone from IP address using a free IP geolocation service
 */
const getTimezoneFromIP = async (ipAddress) => {
  try {
    // Using ipapi.co (free tier: 1000 requests/day)
    // Alternative services: ip-api.com, ipgeolocation.io, etc.
    const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'EmailXP/1.0'
      }
    });

    if (response.data && response.data.timezone) {
      return {
        timezone: response.data.timezone,
        country: response.data.country_name,
        region: response.data.region,
        city: response.data.city,
      };
    }
  } catch (error) {
    logger.warn(`[TimezoneService] Failed to get timezone from IP ${ipAddress}:`, error.message);
  }
  
  return null;
};

/**
 * Validate if a timezone string is valid
 */
const isValidTimezone = (timezone) => {
  try {
    return moment.tz.zone(timezone) !== null;
  } catch (error) {
    return false;
  }
};

/**
 * Get default timezone (UTC)
 */
const getDefaultTimezone = () => {
  return 'UTC';
};

/**
 * Convert a date to a specific timezone
 */
const convertToTimezone = (date, timezone) => {
  try {
    return moment.tz(date, timezone);
  } catch (error) {
    logger.warn(`[TimezoneService] Failed to convert date to timezone ${timezone}:`, error.message);
    return moment.utc(date);
  }
};

/**
 * Calculate send time for a subscriber based on their timezone
 */
const calculateSendTime = (scheduledAt, subscriberTimezone, campaignTimezone = 'UTC') => {
  try {
    // If subscriber has no timezone, use campaign timezone or UTC
    const targetTimezone = subscriberTimezone || campaignTimezone || 'UTC';
    
    // Convert the scheduled time to the target timezone
    const scheduledMoment = moment.tz(scheduledAt, campaignTimezone);
    const targetMoment = scheduledMoment.clone().tz(targetTimezone);
    
    // Return the UTC timestamp for when to send
    return targetMoment.utc().toDate();
  } catch (error) {
    logger.warn(`[TimezoneService] Failed to calculate send time:`, error.message);
    return new Date(scheduledAt);
  }
};

/**
 * Group subscribers by their timezone
 */
const groupSubscribersByTimezone = (subscribers) => {
  const timezoneGroups = new Map();
  
  subscribers.forEach(subscriber => {
    const timezone = subscriber.location?.timezone || getDefaultTimezone();
    
    if (!timezoneGroups.has(timezone)) {
      timezoneGroups.set(timezone, []);
    }
    
    timezoneGroups.get(timezone).push(subscriber);
  });
  
  return timezoneGroups;
};

/**
 * Get all available timezones
 */
const getAllTimezones = () => {
  return moment.tz.names();
};

/**
 * Get common timezones with their display names
 */
const getCommonTimezones = () => {
  return [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
    { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
    { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
    { value: 'Europe/London', label: 'London (GMT/BST)' },
    { value: 'Europe/Paris', label: 'Central European Time' },
    { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'China Standard Time' },
    { value: 'Asia/Kolkata', label: 'India Standard Time' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
    { value: 'Pacific/Auckland', label: 'New Zealand Standard Time' },
  ];
};

/**
 * Update subscriber location and timezone from IP
 */
const updateSubscriberTimezone = async (subscriber, ipAddress) => {
  try {
    if (!ipAddress || subscriber.location?.timezone) {
      return subscriber; // Skip if no IP or timezone already set
    }

    const locationData = await getTimezoneFromIP(ipAddress);
    
    if (locationData) {
      subscriber.location = {
        ...subscriber.location,
        country: locationData.country,
        region: locationData.region,
        city: locationData.city,
        timezone: locationData.timezone,
        ipAddress: ipAddress,
      };
      
      await subscriber.save();
      logger.log(`[TimezoneService] Updated timezone for subscriber ${subscriber.email}: ${locationData.timezone}`);
    }
    
    return subscriber;
  } catch (error) {
    logger.error(`[TimezoneService] Failed to update subscriber timezone:`, error);
    return subscriber;
  }
};

module.exports = {
  getTimezoneFromIP,
  isValidTimezone,
  getDefaultTimezone,
  convertToTimezone,
  calculateSendTime,
  groupSubscribersByTimezone,
  getAllTimezones,
  getCommonTimezones,
  updateSubscriberTimezone,
};
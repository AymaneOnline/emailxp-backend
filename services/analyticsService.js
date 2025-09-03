// emailxp/backend/services/analyticsService.js

const Analytics = require('../models/Analytics');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Subscriber = require('../models/Subscriber');
const EmailTracking = require('../models/EmailTracking');

class AnalyticsService {
  // Generate analytics for a specific entity
  async generateAnalytics(userId, entityId, entityType, period = 'day') {
    try {
      const { periodStart, periodEnd } = this.getPeriodDates(period);
      
      // Check if analytics already exist for this period
      let analytics = await Analytics.findOne({
        user: userId,
        entityId,
        entityType,
        period,
        periodStart,
        periodEnd
      });

      if (!analytics) {
        analytics = new Analytics({
          user: userId,
          entityId,
          entityType,
          type: this.getAnalyticsType(entityType),
          period,
          periodStart,
          periodEnd
        });
      }

      // Collect metrics based on entity type
      await this.collectMetrics(analytics, entityId, entityType, periodStart, periodEnd);
      
      // Calculate rates
      analytics.calculateRates();
      
      // Compare with previous period
      const previousAnalytics = await this.getPreviousPeriodAnalytics(analytics);
      if (previousAnalytics) {
        analytics.compareWithPrevious(previousAnalytics);
      }

      await analytics.save();
      return analytics;
    } catch (error) {
      console.error('Error generating analytics:', error);
      throw error;
    }
  }

  // Collect metrics from tracking data
  async collectMetrics(analytics, entityId, entityType, periodStart, periodEnd) {
    const query = {
      createdAt: { $gte: periodStart, $lte: periodEnd }
    };

    // Add entity-specific filters
    if (entityType === 'Campaign') {
      query.campaignId = entityId;
    } else if (entityType === 'Template') {
      query.templateId = entityId;
    } else if (entityType === 'Subscriber') {
      query.subscriberId = entityId;
    }

    // Get tracking data
    const trackingData = await EmailTracking.find(query);
    
    // Initialize metrics
    const metrics = {
      sent: 0,
      delivered: 0,
      bounced: 0,
      failed: 0,
      opened: 0,
      uniqueOpens: 0,
      clicked: 0,
      uniqueClicks: 0,
      unsubscribed: 0,
      complained: 0,
      forwarded: 0,
      replied: 0,
      socialShares: 0,
      deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0, unknown: 0 },
      clientBreakdown: { gmail: 0, outlook: 0, yahoo: 0, apple: 0, other: 0 },
      geoBreakdown: [],
      linkPerformance: []
    };

    // Process tracking data
    const uniqueOpeners = new Set();
    const uniqueClickers = new Set();
    const geoMap = new Map();
    const linkMap = new Map();
    let totalOpenTime = 0;
    let totalClickTime = 0;
    const hourlyEngagement = new Array(24).fill(0);

    for (const track of trackingData) {
      // Basic metrics
      if (track.status === 'sent') metrics.sent++;
      if (track.status === 'delivered') metrics.delivered++;
      if (track.status === 'bounced') metrics.bounced++;
      if (track.status === 'failed') metrics.failed++;

      // Engagement metrics
      if (track.events) {
        for (const event of track.events) {
          switch (event.type) {
            case 'open':
              metrics.opened++;
              uniqueOpeners.add(track.subscriberId.toString());
              
              // Track open time and hour
              if (event.timestamp) {
                const hour = new Date(event.timestamp).getHours();
                hourlyEngagement[hour]++;
                
                if (event.metadata?.timeSpent) {
                  totalOpenTime += event.metadata.timeSpent;
                }
              }
              
              // Device and client tracking
              if (event.metadata?.device) {
                const device = event.metadata.device.toLowerCase();
                if (metrics.deviceBreakdown[device] !== undefined) {
                  metrics.deviceBreakdown[device]++;
                } else {
                  metrics.deviceBreakdown.unknown++;
                }
              }
              
              if (event.metadata?.client) {
                const client = event.metadata.client.toLowerCase();
                if (metrics.clientBreakdown[client] !== undefined) {
                  metrics.clientBreakdown[client]++;
                } else {
                  metrics.clientBreakdown.other++;
                }
              }
              
              // Geographic tracking
              if (event.metadata?.location) {
                const location = event.metadata.location;
                const geoKey = `${location.country}-${location.region}-${location.city}`;
                
                if (!geoMap.has(geoKey)) {
                  geoMap.set(geoKey, {
                    country: location.country,
                    region: location.region,
                    city: location.city,
                    opens: 0,
                    clicks: 0
                  });
                }
                geoMap.get(geoKey).opens++;
              }
              break;

            case 'click':
              metrics.clicked++;
              uniqueClickers.add(track.subscriberId.toString());
              
              if (event.timestamp) {
                const hour = new Date(event.timestamp).getHours();
                hourlyEngagement[hour]++;
                
                if (event.metadata?.timeSpent) {
                  totalClickTime += event.metadata.timeSpent;
                }
              }
              
              // Link performance tracking
              if (event.metadata?.url) {
                const url = event.metadata.url;
                if (!linkMap.has(url)) {
                  linkMap.set(url, { url, clicks: 0, uniqueClicks: new Set() });
                }
                linkMap.get(url).clicks++;
                linkMap.get(url).uniqueClicks.add(track.subscriberId.toString());
              }
              
              // Geographic tracking for clicks
              if (event.metadata?.location) {
                const location = event.metadata.location;
                const geoKey = `${location.country}-${location.region}-${location.city}`;
                
                if (!geoMap.has(geoKey)) {
                  geoMap.set(geoKey, {
                    country: location.country,
                    region: location.region,
                    city: location.city,
                    opens: 0,
                    clicks: 0
                  });
                }
                geoMap.get(geoKey).clicks++;
              }
              break;

            case 'unsubscribe':
              metrics.unsubscribed++;
              break;

            case 'complaint':
              metrics.complained++;
              break;

            case 'forward':
              metrics.forwarded++;
              break;

            case 'reply':
              metrics.replied++;
              break;

            case 'social_share':
              metrics.socialShares++;
              break;
          }
        }
      }
    }

    // Finalize metrics
    metrics.uniqueOpens = uniqueOpeners.size;
    metrics.uniqueClicks = uniqueClickers.size;
    
    // Calculate average times
    if (metrics.opened > 0) {
      metrics.avgOpenTime = totalOpenTime / metrics.opened;
    }
    if (metrics.clicked > 0) {
      metrics.avgClickTime = totalClickTime / metrics.clicked;
    }
    
    // Find peak engagement hour
    const maxEngagement = Math.max(...hourlyEngagement);
    metrics.peakEngagementHour = hourlyEngagement.indexOf(maxEngagement);
    
    // Convert maps to arrays
    metrics.geoBreakdown = Array.from(geoMap.values());
    metrics.linkPerformance = Array.from(linkMap.values()).map(link => ({
      url: link.url,
      clicks: link.clicks,
      uniqueClicks: link.uniqueClicks.size
    }));

    // Update analytics metrics
    analytics.metrics = metrics;
  }

  // Get dashboard overview
  async getDashboardOverview(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Get aggregated metrics
      const aggregated = await Analytics.aggregateMetrics(userId, {
        periodStart: { $gte: periodStart }
      });

      // Get campaign performance
      const topCampaigns = await Analytics.getTopPerformers(userId, 'openRate', 5);
      
      // Get trend data
      const trendData = await Analytics.getTrendData(userId, 'day', 30);
      
      // Get subscriber growth
      const subscriberGrowth = await this.getSubscriberGrowth(userId, periodStart);
      
      // Get recent activity
      const recentActivity = await this.getRecentActivity(userId, 10);

      return {
        overview: {
          totalSent: aggregated.totalSent || 0,
          totalDelivered: aggregated.totalDelivered || 0,
          avgOpenRate: aggregated.avgOpenRate || 0,
          avgClickRate: aggregated.avgClickRate || 0,
          avgUnsubscribeRate: aggregated.avgUnsubscribeRate || 0
        },
        topCampaigns,
        trendData,
        subscriberGrowth,
        recentActivity
      };
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      throw error;
    }
  }

  // Get detailed campaign analytics
  async getCampaignAnalytics(userId, campaignId, timeframe = '30d') {
    try {
      const campaign = await Campaign.findOne({ _id: campaignId, user: userId });
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Generate current analytics
      const analytics = await this.generateAnalytics(userId, campaignId, 'Campaign');
      
      // Get historical data
      const { periodStart } = this.getTimeframeDates(timeframe);
      const historicalData = await Analytics.find({
        user: userId,
        entityId: campaignId,
        entityType: 'Campaign',
        periodStart: { $gte: periodStart }
      }).sort({ periodStart: 1 });

      // Get subscriber engagement breakdown
      const subscriberEngagement = await this.getSubscriberEngagement(campaignId);

      return {
        campaign,
        currentMetrics: analytics.metrics,
        rates: analytics.rates,
        comparison: analytics.comparison,
        historicalData,
        subscriberEngagement
      };
    } catch (error) {
      console.error('Error getting campaign analytics:', error);
      throw error;
    }
  }

  // Get subscriber analytics
  async getSubscriberAnalytics(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Get subscriber metrics
      const totalSubscribers = await Subscriber.countDocuments({ 
        user: userId, 
        isActive: true 
      });
      
      const newSubscribers = await Subscriber.countDocuments({
        user: userId,
        createdAt: { $gte: periodStart }
      });
      
      const unsubscribed = await Subscriber.countDocuments({
        user: userId,
        isActive: false,
        updatedAt: { $gte: periodStart }
      });

      // Get engagement segments
      const engagementSegments = await this.getEngagementSegments(userId, periodStart);
      
      // Get subscriber growth over time
      const growthData = await this.getSubscriberGrowthData(userId, periodStart);

      return {
        overview: {
          totalSubscribers,
          newSubscribers,
          unsubscribed,
          netGrowth: newSubscribers - unsubscribed
        },
        engagementSegments,
        growthData
      };
    } catch (error) {
      console.error('Error getting subscriber analytics:', error);
      throw error;
    }
  }

  // Helper methods
  getPeriodDates(period) {
    const now = new Date();
    let periodStart, periodEnd;

    switch (period) {
      case 'hour':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        periodEnd = new Date(periodStart.getTime() + 60 * 60 * 1000);
        break;
      case 'day':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        periodStart = new Date(now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = new Date(now.getFullYear() + 1, 0, 1);
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }

    return { periodStart, periodEnd };
  }

  getTimeframeDates(timeframe) {
    const now = new Date();
    let periodStart;

    switch (timeframe) {
      case '7d':
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        periodStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { periodStart, periodEnd: now };
  }

  getAnalyticsType(entityType) {
    const typeMap = {
      'Campaign': 'campaign',
      'Template': 'template',
      'Subscriber': 'subscriber',
      'User': 'overall'
    };
    return typeMap[entityType] || 'overall';
  }

  async getPreviousPeriodAnalytics(analytics) {
    const periodDuration = analytics.periodEnd - analytics.periodStart;
    const previousStart = new Date(analytics.periodStart.getTime() - periodDuration);
    const previousEnd = new Date(analytics.periodEnd.getTime() - periodDuration);

    return await Analytics.findOne({
      user: analytics.user,
      entityId: analytics.entityId,
      entityType: analytics.entityType,
      period: analytics.period,
      periodStart: previousStart,
      periodEnd: previousEnd
    });
  }

  async getSubscriberGrowth(userId, periodStart) {
    const pipeline = [
      {
        $match: {
          user: mongoose.Types.ObjectId(userId),
          createdAt: { $gte: periodStart }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];

    return await Subscriber.aggregate(pipeline);
  }

  async getRecentActivity(userId, limit = 10) {
    return await Analytics.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('entityId');
  }

  async getSubscriberEngagement(campaignId) {
    const pipeline = [
      { $match: { campaignId: mongoose.Types.ObjectId(campaignId) } },
      {
        $group: {
          _id: "$subscriberId",
          opened: { $sum: { $cond: [{ $in: ["open", "$events.type"] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $in: ["click", "$events.type"] }, 1, 0] } }
        }
      },
      {
        $group: {
          _id: null,
          highEngagement: { $sum: { $cond: [{ $and: [{ $gt: ["$opened", 0] }, { $gt: ["$clicked", 0] }] }, 1, 0] } },
          mediumEngagement: { $sum: { $cond: [{ $and: [{ $gt: ["$opened", 0] }, { $eq: ["$clicked", 0] }] }, 1, 0] } },
          lowEngagement: { $sum: { $cond: [{ $and: [{ $eq: ["$opened", 0] }, { $eq: ["$clicked", 0] }] }, 1, 0] } }
        }
      }
    ];

    const result = await EmailTracking.aggregate(pipeline);
    return result[0] || { highEngagement: 0, mediumEngagement: 0, lowEngagement: 0 };
  }

  async getEngagementSegments(userId, periodStart) {
    // This would involve complex aggregation to segment subscribers by engagement
    // For now, return mock data structure
    return {
      highly_engaged: 0,
      moderately_engaged: 0,
      low_engaged: 0,
      inactive: 0
    };
  }

  async getSubscriberGrowthData(userId, periodStart) {
    // Similar to getSubscriberGrowth but with more detailed breakdown
    return [];
  }
}

module.exports = new AnalyticsService();
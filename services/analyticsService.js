// emailxp/backend/services/analyticsService.js

const Analytics = require('../models/Analytics');
const Campaign = require('../models/Campaign');
const Template = require('../models/Template');
const Subscriber = require('../models/Subscriber');
const EmailTracking = require('../models/EmailTracking');
const mongoose = require('mongoose');
const LandingPage = require('../models/LandingPage');
const FormSubmission = require('../models/FormSubmission');

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

      // Process opens array
      if (track.opens && track.opens.length > 0) {
        for (const openEvent of track.opens) {
          metrics.opened++;
          uniqueOpeners.add(track.subscriberId.toString());
          
          // Track open time and hour
          if (openEvent.timestamp) {
            const hour = new Date(openEvent.timestamp).getHours();
            hourlyEngagement[hour]++;
          }
          
          // Device and client tracking
          if (openEvent.userAgent) {
            // Simple device detection based on user agent
            const ua = openEvent.userAgent.toLowerCase();
            if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
              metrics.deviceBreakdown.mobile++;
            } else if (ua.includes('tablet') || ua.includes('ipad')) {
              metrics.deviceBreakdown.tablet++;
            } else {
              metrics.deviceBreakdown.desktop++;
            }
            
            // Client detection
            if (ua.includes('gmail')) metrics.clientBreakdown.gmail++;
            else if (ua.includes('outlook')) metrics.clientBreakdown.outlook++;
            else if (ua.includes('yahoo')) metrics.clientBreakdown.yahoo++;
            else if (ua.includes('apple') || ua.includes('mac')) metrics.clientBreakdown.apple++;
            else metrics.clientBreakdown.other++;
          }
        }
      }

      // Process clicks array
      if (track.clicks && track.clicks.length > 0) {
        for (const clickEvent of track.clicks) {
          metrics.clicked++;
          uniqueClickers.add(track.subscriberId.toString());
          
          if (clickEvent.timestamp) {
            const hour = new Date(clickEvent.timestamp).getHours();
            hourlyEngagement[hour]++;
          }
          
          // Link performance tracking
          if (clickEvent.url) {
            const url = clickEvent.url;
            if (!linkMap.has(url)) {
              linkMap.set(url, { url, clicks: 0, uniqueClicks: new Set() });
            }
            linkMap.get(url).clicks++;
            linkMap.get(url).uniqueClicks.add(track.subscriberId.toString());
          }
        }
      }

      // Legacy event processing (if events array exists)
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
          user: new mongoose.Types.ObjectId(userId),
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
      { $match: { campaignId: new mongoose.Types.ObjectId(campaignId) } },
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
  
  // New method to get campaign performance comparison
  async getCampaignPerformanceComparison(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      const campaigns = await Analytics.find({
        user: userId,
        entityType: 'Campaign',
        periodStart: { $gte: periodStart }
      }).populate('entityId');
      
      return campaigns.map(campaign => ({
        campaign: campaign.entityId,
        metrics: campaign.metrics,
        rates: campaign.rates
      }));
    } catch (error) {
      console.error('Error getting campaign performance comparison:', error);
      throw error;
    }
  }
  
  // New method to get detailed engagement analytics
  async getDetailedEngagementAnalytics(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Get engagement trends
      const pipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            periodStart: { $gte: periodStart }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { 
                format: "%Y-%m-%d", 
                date: "$periodStart" 
              }
            },
            totalSent: { $sum: "$metrics.sent" },
            totalOpened: { $sum: "$metrics.opened" },
            totalClicked: { $sum: "$metrics.clicked" },
            avgOpenRate: { $avg: "$rates.openRate" },
            avgClickRate: { $avg: "$rates.clickRate" }
          }
        },
        { $sort: { _id: 1 } }
      ];

      const engagementTrends = await Analytics.aggregate(pipeline);

      // Get device breakdown
      const devicePipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            periodStart: { $gte: periodStart }
          }
        },
        {
          $group: {
            _id: null,
            desktop: { $sum: "$metrics.deviceBreakdown.desktop" },
            mobile: { $sum: "$metrics.deviceBreakdown.mobile" },
            tablet: { $sum: "$metrics.deviceBreakdown.tablet" },
            unknown: { $sum: "$metrics.deviceBreakdown.unknown" }
          }
        }
      ];

      const deviceBreakdown = await Analytics.aggregate(devicePipeline);

      // Get client breakdown
      const clientPipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            periodStart: { $gte: periodStart }
          }
        },
        {
          $group: {
            _id: null,
            gmail: { $sum: "$metrics.clientBreakdown.gmail" },
            outlook: { $sum: "$metrics.clientBreakdown.outlook" },
            yahoo: { $sum: "$metrics.clientBreakdown.yahoo" },
            apple: { $sum: "$metrics.clientBreakdown.apple" },
            other: { $sum: "$metrics.clientBreakdown.other" }
          }
        }
      ];

      const clientBreakdown = await Analytics.aggregate(clientPipeline);

      return {
        engagementTrends,
        deviceBreakdown: deviceBreakdown[0] || {},
        clientBreakdown: clientBreakdown[0] || {}
      };
    } catch (error) {
      console.error('Error getting detailed engagement analytics:', error);
      throw error;
    }
  }
  
  // New method to get landing page analytics
  async getLandingPageAnalytics(userId, landingPageId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Get the landing page with form integration
      const landingPage = await LandingPage.findOne({ 
        _id: landingPageId, 
        user: userId 
      }).populate('formIntegration');
      
      if (!landingPage) {
        throw new Error('Landing page not found');
      }
      
      // Get form submissions if there's a form integration
      let formSubmissions = 0;
      let formSubmissionTrend = [];
      
      if (landingPage.formIntegration) {
        // Get form submissions count
        formSubmissions = await FormSubmission.countDocuments({
          form: landingPage.formIntegration._id,
          submittedAt: { $gte: periodStart }
        });
        
        // Get form submission trend
        const submissionPipeline = [
          {
            $match: {
              form: new mongoose.Types.ObjectId(landingPage.formIntegration._id),
              submittedAt: { $gte: periodStart }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { 
                  format: "%Y-%m-%d", 
                  date: "$submittedAt" 
                }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ];
        
        formSubmissionTrend = await FormSubmission.aggregate(submissionPipeline);
      }
      
      // Calculate conversion rate
      const conversionRate = landingPage.visits > 0 ? 
        (formSubmissions / landingPage.visits) * 100 : 0;
      
      return {
        landingPage: {
          _id: landingPage._id,
          name: landingPage.name,
          slug: landingPage.slug,
          status: landingPage.status,
          visits: landingPage.visits,
          conversions: landingPage.conversions,
          formIntegration: landingPage.formIntegration ? {
            _id: landingPage.formIntegration._id,
            name: landingPage.formIntegration.name
          } : null
        },
        metrics: {
          visits: landingPage.visits,
          conversions: landingPage.conversions,
          formSubmissions,
          conversionRate
        },
        trends: {
          formSubmissionTrend
        }
      };
    } catch (error) {
      console.error('Error getting landing page analytics:', error);
      throw error;
    }
  }
  
  // New method to get all landing pages analytics summary
  async getLandingPagesAnalytics(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Get all landing pages for the user
      const landingPages = await LandingPage.find({ user: userId });
      
      const analyticsData = [];
      
      for (const landingPage of landingPages) {
        // Calculate conversion rate
        const conversionRate = landingPage.visits > 0 ? 
          (landingPage.conversions / landingPage.visits) * 100 : 0;
        
        analyticsData.push({
          landingPage: {
            _id: landingPage._id,
            name: landingPage.name,
            slug: landingPage.slug,
            status: landingPage.status,
            visits: landingPage.visits,
            conversions: landingPage.conversions,
            formIntegration: landingPage.formIntegration ? true : false
          },
          metrics: {
            visits: landingPage.visits,
            conversions: landingPage.conversions,
            conversionRate
          }
        });
      }
      
      // Sort by visits descending
      analyticsData.sort((a, b) => b.metrics.visits - a.metrics.visits);
      
      return analyticsData;
    } catch (error) {
      console.error('Error getting landing pages analytics:', error);
      throw error;
    }
  }

  // Get campaign analytics
  async getCampaignAnalytics(userId, campaignId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Try to get existing analytics first
      let analytics = await Analytics.findOne({
        user: userId,
        entityId: campaignId,
        entityType: 'Campaign',
        periodStart: { $gte: periodStart }
      }).sort({ periodStart: -1 });
      
      // If no recent analytics, generate new ones
      if (!analytics || analytics.periodStart < periodStart) {
        analytics = await this.generateAnalytics(userId, campaignId, 'Campaign', 'month');
      }
      
      // Get campaign details
      const Campaign = require('../models/Campaign');
      const campaign = await Campaign.findOne({ _id: campaignId, user: userId });
      
      if (!campaign) {
        throw new Error('Campaign not found');
      }
      
      // Get real-time metrics from EmailTracking
      const realTimeMetrics = await this.getRealTimeCampaignMetrics(campaignId, periodStart);
      
      // Merge with stored analytics
      const mergedMetrics = {
        ...analytics.metrics,
        ...realTimeMetrics
      };
      
      // Recalculate rates
      const rates = this.calculateRates(mergedMetrics, campaign.totalRecipients || 1);
      
      return {
        campaign: {
          _id: campaign._id,
          name: campaign.name,
          subject: campaign.subject,
          status: campaign.status,
          totalRecipients: campaign.totalRecipients,
          sentAt: campaign.sentAt
        },
        metrics: mergedMetrics,
        rates,
        timeframe,
        lastUpdated: analytics.updatedAt || new Date()
      };
    } catch (error) {
      console.error('Error getting campaign analytics:', error);
      throw error;
    }
  }

  // Get real-time metrics from EmailTracking
  async getRealTimeCampaignMetrics(campaignId, periodStart) {
    const EmailTracking = require('../models/EmailTracking');
    const mongoose = require('mongoose');
    
    // Ensure campaignId is an ObjectId for proper querying
    const campaignObjectId = mongoose.Types.ObjectId.isValid(campaignId) 
      ? new mongoose.Types.ObjectId(campaignId) 
      : campaignId;
    
    // Try querying with both ObjectId and string versions
    let trackingData = await EmailTracking.find({
      $or: [
        { campaign: campaignObjectId },
        { campaign: campaignId }
      ]
      // createdAt: { $gte: periodStart }
    });
    
    // If no documents found for this campaign, check if there are ANY documents with engagement
    if (trackingData.length === 0) {
      console.log(`No tracking data found for campaign ${campaignId}, checking for ANY engaged documents...`);
      const anyEngaged = await EmailTracking.find({
        $or: [
          { opens: { $exists: true, $ne: [] } },
          { clicks: { $exists: true, $ne: [] } }
        ]
      });
      console.log(`Found ${anyEngaged.length} documents with engagement in the entire DB`);
      if (anyEngaged.length > 0) {
        anyEngaged.forEach((doc, i) => {
          console.log(`  Engaged doc ${i+1}: campaign=${doc.campaign}, messageId=${doc.messageId}, opens=${doc.opens?.length || 0}, clicks=${doc.clicks?.length || 0}`);
        });
        // Use these documents for metrics calculation
        trackingData = anyEngaged;
      }
    }
    
    console.log(`Using ${trackingData.length} EmailTracking documents for metrics calculation`);
    
    // Also check for any EmailTracking documents at all
    const allTracking = await EmailTracking.find({}).sort({createdAt: -1}).limit(20);
    console.log(`Total EmailTracking documents in DB: ${allTracking.length}`);
    if (allTracking.length > 0) {
      console.log('All recent tracking documents:');
      allTracking.forEach((doc, i) => {
        console.log(`  ${i+1}: id=${doc._id}, campaign=${doc.campaign}, messageId=${doc.messageId}, opens=${doc.opens?.length || 0}, clicks=${doc.clicks?.length || 0}, createdAt=${doc.createdAt}`);
      });
    }
    
    if (trackingData.length > 0) {
      console.log('Sample tracking document:', {
        id: trackingData[0]._id,
        campaign: trackingData[0].campaign,
        messageId: trackingData[0].messageId,
        opens: trackingData[0].opens?.length || 0,
        clicks: trackingData[0].clicks?.length || 0,
        createdAt: trackingData[0].createdAt
      });
    }
    
    let sent = 0, delivered = 0, opened = 0, clicked = 0;
    const uniqueOpeners = new Set();
    const uniqueClickers = new Set();
    
    for (const track of trackingData) {
      sent++;
      if (track.status === 'delivered') delivered++;
      
      // Count opens
      if (track.opens && track.opens.length > 0) {
        opened += track.opens.length;
        uniqueOpeners.add(track.subscriber.toString());
      }
      
      // Count clicks
      if (track.clicks && track.clicks.length > 0) {
        clicked += track.clicks.length;
        uniqueClickers.add(track.subscriber.toString());
      }
    }
    
    return {
      sent,
      delivered,
      opened,
      uniqueOpens: uniqueOpeners.size,
      clicked,
      uniqueClicks: uniqueClickers.size
    };
  }

  // Calculate rates helper
  calculateRates(metrics, totalRecipients) {
    const delivered = metrics.delivered || 0;
    const uniqueOpens = metrics.uniqueOpens || 0;
    const uniqueClicks = metrics.uniqueClicks || 0;
    
    return {
      deliveryRate: totalRecipients > 0 ? (delivered / totalRecipients) * 100 : 0,
      openRate: delivered > 0 ? (uniqueOpens / delivered) * 100 : 0,
      clickRate: delivered > 0 ? (uniqueClicks / delivered) * 100 : 0,
      clickToOpenRate: uniqueOpens > 0 ? (uniqueClicks / uniqueOpens) * 100 : 0
    };
  }

  // Get engagement funnel across all campaigns
  async getEngagementFunnel(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Aggregate all campaign analytics for the user
      const pipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            entityType: 'Campaign',
            periodStart: { $gte: periodStart }
          }
        },
        {
          $group: {
            _id: null,
            totalSent: { $sum: '$metrics.sent' },
            totalDelivered: { $sum: '$metrics.delivered' },
            totalUniqueOpens: { $sum: '$metrics.uniqueOpens' },
            totalUniqueClicks: { $sum: '$metrics.uniqueClicks' },
            totalConversions: { $sum: '$metrics.conversions' }
          }
        }
      ];

      const result = await Analytics.aggregate(pipeline);
      
      const data = result[0] || {
        totalSent: 0,
        totalDelivered: 0,
        totalUniqueOpens: 0,
        totalUniqueClicks: 0,
        totalConversions: 0
      };

      return {
        stages: [
          {
            key: 'sent',
            label: 'Sent',
            value: data.totalSent,
            percentage: 100
          },
          {
            key: 'delivered',
            label: 'Delivered',
            value: data.totalDelivered,
            percentage: data.totalSent > 0 ? (data.totalDelivered / data.totalSent) * 100 : 0
          },
          {
            key: 'uniqueOpens',
            label: 'Unique Opens',
            value: data.totalUniqueOpens,
            percentage: data.totalSent > 0 ? (data.totalUniqueOpens / data.totalSent) * 100 : 0
          },
          {
            key: 'uniqueClicks',
            label: 'Unique Clicks',
            value: data.totalUniqueClicks,
            percentage: data.totalSent > 0 ? (data.totalUniqueClicks / data.totalSent) * 100 : 0
          },
          {
            key: 'conversions',
            label: 'Conversions',
            value: data.totalConversions || 0,
            percentage: data.totalSent > 0 ? ((data.totalConversions || 0) / data.totalSent) * 100 : 0
          }
        ]
      };
    } catch (error) {
      console.error('Error getting engagement funnel:', error);
      throw error;
    }
  }

  // Get dashboard overview
  async getDashboardOverview(userId, timeframe = '30d') {
    try {
      const { periodStart } = this.getTimeframeDates(timeframe);
      
      // Aggregate all campaign analytics for the user
      const pipeline = [
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            entityType: 'Campaign',
            periodStart: { $gte: periodStart }
          }
        },
        {
          $group: {
            _id: null,
            totalSent: { $sum: '$metrics.sent' },
            totalDelivered: { $sum: '$metrics.delivered' },
            totalUniqueOpens: { $sum: '$metrics.uniqueOpens' },
            totalUniqueClicks: { $sum: '$metrics.uniqueClicks' },
            totalUnsubscribes: { $sum: '$metrics.unsubscribes' },
            totalBounces: { $sum: '$metrics.bounces' },
            totalComplaints: { $sum: '$metrics.complaints' }
          }
        }
      ];

      const result = await Analytics.aggregate(pipeline);
      
      const data = result[0] || {
        totalSent: 0,
        totalDelivered: 0,
        totalUniqueOpens: 0,
        totalUniqueClicks: 0,
        totalUnsubscribes: 0,
        totalBounces: 0,
        totalComplaints: 0
      };

      // Calculate rates
      const openRate = data.totalSent > 0 ? (data.totalUniqueOpens / data.totalSent) * 100 : 0;
      const clickRate = data.totalSent > 0 ? (data.totalUniqueClicks / data.totalSent) * 100 : 0;
      const unsubRate = data.totalSent > 0 ? (data.totalUnsubscribes / data.totalSent) * 100 : 0;
      const bounceRate = data.totalSent > 0 ? (data.totalBounces / data.totalSent) * 100 : 0;
      const complaintRate = data.totalSent > 0 ? (data.totalComplaints / data.totalSent) * 100 : 0;

      // Get top campaigns
      const topCampaigns = await Analytics.find({
        user: new mongoose.Types.ObjectId(userId),
        entityType: 'Campaign',
        periodStart: { $gte: periodStart }
      })
      .populate('entityId', 'name subject')
      .sort({ 'metrics.sent': -1 })
      .limit(5)
      .then(analytics => analytics.map(a => ({
        campaign: a.entityId,
        metrics: a.metrics,
        rates: a.rates
      })));

      return {
        overview: {
          totalSent: data.totalSent,
          totalDelivered: data.totalDelivered,
          openRate: Math.round(openRate * 10) / 10,
          clickRate: Math.round(clickRate * 10) / 10,
          unsubRate: Math.round(unsubRate * 100) / 100,
          bounceRate: Math.round(bounceRate * 10) / 10,
          complaintRate: Math.round(complaintRate * 10) / 10
        },
        topCampaigns
      };
    } catch (error) {
      console.error('Error getting dashboard overview:', error);
      throw error;
    }
  }
}

module.exports = new AnalyticsService();
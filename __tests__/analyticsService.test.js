const analyticsService = require('../services/analyticsService');
const Analytics = require('../models/Analytics');
const Campaign = require('../models/Campaign');

jest.mock('../models/Analytics');
jest.mock('../models/Campaign');

describe('AnalyticsService.getDashboardOverview', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('returns expected dashboard structure when aggregations return values', async () => {
    const fakeUserId = '507f1f77bcf86cd799439011';

    Analytics.aggregateMetrics = jest.fn().mockResolvedValue({
      totalSent: 100,
      totalDelivered: 90,
      avgOpenRate: 40,
      avgClickRate: 10,
      avgUnsubscribeRate: 0.5
    });

    Analytics.getTopPerformers = jest.fn().mockResolvedValue([
      { campaign: { _id: 'c1', name: 'Camp 1' }, metrics: { sent: 50 }, rates: { openRate: 50 } }
    ]);

    Analytics.getTrendData = jest.fn().mockResolvedValue([{ date: '2025-09-01', sent: 10 }]);

    // make subscriber growth and recent activity return something via service methods
    analyticsService.getSubscriberGrowth = jest.fn().mockResolvedValue([{ _id: '2025-09-01', count: 5 }]);
    analyticsService.getRecentActivity = jest.fn().mockResolvedValue([]);

    const result = await analyticsService.getDashboardOverview(fakeUserId, '30d');

    expect(result).toHaveProperty('overview');
    expect(result.overview.totalSent).toBe(100);
    expect(result).toHaveProperty('topCampaigns');
    expect(Array.isArray(result.topCampaigns)).toBe(true);
    expect(result).toHaveProperty('trendData');
    expect(result).toHaveProperty('subscriberGrowth');
    expect(result).toHaveProperty('recentActivity');
  });
});

const request = require('supertest');
const app = require('../server');
const { connect, cleanup, disconnect } = require('./utils/memoryServer');
const mongoose = require('mongoose');
const Analytics = require('../models/Analytics');
const User = require('../models/User');
const Organization = require('../models/Organization');
const jwt = require('jsonwebtoken');

// Helper to auth header
function authHeader(user){
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => { await connect(); });
afterEach(async () => { await cleanup(); });
afterAll(async () => { await disconnect(); });

async function createUser() {
  const org = await Organization.create({
    name: 'Org', slug: 'org', email: 'org@example.com'
  });
  const user = await User.create({
    companyOrOrganization: 'Org',
    name: 'Test User',
    email: `u${Date.now()}@example.com`,
    password: 'secret12',
    role: 'super_admin', // bypass organization required logic & permissions
    organization: org._id,
    isVerified: true
  });
  return user;
}

async function seedAnalytics(userId){
  const now = new Date();
  const docs = [];
  for(let i=0;i<5;i++){
    const start = new Date(now.getTime() - i*86400000);
    const end = new Date(start.getTime() + 3600*1000);
    docs.push({
      user: userId,
      type: 'campaign',
      entityType: 'Campaign',
      entityId: new mongoose.Types.ObjectId(),
      period: 'day',
      periodStart: start,
      periodEnd: end,
      metrics: {
        sent: 100 + i,
        delivered: 95 + i,
        uniqueOpens: 40 + i,
        uniqueClicks: 10 + i,
      },
      rates: { openRate: 40, clickRate: 10, unsubscribeRate: 1 }
    });
  }
  await Analytics.insertMany(docs);
}

describe('GET /api/analytics/funnel', () => {
  test('returns aggregated funnel stages', async () => {
  const user = await createUser();
    await seedAnalytics(user._id);

    const res = await request(app)
      .get('/api/analytics/funnel?timeframe=30d')
      .set(authHeader(user));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stages');
    const sentStage = res.body.stages.find(s=>s.key==='sent');
    const deliveredStage = res.body.stages.find(s=>s.key==='delivered');
    const uniqueOpensStage = res.body.stages.find(s=>s.key==='uniqueOpens');
    const conversionsStage = res.body.stages.find(s=>s.key==='conversions');
    expect(sentStage.value).toBeGreaterThan(0);
    expect(deliveredStage.value).toBeGreaterThan(0);
    expect(uniqueOpensStage.value).toBeGreaterThanOrEqual(0);
    expect(conversionsStage).toBeDefined();
    // May be null if no conversion events seeded yet
    if(conversionsStage.value !== null){
      expect(conversionsStage.value).toBeGreaterThanOrEqual(0);
    }
  });

  test('returns zeros when no analytics', async () => {
  const user = await createUser();
    const res = await request(app)
      .get('/api/analytics/funnel?timeframe=30d')
      .set(authHeader(user));
    expect(res.status).toBe(200);
    const sentStage = res.body.stages.find(s=>s.key==='sent');
    expect(sentStage.value).toBe(0);
  });
});

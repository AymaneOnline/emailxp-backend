const request = require('supertest');
const app = require('../../server');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Campaign = require('../../models/Campaign');
const Group = require('../../models/Group');

describe('Campaign API', () => {
  let token, userId, groupId, campaignId;
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/emailxp-test', { useNewUrlParser: true, useUnifiedTopology: true });
    // Register and login a user
    await User.deleteMany({ email: /testcampaign/ });
    const regRes = await request(app)
      .post('/api/users/register')
      .send({
        companyOrOrganization: 'TestOrg',
        name: 'Test User',
        email: 'testcampaign@example.com',
        password: 'testpass123',
      });
    token = regRes.body.token;
    userId = regRes.body._id;
    // Create a group
    const group = await Group.create({ name: 'Test Group', user: userId });
    groupId = group._id;
  });
  afterAll(async () => {
    await Campaign.deleteMany({ name: /Test Campaign/ });
    await Group.deleteMany({ name: /Test Group/ });
    await User.deleteMany({ email: /testcampaign/ });
    await mongoose.connection.close();
  });
  it('should create a new campaign', async () => {
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Campaign',
        subject: 'Test Subject',
        htmlContent: '<p>Hello</p>',
        group: groupId,
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('name', 'Test Campaign');
    campaignId = res.body._id;
  });
  it('should get campaign analytics', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}/analytics`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('emailsSuccessfullySent');
  });
  it('should get campaign time-series analytics', async () => {
    const res = await request(app)
      .get(`/api/campaigns/${campaignId}/analytics-timeseries`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('labels');
    expect(res.body).toHaveProperty('opens');
    expect(res.body).toHaveProperty('clicks');
  });
});


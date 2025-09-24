const request = require('supertest');
const app = require('../server');
const { connect, cleanup, disconnect } = require('./utils/memoryServer');
const User = require('../models/User');
const Organization = require('../models/Organization');
const EmailLog = require('../models/EmailLog');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

function authHeader(user){
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

beforeAll(async () => { await connect(); });
afterEach(async () => { await cleanup(); });
afterAll(async () => { await disconnect(); });

async function createUser() {
  const org = await Organization.create({ name: 'Org', slug: 'org', email: 'org@example.com' });
  return User.create({
    companyOrOrganization: 'Org',
    name: 'Deliver Tester',
    email: `d${Date.now()}@example.com`,
    password: 'secret12',
    role: 'super_admin',
    organization: org._id,
    isVerified: true
  });
}

describe('Deliverability API', () => {
  test('summary returns structure', async () => {
  const user = await createUser();
    // minimal logs
    await EmailLog.create({
      campaignId: new mongoose.Types.ObjectId(),
      subscriberId: new mongoose.Types.ObjectId(),
      email: 'r@example.com',
      status: 'delivered',
      messageId: 'm1',
      sentAt: new Date(),
      deliveredAt: new Date()
    });

    const res = await request(app).get('/api/deliverability/summary?days=7').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('attempted');
    expect(res.body).toHaveProperty('delivered');
  });

  test('trends returns object with days array', async () => {
  const user = await createUser();
    const res = await request(app).get('/api/deliverability/trends?days=7').set(authHeader(user));
    expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('days');
  expect(Array.isArray(res.body.days)).toBe(true);
  });

  test('insights returns funnel object', async () => {
  const user = await createUser();
    const res = await request(app).get('/api/deliverability/insights?days=7').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('funnel');
  });
});

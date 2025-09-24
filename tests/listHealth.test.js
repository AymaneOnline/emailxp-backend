const request = require('supertest');
const app = require('../server');
const { connect, cleanup, disconnect } = require('./utils/memoryServer');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Subscriber = require('../models/Subscriber');

function authHeader(user){
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function createUser(){
  const org = await Organization.create({ name:'Org', slug:'org', email:'org@example.com' });
  const user = await User.create({
    companyOrOrganization: 'Org',
    name: 'LH User',
    email: `lh${Date.now()}@example.com`,
    password: 'secret12',
    role: 'super_admin',
    organization: org._id,
    isVerified: true
  });
  return user;
}

beforeAll(async ()=>{ await connect(); });
afterEach(async ()=>{ await cleanup(); });
afterAll(async ()=>{ await disconnect(); });

describe('List Health API', () => {
  test('returns health metrics with score', async () => {
    const user = await createUser();
    const now = new Date();

    // Seed subscribers with varied statuses & activity
    const docs = [
      { user: user._id, email:'a1@test.com', status:'subscribed', lastActivityAt: now },
      { user: user._id, email:'a2@test.com', status:'subscribed', lastActivityAt: new Date(now.getTime()-91*86400000) },
      { user: user._id, email:'a3@test.com', status:'unsubscribed', unsubscribedAt: now, lastActivityAt: now },
      { user: user._id, email:'a4@test.com', status:'bounced', lastActivityAt: now },
      { user: user._id, email:'a5@test.com', status:'complained', lastActivityAt: now },
    ];
    await Subscriber.insertMany(docs);

    const res = await request(app).get('/api/list-health?days=30').set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('counts');
    expect(res.body).toHaveProperty('growth');
    expect(res.body).toHaveProperty('inactivityBuckets');
    expect(res.body).toHaveProperty('healthScore');
    expect(typeof res.body.healthScore).toBe('number');
  });
});

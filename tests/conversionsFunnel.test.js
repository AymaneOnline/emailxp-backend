const request = require('supertest');
const app = require('../server');
const { connect, cleanup, disconnect } = require('./utils/memoryServer');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const ConversionEvent = require('../models/ConversionEvent');

function authHeader(user){
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'testsecret', { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function createUser(){
  const org = await Organization.create({ name:'Org', slug:'org', email:'org@example.com' });
  const user = await User.create({
    companyOrOrganization: 'Org',
    name: 'Conv User',
    email: `c${Date.now()}@example.com`,
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

describe('Conversions influence funnel', () => {
  test('funnel conversions value increments after ingestion', async () => {
    const user = await createUser();

    // Baseline funnel (should be 0 or null conversions)
    let res = await request(app).get('/api/analytics/funnel?timeframe=30d').set(authHeader(user));
    expect(res.status).toBe(200);
    const initialStage = res.body.stages.find(s=>s.key==='conversions');
    const initialVal = initialStage.value || 0;

    // Ingest 3 conversion events
    for(let i=0;i<3;i++){
      await request(app)
        .post('/api/conversions')
        .set(authHeader(user))
        .send({ type: 'purchase', value: 25, meta: { orderId: `o${i}` } })
        .expect(201);
    }

    res = await request(app).get('/api/analytics/funnel?timeframe=30d').set(authHeader(user));
    expect(res.status).toBe(200);
    const convStage = res.body.stages.find(s=>s.key==='conversions');
    expect(convStage.value).toBe(initialVal + 3);
  });
});

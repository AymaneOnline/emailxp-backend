const request = require('supertest');
const app = require('../../server');
const mongoose = require('mongoose');
const User = require('../../models/User');

describe('Auth API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/emailxp-test', { useNewUrlParser: true, useUnifiedTopology: true });
  });
  afterAll(async () => {
    await User.deleteMany({ email: /testauth/ });
    await mongoose.connection.close();
  });
  let token;
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        companyOrOrganization: 'TestOrg',
        name: 'Test User',
        email: 'testauth@example.com',
        password: 'testpass123',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
  });
  it('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({
        email: 'testauth@example.com',
        password: 'testpass123',
      });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });
  it('should not access protected route without token', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.statusCode).toBe(401);
  });
  it('should access protected route with token', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('email', 'testauth@example.com');
  });
});


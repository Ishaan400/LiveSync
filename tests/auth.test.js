const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const { connect, closeDatabase } = require('./test-utils/db');
const { v4: uuidv4 } = require('uuid');

beforeAll(async () => {
  await connect();
});

afterAll(async () => {
  await closeDatabase();
});

describe('Auth Routes', () => {
  it('should login a user', async () => {
    const requestId = uuidv4();
    const user = new User({ username: 'testuser', password: 'testpass' });
    await user.save();
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'testuser', password: 'testpass' })
      .set('X-Request-ID', requestId);
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });
});
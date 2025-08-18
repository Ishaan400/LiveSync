const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Document = require('../src/models/Document');
const jwt = require('jsonwebtoken');
const { connect, closeDatabase } = require('./test-utils/db');
const { v4: uuidv4 } = require('uuid');

let token;

beforeAll(async () => {
  await connect();
  const user = new User({ username: 'testuser', password: 'testpass' });
  await user.save();
  token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
});

afterAll(async () => {
  await closeDatabase();
});

describe('Document Routes', () => {
  it('should create a document', async () => {
    const requestId = uuidv4();
    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-ID', requestId)
      .send({ title: 'Test Doc' });
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('_id');
    expect(res.body.title).toEqual('Test Doc');
  });
});
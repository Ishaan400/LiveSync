const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { fork } = require('child_process');
const axios = require('axios');
const User = require('../src/models/User');
const { connect, closeDatabase } = require('./test-utils/db');
const { v4: uuidv4 } = require('uuid');

jest.setTimeout(20000);

const port = process.env.AUTOMERGE_PORT || 1234;
const base = `ws://localhost:${port}`;

let token;
let docId;
let userId;
let wsServerProcess;

beforeAll(async () => {
  console.log('🔧 Starting Automerge WebSocket server...');
  wsServerProcess = fork('./src/socket.js');
  await new Promise(res => setTimeout(res, 1500));

  console.log('🔧 Connecting to test database and creating user/doc...');
  await connect();

  const user = new User({ username: 'testuser', password: 'testpass' });
  await user.save();
  userId = user._id.toString();
  token = jwt.sign({ id: userId }, process.env.JWT_SECRET);

  // ⛔ Do not log entire res object
  const res = await axios.post('http://localhost:3000/documents', { title: 'Test Doc' }, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  docId = res.data._id;

  // ✅ Safe log only
  console.log(`📄 Document created via API with ID: ${docId}`);
});


afterAll(async () => {
  await closeDatabase();
  if (wsServerProcess) wsServerProcess.kill();
  console.log('🛑 WebSocket server process killed.');
});

describe('WebSocket Tests', () => {
  it('should connect to WebSocket with valid token and document ID', (done) => {
    const timeout = setTimeout(() => {
      console.error('❌ Test timed out during valid token connection');
      done(new Error('Test timed out'));
    }, 10000);

    const requestId = uuidv4();
    console.log(`🧪 Connecting to ${base} with token and docId=${docId}`);

    const ws = new WebSocket(`${base}/`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Request-ID': requestId },
    });

    ws.on('open', () => {
      console.log('✅ WebSocket connection opened');
      ws.send(JSON.stringify({ type: 'connect', docId }));
      console.log('📨 Sent connect message');
    });

    ws.on('message', (data) => {
      console.log('📥 Received message:', data.toString());
      const msg = JSON.parse(data.toString());
      if (msg.type === 'doc') {
        expect(msg.docId).toBe(docId);
        clearTimeout(timeout);
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
      clearTimeout(timeout);
      done(err);
    });
  });

  it('should reject WebSocket connection without token', (done) => {
    const timeout = setTimeout(() => {
      console.error('❌ Test timed out during no-token connection');
      done(new Error('Test timed out'));
    }, 10000);

    const ws = new WebSocket(`${base}/`);

    ws.on('error', (err) => {
      console.log('✅ Expected error received:', err.message);
      expect(err.message).toMatch(/Unexpected server response/i);
      clearTimeout(timeout);
      done();
    });

    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      done(new Error('Connection should not succeed without token'));
    });
  });

  it('should reject connection with invalid document ID', (done) => {
    const timeout = setTimeout(() => {
      console.error('❌ Test timed out during invalid docId test');
      done(new Error('Test timed out'));
    }, 10000);

    const requestId = uuidv4();
    const ws = new WebSocket(`${base}/`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Request-ID': requestId },
    });

    ws.on('open', () => {
      console.log('✅ Opened connection, sending invalid docId...');
      ws.send(JSON.stringify({ type: 'connect', docId: 'invalid_doc_id' }));
    });

    ws.on('message', (data) => {
      console.log('📥 Received message for invalid docId:', data.toString());
      const msg = JSON.parse(data.toString());
      if (msg.type === 'error') {
        expect(msg.message.toLowerCase()).toMatch(/invalid|access denied/);
        clearTimeout(timeout);
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
      clearTimeout(timeout);
      done(err);
    });
  });

  it('should handle document update with valid token', (done) => {
    const timeout = setTimeout(() => {
      console.error('❌ Test timed out during document update');
      done(new Error('Test timed out'));
    }, 10000);

    const requestId = uuidv4();
    const ws = new WebSocket(`${base}/`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Request-ID': requestId },
    });

    ws.on('open', () => {
      console.log('✅ WebSocket connection opened for update');
      ws.send(JSON.stringify({ type: 'connect', docId }));
    });

    let gotInitialDoc = false;

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('📥 Received update-related message:', msg);

      if (msg.type === 'doc' && !gotInitialDoc) {
        gotInitialDoc = true;
        const change = Buffer.from('test').toString('base64');
        console.log('✍️ Sending document update...');
        ws.send(JSON.stringify({ type: 'update', docId, changes: [change] }));
      }

      if (msg.type === 'sync') {
        expect(msg.docId).toBe(docId);
        expect(Array.isArray(msg.changes)).toBe(true);
        console.log('✅ Received sync response after update');
        clearTimeout(timeout);
        ws.close();
        done();
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error during update test:', err.message);
      clearTimeout(timeout);
      done(err);
    });
  });
});

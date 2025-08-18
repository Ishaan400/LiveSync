require('dotenv').config();
const axios = require('axios');
const WebSocket = require('ws');
const Automerge = require('@automerge/automerge');
const readline = require('readline');
const logger = require('./src/utils/logger');
const { v4: uuidv4 } = require('uuid');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let currentDoc = Automerge.init();
let currentDocId = null;
let ws = null;
let mode = 'command';

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:1234';
const api = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } });

function prompt() {
  rl.question(mode === 'edit' ? '> ' : 'Enter command (login/create/connect/change/history/replay): ', async input => {
    const requestId = uuidv4();
    console.log(`[PROMPT] Mode: ${mode}, Input: ${input}`);

    if (mode === 'edit') {
      const line = input.trim();
      if (line === ':exit') {
        mode = 'command';
        console.log('[MODE] Switched to command mode');
        return prompt();
      }
      if (!currentDocId || !ws || ws.readyState !== WebSocket.OPEN) {
        console.error('[ERROR] Not connected to a document.');
        return prompt();
      }
      try {
        const newDoc = Automerge.change(currentDoc, d => {
          d.text = (d.text || '') + line + '\n';
        });
        const changes = Automerge.getChanges(currentDoc, newDoc);
        if (changes.length > 0) {
          const b64 = changes.map(c => Buffer.from(c).toString('base64'));
          currentDoc = newDoc;
          console.log(`[SEND] Sending ${b64.length} change(s)`);
          ws.send(JSON.stringify({ type: 'update', docId: currentDocId, changes: b64 }));
        }
      } catch (err) {
        console.error('[SEND FAILED]', err.message);
      }
      return prompt();
    }

    const [cmd, arg] = input.trim().split(' ');
    console.log(`[COMMAND] ${cmd} ${arg || ''}`);

    try {
      switch (cmd) {
        case 'login': {
          const [user, pass] = arg.split('/');
          const resp = await api.post('/auth/login', { username: user, password: pass });
          api.defaults.headers.common['Authorization'] = `Bearer ${resp.data.token}`;
          logger.info(`Login successful [${requestId}]`);
          break;
        }

        case 'create': {
          const resp = await api.post('/documents', { title: arg }, {
            headers: { Authorization: api.defaults.headers.common['Authorization'] }
          });
          const docId = resp.data._id;
          console.log(`Document created: ${docId}`);

          const tempWs = new WebSocket(WS_BASE, {
            headers: { Authorization: api.defaults.headers.common['Authorization'] }
          });
          tempWs.on('open', () => {
            console.log(`[WS CREATE] Seeding Automerge for ${docId}`);
            tempWs.send(JSON.stringify({ type: 'create', docId }));
            tempWs.close();
          });
          tempWs.on('error', e => {
            logger.error(`WS (create seed) error: ${e.message}`);
          });
          break;
        }

        case 'connect': {
          ws = new WebSocket(WS_BASE, {
            headers: { Authorization: api.defaults.headers.common['Authorization'] }
          });

          ws.on('open', () => {
            console.log(`[WS OPEN] Connecting to doc ${arg}`);
            ws.send(JSON.stringify({ type: 'connect', docId: arg }));
          });

          ws.on('message', data => {
            console.log(`[WS MESSAGE] Raw: ${data}`);
            const msg = JSON.parse(data);
            if (msg.type === 'error') {
              console.error(`[SERVER ERROR] ${msg.message}`);
              return;
            }
            if (msg.type === 'doc') {
              currentDocId = arg;
              currentDoc = Automerge.load(Buffer.from(msg.doc, 'base64'));
              console.log('Loaded:', currentDoc);
              mode = 'edit';
              console.log('Switched to edit mode. Type ":exit" to return to command mode.');
            } else if (msg.type === 'sync') {
              const changes = msg.changes.map(b64 => Buffer.from(b64, 'base64'));
              currentDoc = Automerge.applyChanges(currentDoc, changes)[0];
              console.log(`[SYNC] Applied ${changes.length} change(s)`);
            } else if (msg.type === 'presence') {
              const users = Array.isArray(msg.users) ? msg.users : [];
              console.log(`[PRESENCE] Doc ${msg.docId} Users: [${users.join(', ')}]`);
            }
          });

          ws.on('error', e => logger.error(`[WS ERROR] ${e.message}`));
          ws.on('close', () => {
            console.log('[WS CLOSED] WebSocket closed.');
            mode = 'command';
            ws = null;
            prompt();
          });
          break;
        }

        case 'history': {
          const resp = await api.get(`/documents/${arg}/history`, {
            headers: { Authorization: api.defaults.headers.common['Authorization'] }
          });
          console.log(`[HISTORY] Versions found: ${resp.data.length}`);
          break;
        }

        case 'replay': {
          const [docId, version] = arg.split('/');
          const resp = await api.get(`/documents/${docId}/replay/${version}`, {
            headers: { Authorization: api.defaults.headers.common['Authorization'] }
          });
          if (!resp.data.doc) throw new Error('Invalid replay response');
          const replayedDoc = Automerge.load(Buffer.from(resp.data.doc, 'base64'));
          console.log('[REPLAYED DOC]', replayedDoc);
          break;
        }

        default:
          console.log('[ERROR] Unknown command');
      }
    } catch (err) {
      logger.error(`Error [${requestId}]: ${err.message}`);
    }

    prompt();
  });
}

prompt();


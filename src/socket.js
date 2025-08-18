const crypto = require('crypto');
global.crypto = { getRandomValues: arr => crypto.randomFillSync(arr) };

const WebSocket = require('ws');
const http = require('http');
const Automerge = require('@automerge/automerge');
const { pub, sub, ops } = require('./utils/redis');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Document = require('./models/Document');
const DocumentVersion = require('./models/DocumentVersion');
const ActivityLog = require('./models/ActivityLog');
const HistoryEntry = require('./models/HistoryEntry');
const logger = require('./utils/logger');

const PORT = process.env.AUTOMERGE_PORT || 1234;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/livesync';
const JWT_SECRET = process.env.JWT_SECRET || 'default_test_secret';

process.on('uncaughtException', err => {
  logger.error('[UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', reason => {
  logger.error('[UNHANDLED PROMISE REJECTION]', reason);
});

const server = http.createServer();
const wss = new WebSocket.Server({ server });

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    logger.info('MongoDB connected in Automerge server');
  } catch (err) {
    logger.error('MongoDB connection error in Automerge server: ' + err.message);
    process.exit(1);
  }
})();

const docs = new Map();
const clients = new Map();

wss.on('connection', (ws, req) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return ws.close(1008, 'Authentication required');

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return ws.close(1008, 'Invalid token');

    const userId = String(user.id);
    ws.userId = userId;
    logger.info(`Client connected: ${userId}`);

    ws.on('message', async message => {
      let msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        logger.error(`[WS] Invalid JSON: ${message}`);
        return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON received' }));
      }

      if (!msg || typeof msg !== 'object') {
        logger.error('[WS] Received non-object message:', msg);
        return ws.send(JSON.stringify({ type: 'error', message: 'Malformed WebSocket message' }));
      }

      const { docId, type } = msg;
      console.log(`[WS] Message received: ${JSON.stringify(msg)}`);

      try {
        if (!mongoose.Types.ObjectId.isValid(docId)) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Invalid document ID' }));
        }

        const doc = await Document.findById(docId);
        const hasAccess =
          doc && (
            doc.owner.toString() === userId ||
            (Array.isArray(doc.participants) && doc.participants.some(p => p.userId.toString() === userId))
          );
        if (!hasAccess) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
        }

        switch (type) {
          case 'create': {
            console.log(`[CREATE] Creating Automerge doc for ${docId}`);
            if (doc.owner.toString() !== userId) {
              return ws.send(JSON.stringify({ type: 'error', message: 'Only owner can create' }));
            }
            let newDoc = Automerge.init();
            newDoc = Automerge.change(newDoc, d => { d.text = ''; });
            const changes = Automerge.getAllChanges(newDoc);
            const docBinary = Automerge.save(newDoc);
            docs.set(docId, newDoc);

            await ops.set(
              `doc:${docId}`,
              JSON.stringify(changes.map(c => Buffer.from(c).toString('base64')))
            );

            ws.send(JSON.stringify({
              type: 'created',
              docId,
              doc: Buffer.from(docBinary).toString('base64')
            }));
            await new ActivityLog({ docId, userId, action: 'create' }).save();
            break;
          }

          case 'connect': {
            console.log(`[CONNECT] Connecting to doc ${docId}`);
            try {
              const data = await ops.get(`doc:${docId}`) || '[]';
              const parsed = JSON.parse(data);
              const changes = parsed.map(b64 => Buffer.from(b64, 'base64'));
              let docState = Automerge.init();
              const [loadedDoc] = Automerge.applyChanges(docState, changes);
              docState = loadedDoc;

              docs.set(docId, docState);
              const docBinary = Automerge.save(docState);
              ws.send(JSON.stringify({
                type: 'doc',
                docId,
                doc: Buffer.from(docBinary).toString('base64')
              }));

              const clientSet = clients.get(docId) || new Set();
              clientSet.add(ws);
              clients.set(docId, clientSet);

              await ops.sAdd(`doc:${docId}:users`, userId);
              const users = await ops.sMembers(`doc:${docId}:users`);
              console.log(`[PRESENCE] Users in ${docId}: ${users}`);

              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN && clients.get(docId)?.has(client)) {
                  client.send(JSON.stringify({ type: 'presence', docId, users }));
                }
              });

              await sub.subscribe(`doc:${docId}`, (message) => {
                try {
                  const { type, docId: msgDocId, changes } = JSON.parse(message);
                  if (type === 'sync') {
                    const clientSet = clients.get(msgDocId) || new Set();
                    clientSet.forEach(client => {
                      if (client.readyState === WebSocket.OPEN) {
                        console.log(`[SYNC] Broadcasting to client on doc ${msgDocId}`);
                        client.send(JSON.stringify({ type: 'sync', docId: msgDocId, changes }));
                      }
                    });
                  }
                } catch (err) {
                  logger.error(`Error processing Redis message on channel ${docId}: ${err.message}`);
                }
              });
            } catch (e) {
              logger.error(`Unhandled error in connect handler: ${e.message}`);
              ws.send(JSON.stringify({ type: 'error', message: 'Server error during connect' }));
            }
            break;
          }

          case 'update': {
            console.log(`[UPDATE] Processing update for ${docId}`);
            if (
              Array.isArray(doc.participants) &&
              doc.participants.some(p => p.userId.toString() === userId && p.role === 'viewer')
            ) {
              return ws.send(JSON.stringify({ type: 'error', message: 'Viewers cannot update document' }));
            }

            if (!Array.isArray(msg.changes) || msg.changes.length === 0) {
              return ws.send(JSON.stringify({ type: 'error', message: 'No changes provided' }));
            }

            let updates;
            try {
              updates = msg.changes.map(b64 => Buffer.from(b64, 'base64'));
              console.log(`[UPDATE] Decoded ${updates.length} changes`);
            } catch (e) {
              logger.error(`Invalid base64 change data: ${e.message}`);
              return ws.send(JSON.stringify({ type: 'error', message: 'Invalid change format' }));
            }

            const current = docs.get(docId) || Automerge.init();
            let newDoc;
            try {
              [newDoc] = Automerge.applyChanges(current, updates);
              console.log(`[UPDATE] Changes applied successfully`);
            } catch (e) {
              logger.error(`Automerge applyChanges failed: ${e.message}`);
              return ws.send(JSON.stringify({ type: 'error', message: 'Failed to apply changes' }));
            }

            docs.set(docId, newDoc);

            const prev = await ops.get(`doc:${docId}`) || '[]';
            const stored = JSON.parse(prev);
            stored.push(...msg.changes);
            await ops.set(`doc:${docId}`, JSON.stringify(stored));

            for (const change of updates) {
              await new DocumentVersion({
                docId: new mongoose.Types.ObjectId(docId),
                userId,
                update: change,
              }).save();
            }

            await new ActivityLog({ docId, userId, action: 'update' }).save();

            for (const change of updates) {
              await HistoryEntry.create({
                documentId: new mongoose.Types.ObjectId(docId),
                type: 'content',
                operation: 'automerge-change',
                payload: change.toString('base64'),
                userId,
              });
            }

            await pub.publish(`doc:${docId}`, JSON.stringify({ type: 'sync', docId, changes: msg.changes }));
            console.log(`[UPDATE] Changes published to Redis`);
            break;
          }

          case 'history': {
            const versions = await DocumentVersion
              .find({ docId: new mongoose.Types.ObjectId(docId) })
              .sort({ timestamp: 1 });
            ws.send(JSON.stringify({ type: 'history', docId, versions: versions.length }));
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown command: ${type}` }));
        }
      } catch (err) {
        logger.error(`Failed to process message: ${err.message}`);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', async () => {
      logger.info(`[CLOSE] Client disconnected: ${userId}`);
      for (const [docId, clientSet] of clients) {
        if (clientSet.has(ws)) {
          clientSet.delete(ws);
          await ops.sRem(`doc:${docId}:users`, userId);
          const users = await ops.sMembers(`doc:${docId}:users`);
          console.log(`[CLOSE] Remaining users for ${docId}: ${users}`);

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && clients.get(docId)?.has(client)) {
              client.send(JSON.stringify({ type: 'presence', docId, users }));
            }
          });

          if (clientSet.size === 0) {
            clients.delete(docId);
            await sub.unsubscribe(`doc:${docId}`);
            console.log(`[CLOSE] Unsubscribed Redis channel for ${docId}`);
          }
        }
      }
    });
  });
});

wss.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} already in use. WebSocket server not started.`);
    process.exit(1);
  } else {
    logger.error('WebSocket Server Error: ' + err.message);
  }
});

server.listen(PORT, () => {
  logger.info(`Automerge WebSocket server listening on port ${PORT}`);
});

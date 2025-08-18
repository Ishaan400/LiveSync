// utils/redis.js
const logger = require('./logger');

const shouldUseStub = process.env.NODE_ENV === 'test' || !process.env.REDIS_URL;

if (shouldUseStub) {
  // In-memory stub for tests or when REDIS_URL is not set
  const keyValueStore = new Map();
  const setStore = new Map();
  const subscribers = new Map();

  const ops = {
    async get(key) {
      return keyValueStore.has(key) ? keyValueStore.get(key) : null;
    },
    async set(key, value) {
      keyValueStore.set(key, value);
      return 'OK';
    },
    async sAdd(key, member) {
      const s = setStore.get(key) || new Set();
      s.add(String(member));
      setStore.set(key, s);
      return 1;
    },
    async sRem(key, member) {
      const s = setStore.get(key) || new Set();
      const existed = s.delete(String(member));
      setStore.set(key, s);
      return existed ? 1 : 0;
    },
    async sMembers(key) {
      const s = setStore.get(key) || new Set();
      return Array.from(s);
    },
  };

  const sub = {
    async subscribe(channel, handler) {
      const list = subscribers.get(channel) || [];
      list.push(handler);
      subscribers.set(channel, list);
      return 'OK';
    },
    async unsubscribe(channel) {
      subscribers.delete(channel);
      return 'OK';
    },
    on() {},
  };

  const pub = {
    async publish(channel, message) {
      const list = subscribers.get(channel) || [];
      for (const handler of list) {
        try { handler(message); } catch (e) { /* ignore in stub */ }
      }
      return list.length;
    },
    // For routes that call pub.set in create step
    async set(key, value) {
      return ops.set(key, value);
    },
    on() {},
  };

  module.exports = { pub, sub, ops };
} else {
  const { createClient } = require('redis');

  const base = createClient({ url: process.env.REDIS_URL });
  const pub = base.duplicate();
  const sub = base.duplicate();
  const ops = base.duplicate();

  [pub, sub, ops].forEach(client => {
    client.on('error', err => logger.error(`Redis ${client === pub ? 'Pub' : client === sub ? 'Sub' : 'Ops'} Error: ${err.message}`));
  });

  (async function connectClients() {
    try {
      await Promise.all([
        base.connect(),
        pub.connect(),
        sub.connect(),
        ops.connect(),
      ]);
      logger.info('Redis pub/sub/ops connected');
    } catch (err) {
      logger.error('Redis connection error: ' + err.message);
      // Do not hard-exit here in production code paths that can be retried by orchestrator
      process.exit(1);
    }
  })();

  module.exports = { pub, sub, ops };
}






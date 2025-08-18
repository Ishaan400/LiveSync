/**
 * Seed script for Automerge-based documents
 * Usage: node scripts/seed.js <docId> <initialText>
 */
const Automerge = require('@automerge/automerge');
const { createClient } = require('redis');

const [,, docId, ...textParts] = process.argv;
if (!docId) {
  console.error('Usage: node seed.js <docId> <initialText>');
  process.exit(1);
}

(async () => {
  const initialText = textParts.join(' ') || 'Hello, Automerge!';

  // Initialize Automerge document
  let doc = Automerge.init();
  doc = Automerge.change(doc, d => { d.text = initialText; });

  // Get the change-set(s)
  const changes = Automerge.getAllChanges(doc);

  // Persist to Redis
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  const key = `doc:${docId}`;
  const b64 = changes.map(c => Buffer.from(c).toString('base64'));
  await redis.set(key, JSON.stringify(b64));
  console.log(`✅ Seeded doc ${docId} with initial text: "${initialText}"`);
  await redis.quit();
})();
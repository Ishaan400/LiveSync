const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { createClient } = require('redis');
require('dotenv').config();

['MONGO_URI', 'REDIS_URL', 'JWT_SECRET'].forEach(k => {
  if (!process.env[k]) {
    logger.error(`Missing env var ${k}`);
    process.exit(1);
  }
});

connectDB();
const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(err => {
  logger.error('Redis connect failed:', err);
  process.exit(1);
});

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => logger.info(`API listening on ${PORT}`));
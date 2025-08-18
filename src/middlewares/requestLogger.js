const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const requestLogger = (req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  const user = req.user ? `user: ${req.user.id}` : 'user: anonymous';
  logger.info(`[${requestId}] ${req.method} ${req.originalUrl} from ${user}`);
  next();
};

module.exports = requestLogger;

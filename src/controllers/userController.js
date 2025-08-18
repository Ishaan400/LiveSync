const User = require('../models/User');
const logger = require('../utils/logger');

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, '_id username');
    res.status(200).json(users);
    logger.info(`All users fetched [Request ${req.requestId}]`);
  } catch (err) {
    logger.error(`Error fetching users: ${err.message} [Request ${req.requestId}]`);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAllUsers };

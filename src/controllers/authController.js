const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && await user.comparePassword(password)) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      logger.info(`User ${username} logged in successfully [Request ${req.requestId}]`);
      res.json({ token });
    } else {
      logger.warn(`Failed login attempt for username: ${username} [Request ${req.requestId}]`);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    logger.error(`Login error: ${err.message} [Request ${req.requestId}]`);
    res.status(500).json({ error: 'Server error' });
  }
};

const signup = async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      logger.warn(`Signup attempt with existing username: ${username} [Request ${req.requestId}]`);
      return res.status(400).json({ error: 'Username already exists' });
    }
    const user = new User({ username, password });
    await user.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    logger.info(`User ${username} signed up successfully [Request ${req.requestId}]`);
    res.status(201).json({ token });
  } catch (err) {
    logger.error(`Signup error: ${err.message} [Request ${req.requestId}]`);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, signup };
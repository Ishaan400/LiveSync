const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('../models/User');
const logger = require('../utils/logger');

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

passport.use(new JwtStrategy(opts, async (jwtPayload, done) => {
  try {
    const user = await User.findById(jwtPayload.id);
    if (user) {
      logger.info(`JWT authenticated user: ${user.username} [Request ${jwtPayload.requestId || 'N/A'}]`);
      return done(null, user);
    } else {
      logger.warn(`JWT authentication failed: User not found [Request ${jwtPayload.requestId || 'N/A'}]`);
      return done(null, false);
    }
  } catch (err) {
    logger.error(`JWT authentication error: ${err.message} [Request ${jwtPayload.requestId || 'N/A'}]`);
    return done(err, false);
  }
}));

module.exports = passport;
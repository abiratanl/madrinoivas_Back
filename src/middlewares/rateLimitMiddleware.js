const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';
// Forced rate-limit test run (tests/ratelimit.test.js sets TEST_RATE_LIMIT=true)
const isForcedLimitTest = process.env.NODE_ENV === 'test' && process.env.TEST_RATE_LIMIT === 'true';

const apiLimiterConfig = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10000 : 100, // High limit in dev, 100 in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Muitas requisições deste IP, tente novamente mais tarde.',
  },
});

const loginLimiterConfig = rateLimit({
  windowMs: 15 * 60 * 1000,
  // 5 attempts per window (documented behavior and forced-test value); high limit in dev
  max: isForcedLimitTest ? 5 : isDev ? 1000 : 5,
  message: {
    status: 'error',
    message: 'Muitas tentativas de login. Tente novamente mais tarde.',
  },
});

/**
 * Wrapper inteligente
 */
const limiterWrapper = (limiterInstance) => {
  return (req, res, next) => {
    // If it's a test and we're not forcing a rate limit test, skip it.
    if (process.env.NODE_ENV === 'test' && process.env.TEST_RATE_LIMIT !== 'true') {
      return next();
    }
    return limiterInstance(req, res, next);
  };
};

module.exports = {
  apiLimiter: limiterWrapper(apiLimiterConfig),
  loginLimiter: limiterWrapper(loginLimiterConfig),
};

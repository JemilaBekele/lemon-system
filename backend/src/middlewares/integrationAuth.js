const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

// Calls from the e-commerce system (not a user login): the request must carry
// the shared secret from INTEGRATION_KEY in the X-Integration-Key header. The
// same key is set as STOCK_INTEGRATION_KEY in the e-commerce .env.
const integrationAuth = (req, res, next) => {
  const expected = process.env.INTEGRATION_KEY;
  if (!expected) {
    return next(
      new ApiError(
        httpStatus.SERVICE_UNAVAILABLE,
        'Integration is not configured (INTEGRATION_KEY is not set)',
      ),
    );
  }
  const given = req.get('X-Integration-Key') || '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Constant-time compare; lengths must match first
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(
      new ApiError(httpStatus.UNAUTHORIZED, 'Invalid integration key'),
    );
  }
  return next();
};

module.exports = integrationAuth;

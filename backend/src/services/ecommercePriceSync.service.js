const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

// "Sync prices" on the Price Update page: asks the e-commerce system to copy
// the e-commerce prices (product and sub-product) from this system's catalog.
// Uses the shared INTEGRATION_KEY; ECOMMERCE_API_URL is the e-commerce API
// base, ending in /api/v1.

const TIMEOUT_MS = 30000;

const syncPricesToEcommerce = async () => {
  const base = (process.env.ECOMMERCE_API_URL || '').replace(/\/+$/, '');
  const key = process.env.INTEGRATION_KEY;
  if (!base || !key) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'The e-commerce link is not configured (ECOMMERCE_API_URL and INTEGRATION_KEY)',
    );
  }

  let response;
  try {
    response = await fetch(`${base}/stock-sync/prices`, {
      method: 'POST',
      headers: { 'X-Integration-Key': key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Could not reach the e-commerce system. Try again shortly.',
    );
  }

  let body = {};
  try {
    body = await response.json();
  } catch (error) {
    // not JSON
  }
  if (!response.ok) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      response.status === 401
        ? 'The e-commerce system rejected the integration key'
        : body.message || `The e-commerce system answered ${response.status}`,
    );
  }
  return (body.data && body.data.result) || body.data || {};
};

module.exports = { syncPricesToEcommerce };

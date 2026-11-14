const prisma = require('../services/prisma');

// Stock transactions lock rows (status compare-and-set, SELECT ... FOR UPDATE),
// so under load one may wait for another. Prisma's defaults (2s to get a
// connection, 5s total) then fail with "Transaction already closed". Give
// them room, and retry the whole transaction when MySQL picks it as a
// deadlock victim (P2034) — it was rolled back, so re-running is safe.
const TRANSACTION_OPTIONS = { maxWait: 10000, timeout: 30000 };
const MAX_ATTEMPTS = 3;

const isRetryable = (error) =>
  error &&
  (error.code === 'P2034' ||
    /deadlock|write conflict|lock wait timeout/i.test(String(error.message)));

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runStockTransaction = async (fn, options = {}) => {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      return await prisma.$transaction(fn, {
        ...TRANSACTION_OPTIONS,
        ...options,
      });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error;
      const delayMs = 50 * attempt + Math.floor(Math.random() * 50);
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
  }
};

module.exports = { runStockTransaction, TRANSACTION_OPTIONS };

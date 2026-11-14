const httpStatus = require('http-status');
const ApiError = require('./ApiError');

/**
 * A purchase, transfer or stock correction may list each product /
 * sub-product / batch only once. A batch belongs to exactly one product and
 * sub-product, so the batch identifies the line.
 */
const assertNoDuplicateLines = (items, documentLabel) => {
  const seen = new Map();
  items.forEach((item, index) => {
    const key = [
      item.productId || '',
      item.subProductId || '',
      item.batchId || '',
    ].join('|');
    const batchKey = item.batchId || key;
    const firstIndex = seen.get(batchKey);
    if (firstIndex !== undefined) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${documentLabel}: items ${firstIndex + 1} and ${
          index + 1
        } have the same product, sub-product and batch. Combine them into one line.`,
      );
    }
    seen.set(batchKey, index);
  });
};

module.exports = { assertNoDuplicateLines };

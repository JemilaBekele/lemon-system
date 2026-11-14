// A purchase, transfer or stock correction may list each product /
// sub-product / batch only once (the backend rejects duplicates too).
type TLine = {
  productId?: string | null;
  subProductId?: string | null;
  batchId?: string | null;
};

/** Message naming the first two rows that repeat a line, or null. */
export const findDuplicateLineMessage = (items: TLine[]): string | null => {
  const seen = new Map<string, number>();
  for (let index = 0; index < items.length; index += 1) {
    const { productId, subProductId, batchId } = items[index];
    if (!productId || !batchId) continue;
    const key = `${productId}|${subProductId || ''}|${batchId}`;
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      return `Rows ${firstIndex + 1} and ${index + 1} have the same product, sub-product and batch. Combine them into one row.`;
    }
    seen.set(key, index);
  }
  return null;
};

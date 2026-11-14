// Display name for a cart/order line: "Product · Variant" when the line is for a sub-product.
export const lineItemName = (
  product?: { name?: string } | null,
  subProduct?: { name?: string } | null,
  fallback = 'Unknown Product'
): string => {
  const name = product?.name || fallback;
  return subProduct?.name ? `${name} · ${subProduct.name}` : name;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
import { axiosInstance } from "./axiosIntance";
import type { IStockLedgerEntry } from '@/models/StockLedger';
import { IProduct, IProductBatch, ISubProduct } from '@/models/Product';
import { IUnitOfMeasure } from '@/models/UnitOfMeasure';

export interface GetParams {
  page?: number;
  limit?: number;
}

// Response for getAll
interface ProductsResponse {
  success: boolean;
  count: number;
  products: IProduct[];
}

// Get all Products (paginated)
export const getAllProducts = async ({
  page = 1,
  limit = 10
}: GetParams = {}) => {
  try {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    const url = `/products?${query}`;
    const response = await axiosInstance.get<ProductsResponse>(url);
    const products = response.data.products;
    return {
      products: products,
      totalCount: response.data.count ?? products.length,
      success: response.data.success
    };
  } catch (error) {
    throw error;
  }
};
interface SubProductsResponse {
  success: boolean;
  count: number;
  subProducts: ISubProduct[];
}
export const getAllSubProducts = async ({
  page = 1,
  limit = 10
}: GetParams = {}) => {
  try {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    const url = `/products/All/SubProducts?${query}`;
    const response = await axiosInstance.get<SubProductsResponse>(url);
    const subProducts = response.data.subProducts;
    return {
      subProducts: subProducts,
      totalCount: response.data.count ?? subProducts.length,
      success: response.data.success
    };
  } catch (error) {
    throw error;
  }
};
export const getProductBatches = async (
  productId: string,
  subProductId?: string
): Promise<IProductBatch[]> => {
  try {

    const response = await axiosInstance.get(
      `/products/get/all/${productId}/batches`,
      {
        params: {
          ...(subProductId && { subProductId }), // 👈 optional filter
        },
      }
    );

    return response.data.batches as IProductBatch[];
  } catch (error) {
    throw error;
  }
};

// Get Products (SSR-safe)
export const getProducts = async () => {
  try {
    const response = await axiosInstance.get(`/products`);
    return response.data.products as IProduct[];
  } catch (error) {
    throw error;
  }
};
export const getProductsnew = async () => {
  try {

    const response = await axiosInstance.get(`/products`);
    return response.data.products as IProduct[];
  } catch (error) {
    throw error;
  }
};
export const ActivegetProducts = async () => {
  try {
    const response = await axiosInstance.get(`/products/Active/All`);
    return response.data.products as IProduct[];
  } catch (error) {
    throw error;
  }
};
interface TopProductsOptions {
  searchTerm?: string;
  categoryName?: string;
  subCategoryName?: string;
}

export const TopProducts = async (options: TopProductsOptions = {}) => {
  try {
    const { searchTerm, categoryName, subCategoryName } = options;

    // Build query parameters - using names instead of IDs
    const params: any = {};
    if (searchTerm?.trim()) params.searchTerm = searchTerm.trim();
    if (categoryName?.trim()) params.categoryName = categoryName.trim();
    if (subCategoryName?.trim()) params.subCategoryName = subCategoryName.trim();

    const response = await axiosInstance.get(
      `/products/get/all/Top/Selling/Products`,
      {
        params
      }
    );

    // ✅ Extract only the product info from each item
    const products = (response.data?.products || []).map((item: any) => {
      // The product data is nested inside item.product
      const productData = item.product || item;

      return {
        ...productData,
        availableQuantity: item.availableQuantity ?? 0 // Use the availableQuantity from the item, not product
      };
    });

    return products as IProduct[];
  } catch (error) {
    throw error;
  }
};

// Get Product by ID /api/
export const getProductById = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/products/${id}`);
    return response.data.product as IProduct;
  } catch (error) {
    throw error;
  }
};
export const getSubProductsByProductId = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/product/subproducts/detail/${id}`);
    return response.data.subProducts as ISubProduct[];
  } catch (error) {
    throw error;
  }
};
export const getUnitOfMeasuresByProductId = async (
  productId: string
): Promise<IUnitOfMeasure[]> => {
  try {

    const response = await axiosInstance.get(`/products/${productId}`);
    return response.data.product.unitOfMeasure;
  } catch (error) {
    throw error;
  }
};

// Get Product by Code
export const getProductByCode = async (code: string) => {
  try {
    const response = await axiosInstance.get(`/products/code/${code}`);
    return response.data.product as IProduct;
  } catch (error) {
    throw error;
  }
};

// Create Product
export const createProduct = async (data: any) => {
  try {
    const config =
      data instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};

    const response = await axiosInstance.post(`/products`, data, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Create a product batch
export const createProductBatch = async (
  productId: string,
  data: any | FormData
) => {
  try {

    const config =
      data instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};

    const response = await axiosInstance.post(
      `/products/${productId}/batches`,
      data,
      config
    );

    return response.data;
  } catch (error) {
    throw error;
  }
};

// Update Product
export const updateProduct = async (
  id: string,
  data: any
) => {
  try {
    const config =
      data instanceof FormData
        ? { headers: { 'Content-Type': 'multipart/form-data' } }
        : {};

    const response = await axiosInstance.put(`/products/${id}`, data, config);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Delete Product
export const deleteProduct = async (id: string) => {
  try {
    const response = await axiosInstance.delete(`/products/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const createProductBatchSingle = async (
  data: any
) => {
  try {
    const response = await axiosInstance.post(`/products/Batch/single`, data);
    return response.data;
  } catch (error) {
    throw error;
  }
};
export const getProductdetailaById = async (
  id: string
) => {
  try {
    const response = await axiosInstance.get(`/product/detail/${id}`);
    return response.data.product;
  } catch (error) {
    throw error;
  }
};

// One sub-product with prices, batches, stock per location and recent movements
export interface ISubProductDetails {
  subProduct: {
    id: string;
    name: string;
    subProductCode: string;
    imageUrl: string | null;
    isActive: boolean;
    sellPrice: number | string | null;
    ecommercePrice: number | string | null;
    effectiveSellPrice: number | string | null;
    createdAt: string;
    updatedAt: string;
  };
  product: {
    id: string;
    name: string;
    productCode: string;
    sellPrice: number | string | null;
    ecommercePrice: number | string | null;
    warningQuantity: number;
    category: { id: string; name: string } | null;
    subCategory: { id: string; name: string } | null;
    unitOfMeasure: { id: string; name: string; symbol?: string } | null;
  };
  additionalPrices: {
    id: string;
    label: string | null;
    price: number;
    shopId: string | null;
    shopName?: string;
    branchName?: string;
  }[];
  batches: {
    id: string;
    batchNumber: string;
    expiryDate: string | null;
    isExpired: boolean;
    price: number | null;
    storeQuantity: number;
    shopQuantity: number;
    totalQuantity: number;
  }[];
  locationStocks: {
    type: 'store' | 'shop';
    id: string;
    name?: string;
    branchName?: string;
    quantity: number;
  }[];
  // Full stock ledger of this sub-product's batches (same as the product page)
  stockLedgers: IStockLedgerEntry[];
  summary: {
    storeQuantity: number;
    shopQuantity: number;
    totalQuantity: number;
    batchCount: number;
    locationCount: number;
  };
}

export const getSubProductDetails = async (
  subProductId: string
): Promise<ISubProductDetails> => {
  const response = await axiosInstance.get(`/subproducts/${subProductId}/details`);
  return response.data;
};

export const getProductByShops = async (
  productId: string,
  subProductId?: string // 👈 optional subProductId
) => {
  try {

    // Build URL with optional query
    const url = subProductId
      ? `/products/Batch/shop/find/ByShops/${productId}?subProductId=${subProductId}`
      : `/products/Batch/shop/find/ByShops/${productId}`;

    const response = await axiosInstance.get(url);

    return response.data.batches; // ✅ returns product/subproduct stock info
  } catch (error) {
    throw error;
  }
};


// Price Update page: one sell price or additional price to change. oldPrice
// is the price the page showed; the backend refuses the save if it changed.
export type TPriceChange = {
  kind:
    | 'product'
    | 'subProduct'
    | 'additional'
    | 'ecommerceProduct'
    | 'ecommerceSubProduct';
  id: string;
  oldPrice: number | null;
  newPrice: number;
};

/** Send the e-commerce prices to the e-commerce system (Price Update page). */
export const syncEcommercePrices = async () => {
  const response = await axiosInstance.post(`/product-prices/sync-ecommerce`);
  return response.data as {
    success: boolean;
    message: string;
    data: {
      products?: { updated: number; unchanged: number };
      subProducts?: { updated: number; unchanged: number };
      notLinked?: number;
    };
  };
};

export const updatePrices = async (changes: TPriceChange[]) => {
  const response = await axiosInstance.put(`/product-prices`, { changes });
  return response.data as {
    success: boolean;
    message: string;
    data: { updated: number };
  };
};

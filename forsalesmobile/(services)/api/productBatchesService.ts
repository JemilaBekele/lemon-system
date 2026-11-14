import api from "@/(utils)/config";

// Types for Product Batches based on backend response
export interface UnitOfMeasure {
  id: string;
  name: string;
  symbol?: string;
  base?: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Shop {
  id: string;
  name: string;
  branchId: string;
  branch: Branch;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdditionalPrice {
  id: string;
  label: string;
  price: number;
}


export interface ShopBatchInfo {
  shopId: string;
  shopName: string;
  branchName?: string;
  quantity: number;
  basePrice: number | null;
  totalPrice: number | null;
  additionalPrices: AdditionalPrice[];
  unitOfMeasure?: UnitOfMeasure;
}

// A sellable variant of a product (backend SubProduct)
export interface SubProductOption {
  id: string;
  name: string;
  subProductCode: string;
  imageUrl?: string | null;
  sellPrice?: number | null;
}

export interface ProductBatchesForUserResponse {
  // Active variants of the product; when non-empty the salesperson must pick one
  subProducts?: SubProductOption[];
  batches: {
    totalAvailableQuantity: number;
    shops: ShopBatchInfo[];
    hasStock: boolean;
    subProduct?: {
      id: string;
      name: string;
      subProductCode: string;
      imageUrl?: string | null;
      productId: string;
      productName: string;
    };
    _metadata?: {
      totalShops: number;
      accessibleShops: number;
      hasRestrictedAccess: boolean;
      userHasAccess?: boolean;
      message: string;
    };
  };
}

// Get Product Batches by Shops for Current User
// Pass subProductId to get stock and prices for one variant
export const getProductBatchesByShopsForUser = async (
  productId: string,
  subProductId?: string | null
): Promise<ProductBatchesForUserResponse> => {
  try {
    const response = await api.get(
      `/products/Batch/shop/find/ByShops/ForUser/${productId}`,
      { params: subProductId ? { subProductId } : undefined }
    );
    
    
    return response.data;
  } catch (error: any) {
    
    // Handle specific error cases
    if (error.response?.status === 404) {
      throw new Error("No available batches found for this product");
    } else if (error.response?.status === 401) {
      throw new Error("Authentication required");
    } else if (error.response?.status === 403) {
      throw new Error("Access denied to product batch information");
    }
    
    throw new Error(error.response?.data?.message || "Failed to fetch product batches information");
  }
};
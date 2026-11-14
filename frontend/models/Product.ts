/* eslint-disable @typescript-eslint/no-explicit-any */
import { ICategory } from './Category';
import { IShop } from './shop';
import { IShopStock } from './store';
import { IUnitOfMeasure } from './UnitOfMeasure';

export interface IAdditionalPrice {
  id: string;
  label?: string;
  price: number;
  batchId: string;
  shopId: string;
  subProductId?: string;
  subProducts?: ISubProduct;

  shop?: IShop;
  createdAt: string;
  updatedAt: string;
}
export interface ISubProduct {
  id: string;
  additionalPrices?: IAdditionalPrice[]; // this sub-product's own prices
  ecommercePrice?: number | string | null; // price in the e-commerce shop
  sellPrice?: number | string | null; // own sell price (else the product's)
  name: string;
  imageUrl: string;
  subProductCode: string;
  productId: string;

  isActive: boolean;
product?: IProduct;

  stockSummary: IStockSummary;

  createdAt: string;
  updatedAt: string;
}

export interface IProduct {
  subProductCount: number;
  id: string;
  imageUrl?: string;

  productCode: string;
  generic?: string;
  name: string;
  description?: string;
  unitOfMeasureId: string; // foreign key
  unitOfMeasure?: IUnitOfMeasure;
  unit: string;

  sellPrice: number;
  ecommercePrice?: number | string | null; // price in the e-commerce shop
  warningQuantity?: number; // low-stock threshold for the whole product

  categoryId: string;
  subCategoryId?: string;
    subProducts?: ISubProduct[];

  isActive: boolean;
  additionalPrices?: IAdditionalPrice[];
  batches?: IProductBatch[];
  createdAt: string;
  updatedAt: string;
  productBatches: IProductBatch[];
  stockSummary: IStockSummary;
  category: ICategory;
  subCategory?: ICategory;
  overallTotals: IOverallTotals;
  AdditionalPrice: IAdditionalPrice[];
  // Added overallTotals property
}
export interface IProductBatch {
  id: string;
  batchNumber: string;
  expiryDate?: string;
  productId: string;
     subProductId?: string;
    subProducts?: ISubProduct[];

  // ISO date string
  price?: number;
  stock?: number; // on-hand total across stores and shops (computed by the API)
  availableQuantity?: number;
  storeId?: string;
  ShopStock: IShopStock[];
  createdAt: string;
  updatedAt: string;
  product?: IProduct;
}

export interface IStockSummary {
  shopStocks: {
    [shopName: string]: {
      quantity: number;
      branchId?: string;
      branchName?: string;
    };
  };
  storeStocks: {
    [storeName: string]: {
      quantity: number;
      branchId?: string;
      branchName?: string;
    };
  };
  totalShopStock: number;
  totalStoreStock: number;
  totalStock: number;
}

export interface IOverallTotals {
  totalShopStock: number;
  totalStoreStock: number;
  totalAllStock: number;
  shopTotals: { [shopName: string]: number };
  storeTotals: { [storeName: string]: number };
}

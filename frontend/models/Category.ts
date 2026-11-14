/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ICategory {
  id: string; // UUID string
  name: string;

  code?: string;        // optional code (e.g., CAT001)
  image?: string;       // optional image URL
  isActive: boolean;    // true by default
  displayOrder: number; // default 0

  products?: any[];         // Replace 'any' with IProduct[] if you have a Product model
  subCategories?: ISubCategory[];

  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface ISubCategory {
  id: string; // UUID string
  name: string;

  code?: string;        // optional code
  image?: string;       // optional image URL
  isActive: boolean;    // true by default
  displayOrder: number; // default 0

  categoryId: string;   // UUID string
  category?: ICategory;

  products?: any[];     // Replace 'any' with IProduct[] if needed

  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

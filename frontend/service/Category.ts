/* eslint-disable @typescript-eslint/no-explicit-any */
import { axiosInstance } from "./axiosIntance";
import { ICategory, ISubCategory } from '@/models/Category';

// Generic Pagination Params
export interface GetParams {
  page?: number;
  limit?: number;
}

// ========================= CATEGORIES ========================= //

// Get all categories
interface CategoriesResponse {
  success: boolean;
  count: number;
  categories: ICategory[];
}

export const getAllCategories = async ({
  page = 1,
  limit = 10
}: GetParams = {}) => {
  try {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    const url = `categories?${query}`;
    const response = await axiosInstance.get<CategoriesResponse>(url);
    const categories = response.data.categories;

    return {
      categories,
      totalCount: response.data.count ?? categories.length,
      success: response.data.success
    };
  } catch (error) {
    throw error;
  }
};

export const getCategories = async () => {
  try {
    const response = await axiosInstance.get(`/categories`);
    return response.data.categories as ICategory[];
  } catch (error) {
    throw error;
  }
};
export const getCategoriesapi = async () => {
  try {
    const response = await axiosInstance.get(`/categories`);
    return response.data.categories as ICategory[];
  } catch (error) {
    throw error;
  }
};

export const getCategoryById = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/categories/${id}`);
    return response.data.category as ICategory;
  } catch (error) {
    throw error;
  }
};


export const createCategory = async (
  data: FormData | Partial<ICategory>
) => {
  try {
    
    // Check if data is FormData (for file upload) or regular object
    const config = data instanceof FormData 
      ? {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      : {};

    const response = await axiosInstance.post(`/categories`, data, config);
    return response.data;
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
};

export const updateCategory = async (
  id: string,
  data: FormData | Partial<ICategory>
) => {
  try {
    
    // Check if data is FormData (for file upload) or regular object
    const config = data instanceof FormData 
      ? {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      : {};

    const response = await axiosInstance.put(`/categories/${id}`, data, config);
    return response.data;
  } catch (error) {
    console.error('Error updating category:', error);
    throw error;
  }
};


export const deleteCategory = async (id: string) => {
  try {
    const response = await axiosInstance.delete(`/categories/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========================= SUBCATEGORIES ========================= //

export const getSubCategoryById = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/subcategories/${id}`);
    return response.data.subCategory as ISubCategory;
  } catch (error) {
    throw error;
  }
};

export const getSubCategories = async () => {
  try {
    const response = await axiosInstance.get(`/subcategories/veiw/all/find`);
    console.log("subcatagory", response.data.subcategories, "response.data.subcategories")
    return response.data.subcategories as any[];
  } catch (error) {
    throw error;
  }
};
export const getSubCategoriesapi = async () => {
  try {
    const response = await axiosInstance.get(`/subcategories/veiw/all/find`);
    return response.data.subcategories as ISubCategory[];
  } catch (error) {
    throw error;
  }
};

/* ---------------- CREATE ---------------- */
export const createSubCategory = async (
  data: FormData | Partial<ISubCategory>
) => {
  try {

    const config =
      data instanceof FormData
        ? {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        : {};

    const response = await axiosInstance.post('/subcategories', data, config);
    return response.data;
  } catch (error) {
    console.error('Error creating subcategory:', error);
    throw error;
  }
};

/* ---------------- UPDATE ---------------- */
export const updateSubCategory = async (
  id: string,
  data: FormData | Partial<ISubCategory>
) => {
  try {

    const config =
      data instanceof FormData
        ? {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        : {};

    const response = await axiosInstance.put(
      `/subcategories/${id}`,
      data,
      config
    );
    return response.data;
  } catch (error) {
    console.error('Error updating subcategory:', error);
    throw error;
  }
};


export const deleteSubCategory = async (id: string) => {
  try {
    const response = await axiosInstance.delete(`/subcategories/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

interface SubCategoriesResponse {
  success: boolean;
  count: number;
  subcategories: ISubCategory[];
}

export const getSubCategoriesByCategory = async ({
  page = 1,
  limit = 10
}: { page?: number; limit?: number } = {}) => {
  try {
    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    const url = `subcategories/veiw/all/find?${query}`;
    const response = await axiosInstance.get<SubCategoriesResponse>(url);
    const subcategories = response.data.subcategories;
    return {
      subcategories,
      totalCount: response.data.count ?? subcategories.length,
      success: response.data.success
    };
  } catch (error) {
    throw error;
  }
};

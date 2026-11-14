/* eslint-disable @typescript-eslint/no-explicit-any */
import { axiosInstance } from "./axiosIntance";
import { PaginationParams } from './store';
import { ISell } from '@/models/Sell';

interface SellsResponse {
  success: boolean;
  count: number; // sales matching every filter
  totalCount?: number; // all sales in the date range
  statusCounts?: Record<string, number>;
  uncheckedCount?: number;
  stockCorrectionCounts?: Record<string, number>;
  sells: ISell[];
}

export interface SellListParams extends PaginationParams {
  q?: string;
  status?: string;
  employee?: string;
  unchecked?: boolean;
}

// ✅ Get one page of sells; filtering and counting happen on the server
export const getAllSells = async ({
  page = 1,
  limit = 10,
  startDate,
  endDate,
  q,
  status,
  employee,
  unchecked
}: SellListParams = {}): Promise<{
  data: ISell[];
  filteredCount: number;
  totalCount: number;
  statusCounts: Record<string, number>;
  uncheckedCount: number;
  success?: boolean;
}> => {
  try {

    const query = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    if (startDate) query.append('startDate', startDate);
    if (endDate) query.append('endDate', endDate);
    if (q) query.append('q', q);
    if (status && status !== 'all') query.append('status', status);
    if (employee && employee !== 'all') query.append('employee', employee);
    if (unchecked) query.append('unchecked', 'true');

    const url = `/sells?${query}`;
    const response = await axiosInstance.get<SellsResponse>(url);

    return {
      data: response.data.sells,
      filteredCount: response.data.count ?? response.data.sells.length,
      totalCount: response.data.totalCount ?? response.data.count ?? 0,
      statusCounts: response.data.statusCounts ?? {},
      uncheckedCount: response.data.uncheckedCount ?? 0,
      success: response.data.success
    };
  } catch (error) {
    throw error;
  }
};
// All sales matching the filters (no paging), only the columns the Excel export uses
export const exportSells = async ({
  startDate,
  endDate,
  q,
  status,
  employee,
  unchecked,
  withItems
}: SellListParams & { withItems?: boolean } = {}): Promise<ISell[]> => {
  const query = new URLSearchParams({ export: 'true' });
  // Item lines too (for the accounting export)
  if (withItems) query.append('withItems', 'true');
  if (startDate) query.append('startDate', startDate);
  if (endDate) query.append('endDate', endDate);
  if (q) query.append('q', q);
  if (status && status !== 'all') query.append('status', status);
  if (employee && employee !== 'all') query.append('employee', employee);
  if (unchecked) query.append('unchecked', 'true');

  const response = await axiosInstance.get<SellsResponse>(`/sells?${query}`);
  return response.data.sells;
};

export interface ScopedSellListParams extends PaginationParams {
  q?: string;
  status?: string;
}

// ✅ Own Sales: one page of the user's sales; filtering and counting happen on the server
export const getAllSellsuserBased = async ({
  page = 1,
  limit = 10,
  startDate,
  endDate,
  q,
  status
}: ScopedSellListParams = {}): Promise<{
  data: ISell[];
  filteredCount: number;
  totalCount: number;
  statusCounts: Record<string, number>;
  success?: boolean;
}> => {
  const query = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });

  if (startDate) query.append('startDate', startDate);
  if (endDate) query.append('endDate', endDate);
  if (q) query.append('q', q);
  if (status && status !== 'all') query.append('status', status);

  const url = `/sells/user/based/web?${query}`;
  const response = await axiosInstance.get<SellsResponse>(url);
  return {
    data: response.data.sells,
    filteredCount: response.data.count ?? response.data.sells.length,
    totalCount: response.data.totalCount ?? response.data.count ?? 0,
    statusCounts: response.data.statusCounts ?? {},
    success: response.data.success
  };
};

// ✅ Store Orders: one page of sales with items in the user's shops.
// status may also be 'stock-PENDING' / 'stock-PARTIAL' (stock correction filter).
export const getAllSellsstoregetAll = async ({
  page = 1,
  limit = 10,
  startDate,
  endDate,
  q,
  status
}: ScopedSellListParams = {}): Promise<{
  data: ISell[];
  filteredCount: number;
  totalCount: number;
  statusCounts: Record<string, number>;
  stockCorrectionCounts: Record<string, number>;
  success?: boolean;
}> => {
  const query = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });

  if (startDate) query.append('startDate', startDate);
  if (endDate) query.append('endDate', endDate);
  if (q) query.append('q', q);
  if (status && status !== 'all') query.append('status', status);

  const url = `/sells/store/getAll/web?${query}`;
  const response = await axiosInstance.get<SellsResponse>(url);
  return {
    data: response.data.sells,
    filteredCount: response.data.count ?? response.data.sells.length,
    totalCount: response.data.totalCount ?? response.data.count ?? 0,
    statusCounts: response.data.statusCounts ?? {},
    stockCorrectionCounts: response.data.stockCorrectionCounts ?? {},
    success: response.data.success
  };
};

// ✅ Get sells (simple version)
export const getSells = async () => {
  try {
    const response = await axiosInstance.get(`/sells`);
    return response.data.sells as ISell[];
  } catch (error) {
    throw error;
  }
};

// ✅ Get sell by ID
export const getSellById = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/sells/${id}`);
    return response.data.sell as ISell;
  } catch (error) {
    throw error;
  }
};
export const getSellByIds = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/sells/${id}`);
    return response.data.sell as ISell;
  } catch (error) {
    throw error;
  }
};
// ✅ Get sell by ID but user-based
export const getSellByIdByUser = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/sells/${id}/user/based`);
    return response.data.sell as ISell;
  } catch (error) {
    throw error;
  }
};
export const unlockSellById = async (id: string) => {
  try {
    const response = await axiosInstance.patch(`/sells/With/Lock/${id}`);
    return response.data; // You might want to specify a return type based on what your API returns
  } catch (error) {
    throw error;
  }
};
export const getSellId = async (id: string) => {
  try {
    const response = await axiosInstance.get(`/sells/${id}`);
    return response.data.sell as ISell;
  } catch (error) {
    throw error;
  }
};

// ✅ Create a sell
export const createSell = async (data: any) => {
  try {
    const response = await axiosInstance.post(`/sells`, data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Update a sell
export const updateSell = async (
  id: string,
  data: any
) => {
  try {
    const response = await axiosInstance.put(`/sells/${id}`, data);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Delete a sell
export const deleteSell = async (id: string) => {
  try {
    const response = await axiosInstance.delete(`/sells/${id}`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Deliver ALL items of a sale
// ✅ Deliver ALL items of a sale with batch assignment
export const deliverAllSaleItems = async (
  id: string,
  deliveryData: DeliveryData
) => {
  try {
    const response = await axiosInstance.patch(`/sells/deliver/all/${id}`, {
      deliveryData
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Complete Sale Delivery with batch assignment
export const completeSaleDelivery = async (
  id: string,
  deliveryData: DeliveryData
) => {
  try {
    const response = await axiosInstance.patch(`/sells/deliver/${id}`, {
      deliveryData
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Partial Sale Delivery with batch assignment
export const partialSaleDelivery = async (
  id: string,
  deliveryData: DeliveryData
) => {
  try {
    const response = await axiosInstance.patch(`/sells/partial/deliver/${id}`, {
      deliveryData
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Types for batch delivery data
export interface DeliveryData {
  items: DeliveryItem[];
}

export interface DeliveryItem {
  itemId: string;
  batches: BatchAssignment[];
}

export interface BatchAssignment {
  batchId: string;
  quantity: number;
}

// ✅ Update Sale Status
export const updateSaleStatus = async (
  id: string,
  newStatus: string
) => {
  try {
    const response = await axiosInstance.patch(`/sells/${id}/status`, {
      newStatus
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ✅ Cancel Sale
export const cancelSale = async (id: string) => {
  try {
    const response = await axiosInstance.patch(`/sells/${id}/cancel`);
    return response.data;
  } catch (error) {
    throw error;
  }
};

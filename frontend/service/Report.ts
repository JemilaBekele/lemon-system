import { axiosInstance } from "./axiosIntance";
import { SalesReportResponse } from '@/models/sellreport';

// ========================= SELL REPORTS ========================= //

// Sell Trend (Monthly totals)
export interface SellTrend {
  month: string;
  total: number;
}

interface SellTrendResponse {
  success: boolean;
  chartData: SellTrend[];
}

export const getSellTrendApi = async () => {
  try {

    const response = await axiosInstance.get<SellTrendResponse>(`/trend`);
    return response.data.chartData;
  } catch (error) {
    throw error;
  }
};

// ========================= TOTAL SOLD ========================= //

interface TotalSoldResponse {
  success: boolean;
  totalSold: number;
  startDate?: string;
  endDate?: string;
}

export const getTotalSold = async (
  params: { startDate?: string; endDate?: string } = {}
) => {
  try {
    const query = new URLSearchParams(params).toString();
    const response = await axiosInstance.get<TotalSoldResponse>(
      `/total-sold?${query}`
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getTotalSoldApi = async (
  params: { startDate?: string; endDate?: string } = {}
) => {
  try {
    const query = new URLSearchParams(params).toString();
    const response = await axiosInstance.get<TotalSoldResponse>(
      `/api/total-sold?${query}`
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========================= ALL SELLS ========================= //

export interface SellItem {
  id: string;
  saleDate: string;
  NetTotal: number;
  branch?: any;
  customer?: any;
  createdBy?: any;
  items?: any[];
  _count?: { items: number };
}

interface AllSellsResponse {
  success: boolean;
  sells: SellItem[];
  count: number;
}

export const getAllSells = async (
  params: {
    startDate?: string;
    endDate?: string;
    createdById?: string;
    customerId?: string;
    branchId?: string;
    saleStatus?: string; // Add saleStatus filter
    itemSaleStatus?: string;
  } = {}
) => {
  try {
    const query = new URLSearchParams(params).toString();
    const response = await axiosInstance.get<AllSellsResponse>(
      `/trend/all/sell?${query}`
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getSalesReports = async (
  params: {
    startDate?: string;
    endDate?: string;
    shopId?: string;
    limit?: number;
    slowMoveThreshold?: number;
  } = {}
) => {
  try {

    const query = new URLSearchParams(
      Object.entries(params).reduce(
        (acc, [key, value]) => {
          if (value !== undefined && value !== null) {
            acc[key] = String(value);
          }
          return acc;
        },
        {} as Record<string, string>
      )
    ).toString();

    const response = await axiosInstance.get<SalesReportResponse>(
      `/reports/sales/rank?${query}`
    );

    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getUserDashboardSummaryApi = async () => {
  try {

    const response = await axiosInstance.get(`/reports/sales/user/dashboard`);
    return response.data;
  } catch (error) {
    throw error;
  }
};
export const getSalesCreatorDashboardSummaryApi = async () => {
  try {

    const response = await axiosInstance.get(
      '/reports/sales/user/creator/dashboard'
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch Financial Totals for Dashboard
 */
export const getFinancialTotalsApi = async () => {
  try {

    const response = await axiosInstance.get('/dashboard/financial-totals');
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Fetch Sell Status Pie Chart Data
 */
export const getSellStatusChartApi = async () => {
  try {

    const response = await axiosInstance.get('/dashboard/sell-status-chart');
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ========================= BUSINESS ANALYTICS ========================= //
// Main dashboard: sales and stock for one date range (YYYY-MM-DD) and branch.
// No cost / profit figures: finances are kept in other software.

export interface IAnalyticsKpis {
  salesAmount: number;
  salesCount: number;
  averageSale: number;
  itemsSold: number;
  productsInStock: number;
  unitsInStock: number;
  outOfStockCount: number;
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
}

export interface IBusinessAnalytics {
  range: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    granularity: 'day' | 'month';
  };
  kpis: IAnalyticsKpis;
  previous: {
    salesAmount: number;
    salesCount: number;
    itemsSold: number;
    salesAmountChange: number | null;
    salesCountChange: number | null;
    itemsSoldChange: number | null;
  };
  trend: { period: string; amount: number; sales: number; items: number }[];
  topProducts: { name: string; code?: string; quantity: number; amount: number }[];
  topCustomers: { name: string; orders: number; amount: number }[];
  salespeople: { name: string; orders: number; amount: number }[];
  byShop: { name: string; amount: number; quantity: number }[];
  byCategory: { name: string; amount: number; quantity: number }[];
  lowStock: { name: string; code?: string; quantity: number; warningQuantity: number }[];
  expiring: {
    product: string;
    code?: string;
    batchNumber: string;
    expiryDate: string;
    daysLeft: number;
    quantity: number;
  }[];
  notSelling: { name: string; code?: string; quantity: number }[];
  pending: {
    sales: number;
    purchases: number;
    transfers: number;
    stockCorrections: number;
    saleCorrections: number;
  };
}

export const getBusinessAnalyticsApi = async (params: {
  from: string;
  to: string;
  branchId?: string;
}): Promise<IBusinessAnalytics> => {
  const response = await axiosInstance.get('/dashboard/analytics', { params });
  return response.data.data as IBusinessAnalytics;
};

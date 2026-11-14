
import { axiosInstance } from "./axiosIntance";
export const InventoryDashboardApi = {
  // 📊 Get comprehensive inventory dashboard data
  getDashboard: async () => {
    const response = await axiosInstance.get('/inventory-dashboard/dashboard');
    return response.data;
  }
};

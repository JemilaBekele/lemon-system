const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { InventoryDashboardService } = require('../services');

/**
 * Get comprehensive inventory dashboard data
 */
const getInventoryDashboard = catchAsync(async (req, res) => {
  const dashboardData = await InventoryDashboardService.getInventoryDashboard();

  const safeDashboard = JSON.parse(
    JSON.stringify(dashboardData, (_, value) =>
      typeof value === 'bigint' ? Number(value) : value,
    ),
  );
  res.status(httpStatus.OK).send(safeDashboard);
});

module.exports = {
  getInventoryDashboard,
};

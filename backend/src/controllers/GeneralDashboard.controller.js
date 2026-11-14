const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const {
  GeneralDashboardService,
  BusinessAnalyticsService,
} = require('../services');

/**
 * Get all financial totals with items for dashboard
 */
const getAllTotalsWithItems = catchAsync(async (req, res) => {
  const result = await GeneralDashboardService.getAllTotalsWithItems();

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

/**
 * Get sell status pie chart data for dashboard
 */
const getSellStatusPieChart = catchAsync(async (req, res) => {
  const result = await GeneralDashboardService.getSellStatusPieChart();

  res.status(httpStatus.OK).send({
    success: true,
    ...result,
  });
});

// Business analytics for the overview page. Query: from, to (YYYY-MM-DD),
// optional branchId
const getBusinessAnalytics = catchAsync(async (req, res) => {
  const { from, to, branchId } = req.query;
  const data = await BusinessAnalyticsService.getBusinessAnalytics({
    from,
    to,
    branchId: branchId || undefined,
  });
  res.status(httpStatus.OK).send({ success: true, data });
});

module.exports = {
  getBusinessAnalytics,
  getAllTotalsWithItems,
  getSellStatusPieChart,
};

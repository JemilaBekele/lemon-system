const express = require('express');
const { GeneralDashboardController } = require('../controllers');
const auth = require('../middlewares/auth');
const checkPermission = require('../middlewares/permission.middleware');

const router = express.Router();

/**
 * General Dashboard Routes
 */
router.get(
  '/api/dashboard/financial-totals',
  // auth,
  GeneralDashboardController.getAllTotalsWithItems,
);

router.get(
  '/api/dashboard/sell-status-chart',
  // auth,
  GeneralDashboardController.getSellStatusPieChart,
);

router.get(
  '/api/dashboard/analytics',
  auth,
  checkPermission('VIEW_MAIN_DASHBOARD'),
  GeneralDashboardController.getBusinessAnalytics,
);

module.exports = router;

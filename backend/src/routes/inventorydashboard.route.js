const express = require('express');

const router = express.Router();
const { inventoryDashboardController } = require('../controllers');
const auth = require('../middlewares/auth');

// Inventory Dashboard Routes

// Get comprehensive inventory dashboard data
router.get(
  '/api/inventory-dashboard/dashboard',
  auth,
  inventoryDashboardController.getInventoryDashboard,
);

module.exports = router;

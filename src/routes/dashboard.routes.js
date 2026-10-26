const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { protect, restrictTo } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/general', restrictTo('owner', 'admin'), dashboardController.getGeneralDashboard);

router.get(
  '/local/:storeId',
  restrictTo('local_manager', 'admin'),
  dashboardController.getLocalDashboard,
);

module.exports = router;

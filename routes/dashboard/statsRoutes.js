const express = require('express');
const router = express.Router();
const statsController = require('../../controllers/dashboard/statsController');
const { validateQuery } = require('../../middlewares/validate');
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');

const { adminFilterSchema } = require('../../validation/commonValidations');

// Admin authentication middleware
router.use(verifyDashboardUser);

// Dashboard counts for stats cards
router.get('/counts', statsController.getDashboardCounts);

// Dashboard statistics
router.get('/', statsController.getDashboardStats);

// Analytics routes
router.get('/analytics/quiz', statsController.getQuizAnalytics);

module.exports = router;

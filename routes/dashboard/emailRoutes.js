const express = require('express');
const router = express.Router();
const emailController = require('../../controllers/dashboard/emailController');
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');

// Admin authentication middleware
router.use(verifyDashboardUser);

// Email logs
router.get('/', emailController.getEmailLogs);
router.get('/stats', emailController.getEmailStats);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    signUp,
    signIn,
    getAllDashboardUsers,
} = require('../../controllers/dashboard/dashboardUserController');
const { validate } = require('../../middlewares/validate');
const {
    dashboardUserSchemaLogin,
    dashboardUserSchemaSignup,
} = require('../../validation/dashboardUserValidation');
const {
    verifyDashboardUser,
    requireRole,
} = require('../../middlewares/verifyDashboardUser');

router.post('/signup', validate(dashboardUserSchemaSignup), signUp);
router.post('/login', validate(dashboardUserSchemaLogin), signIn);
router.get(
    '/dashboardUserlist',
    verifyDashboardUser,
    requireRole(['Admin']),
    getAllDashboardUsers
);
router.get(
    '/userlist',
    verifyDashboardUser,
    requireRole(['Admin']),
    getAllDashboardUsers
);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    signUp,
    signIn,
    getAllDashboardUsers,
    getAllUsers,
    getUserDetail,
    giveBonusToUser,
    giveBonusToAllUsers,
} = require('../../controllers/dashboard/dashboardUserController');
const {
    validate,
    validateMongoId,
    validateBody,
} = require('../../middlewares/validate');
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
    getAllDashboardUsers,
);
router.get(
    '/userlist',
    verifyDashboardUser,
    requireRole(['Admin']),
    getAllUsers,
);

router.get(
    '/userlist/:userId',
    verifyDashboardUser,
    requireRole(['Admin']),
    validateMongoId('userId'),
    getUserDetail,
);

router.post(
    '/userlist/:userId/bonus',
    verifyDashboardUser,
    requireRole(['Admin']),
    validateMongoId('userId'),
    giveBonusToUser,
);

router.post(
    '/bonus-all',
    verifyDashboardUser,
    requireRole(['Admin']),
    giveBonusToAllUsers,
);

module.exports = router;

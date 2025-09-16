const express = require('express');
const router = express.Router();
const {
    signUp,
    signIn,
} = require('../../controllers/dashboard/dashboardUserController');
const { validate } = require('../../middlewares/validate');
const {
    dashboardUserSchemaLogin,
    dashboardUserSchemaSignup,
} = require('../../validation/dashboardUserValidation');

router.post('/signup', validate(dashboardUserSchemaSignup), signUp);
router.post('/login', validate(dashboardUserSchemaLogin), signIn);

module.exports = router;

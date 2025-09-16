const Joi = require('joi');

exports.dashboardUserSchemaSignup = Joi.object({
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    secretCode: Joi.string().optional(),
});

exports.dashboardUserSchemaLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
});

const Joi = require('joi');

exports.contactSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    subject: Joi.string().min(2).max(100).required(),
    message: Joi.string().min(10).max(1000).required(),
});

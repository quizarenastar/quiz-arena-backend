const Joi = require('joi');
exports.refundSchema = Joi.object({
    reason: Joi.string().max(200).required(),
});

exports.transactionFilterSchema = Joi.object({
    type: Joi.string()
        .valid('payment', 'earning', 'withdrawal', 'refund', 'all')
        .optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
});

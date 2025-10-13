const Joi = require('joi');

exports.transactionFilterSchema = Joi.object({
    type: Joi.string()
        .valid('payment', 'earning', 'withdrawal', 'refund', 'all')
        .optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
});

exports.earningsQuerySchema = Joi.object({
    period: Joi.number().integer().min(1).max(365).optional(),
});

// Wallet operations schemas
exports.addFundsSchema = Joi.object({
    amount: Joi.number().min(0.01).max(1000).required(),
    paymentMethod: Joi.string().optional(),
    transactionId: Joi.string().max(100).optional().allow(''),
});

exports.withdrawalSchema = Joi.object({
    amount: Joi.number().min(100).required(),
    withdrawalMethod: Joi.string()
        .valid('upi', 'bank', 'bank-transfer')
        .default('upi'),
    upiId: Joi.string()
        .pattern(/^[\w.-]+@[\w.-]+$/)
        .when('withdrawalMethod', {
            is: 'upi',
            then: Joi.required(),
            otherwise: Joi.optional(),
        })
        .messages({
            'string.pattern.base':
                'Please enter a valid UPI ID (e.g., user@paytm)',
        }),
    accountDetails: Joi.string().max(500).optional(),
});

const Joi = require('joi');

// Parameter validation schemas
exports.mongoIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/);

// Query validation schemas
exports.paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
});

exports.adminFilterSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search: Joi.string().max(100).optional(),
    status: Joi.string()
        .valid('pending', 'approved', 'rejected', 'all')
        .optional(),
    category: Joi.string()
        .valid(
            'technology',
            'science',
            'history',
            'geography',
            'sports',
            'entertainment',
            'literature',
            'mathematics',
            'general-knowledge'
        )
        .optional(),
});

// Admin-specific validation schemas
exports.approveRejectSchema = Joi.object({
    reason: Joi.string().min(10).max(500).optional().allow(''),
    feedback: Joi.string().max(500).optional().allow(''),
});

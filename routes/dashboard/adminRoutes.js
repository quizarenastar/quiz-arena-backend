const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/adminController');
const {
    validateBody,
    validateQuery,
    validateMongoId,
} = require('../../middlewares/validate');
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');
const Joi = require('joi');

// Admin-specific validation schemas
const approveRejectSchema = Joi.object({
    reason: Joi.string().min(10).max(500).optional().allow(''),
    feedback: Joi.string().max(500).optional().allow(''),
});

const userRoleSchema = Joi.object({
    role: Joi.string().valid('user', 'creator', 'admin').required(),
});

const userStatusSchema = Joi.object({
    suspended: Joi.boolean().required(),
    reason: Joi.string().min(10).max(500).when('suspended', {
        is: true,
        then: Joi.required(),
        otherwise: Joi.optional(),
    }),
});

const deleteQuizSchema = Joi.object({
    reason: Joi.string().min(10).max(500).required(),
});

const cancelQuizSchema = Joi.object({
    reason: Joi.string().min(10).max(500).required(),
});

const adminFilterSchema = Joi.object({
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

// Admin authentication middleware
router.use(verifyDashboardUser);

// Dashboard statistics
router.get('/dashboard/stats', adminController.getDashboardStats);

// Quiz management routes
router.get(
    '/quizzes',
    validateQuery(adminFilterSchema),
    adminController.getAllQuizzes
);

router.get(
    '/quizzes/pending',
    validateQuery(adminFilterSchema),
    adminController.getPendingQuizzes
);

router.get(
    '/quizzes/:quizId/review',
    validateMongoId('quizId'),
    adminController.getQuizForReview
);

router.post(
    '/quizzes/:quizId/approve',
    validateMongoId('quizId'),
    validateBody(approveRejectSchema),
    adminController.approveQuiz
);

router.post(
    '/quizzes/:quizId/reject',
    validateMongoId('quizId'),
    validateBody(approveRejectSchema),
    adminController.rejectQuiz
);

router.delete(
    '/quizzes/:quizId',
    validateMongoId('quizId'),
    validateBody(deleteQuizSchema),
    adminController.deleteQuiz
);

router.post(
    '/quizzes/:quizId/cancel',
    validateMongoId('quizId'),
    validateBody(cancelQuizSchema),
    adminController.cancelQuiz
);

// User management routes
router.get(
    '/users',
    validateQuery(adminFilterSchema),
    adminController.getUsers
);

router.put(
    '/users/:userId/role',
    validateMongoId('userId'),
    validateBody(userRoleSchema),
    adminController.updateUserRole
);

router.put(
    '/users/:userId/status',
    validateMongoId('userId'),
    validateBody(userStatusSchema),
    adminController.toggleUserStatus
);

// Transaction management
router.get(
    '/transactions',
    validateQuery(adminFilterSchema),
    adminController.getTransactions
);

// Analytics routes
router.get(
    '/analytics/quiz',
    validateQuery(adminFilterSchema),
    adminController.getQuizAnalytics
);

module.exports = router;

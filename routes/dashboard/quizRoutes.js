const express = require('express');
const router = express.Router();
const adminController = require('../../controllers/dashboard/quizController');
const {
    validateBody,
    validateQuery,
    validateMongoId,
} = require('../../middlewares/validate');
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');

const { adminFilterSchema } = require('../../validation/commonValidations');

const {
    deleteQuizSchema,
    cancelQuizSchema,
} = require('../../validation/quizValidation');

const { approveRejectSchema } = require('../../validation/commonValidations');

// Admin authentication middleware
router.use(verifyDashboardUser);

// Quiz management routes
router.get(
    '/',
    validateQuery(adminFilterSchema),
    adminController.getAllQuizzes
);

router.get(
    '/pending',
    validateQuery(adminFilterSchema),
    adminController.getPendingQuizzes
);

router.get(
    '/:quizId/review',
    validateMongoId('quizId'),
    adminController.getQuizForReview
);

router.post(
    '/:quizId/approve',
    validateMongoId('quizId'),
    validateBody(approveRejectSchema),
    adminController.approveQuiz
);

router.post(
    '/:quizId/reject',
    validateMongoId('quizId'),
    validateBody(approveRejectSchema),
    adminController.rejectQuiz
);

router.delete(
    '/:quizId',
    validateMongoId('quizId'),
    validateBody(deleteQuizSchema),
    adminController.deleteQuiz
);

router.post(
    '/:quizId/cancel',
    validateMongoId('quizId'),
    validateBody(cancelQuizSchema),
    adminController.cancelQuiz
);

module.exports = router;

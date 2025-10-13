const express = require('express');
const router = express.Router();
const quizController = require('../../controllers/main/quizController');
const {
    createQuizSchema,
    updateQuizSchema,
    generateQuestionsSchema,
    submitAnswersSchema,
    addQuestionSchema,
    updateQuestionSchema,
    violationSchema,
    quizFilterSchema,
} = require('../../validation/quizValidation');
const {
    validateBody,
    validateQuery,
    validateMongoId,
} = require('../../middlewares/validate');
const verifyUser = require('../../middlewares/verifyUser');
const rateLimit = require('express-rate-limit');

// Rate limiting for quiz operations
const quizCreationLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 5 quiz creations per 15 minutes
    message: {
        success: false,
        message: 'Too many quiz creation attempts. Please try again later.',
    },
});

const quizAttemptLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 attempts per minute
    message: {
        success: false,
        message: 'Too many quiz attempts. Please try again later.',
    },
});

// Public routes (no authentication required)
router.get(
    '/public',
    validateQuery(quizFilterSchema),
    quizController.getPublicQuizzes
);
router.get(
    '/public/:quizId',
    validateMongoId('quizId'),
    quizController.getQuiz
);

// Protected routes (authentication required)
router.use(verifyUser);

// AI question generation preview (no quiz creation)
router.post(
    '/generate-preview',
    validateBody(generateQuestionsSchema),
    quizController.generateQuestionsPreview
);

// Quiz management routes
router.post(
    '/',
    quizCreationLimit,
    validateBody(createQuizSchema),
    quizController.createQuiz
);

router.get(
    '/my-quizzes',
    validateQuery(quizFilterSchema),
    quizController.getUserQuizzes
);

router.get('/:quizId', validateMongoId('quizId'), quizController.getQuiz);

router.put(
    '/:quizId',
    validateMongoId('quizId'),
    validateBody(updateQuizSchema),
    quizController.updateQuiz
);

router.delete('/:quizId', validateMongoId('quizId'), quizController.deleteQuiz);

// Quiz question management
router.post(
    '/:quizId/questions',
    validateMongoId('quizId'),
    validateBody(addQuestionSchema),
    quizController.addQuestion
);

router.put(
    '/:quizId/questions/:questionId',
    validateMongoId('quizId'),
    validateMongoId('questionId'),
    validateBody(updateQuestionSchema),
    quizController.updateQuestion
);

router.delete(
    '/:quizId/questions/:questionId',
    validateMongoId('quizId'),
    validateMongoId('questionId'),
    quizController.deleteQuestion
);

// AI question generation
router.post(
    '/:quizId/generate-questions',
    validateMongoId('quizId'),
    validateBody(generateQuestionsSchema),
    quizController.generateQuestions
);

// Quiz submission routes
router.post(
    '/:quizId/submit-approval',
    validateMongoId('quizId'),
    quizController.submitForApproval
);

// Quiz attempt routes
router.post(
    '/:quizId/start',
    quizAttemptLimit,
    validateMongoId('quizId'),
    quizController.startAttempt
);

router.post(
    '/attempts/:attemptId/violation',
    validateMongoId('attemptId'),
    validateBody(violationSchema),
    quizController.recordViolation
);

router.post(
    '/attempts/:attemptId/submit',
    validateMongoId('attemptId'),
    validateBody(submitAnswersSchema),
    quizController.submitAttempt
);

// User attempt history and analysis
router.get(
    '/attempts/my-attempts',
    validateQuery(quizFilterSchema),
    quizController.getUserAttempts
);

router.get(
    '/attempts/:attemptId/analysis',
    validateMongoId('attemptId'),
    quizController.getAttemptAnalysis
);

module.exports = router;

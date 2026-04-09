const Joi = require('joi');

// Valid categories for quizzes
const validCategories = [
    'programming',
    'technology',
    'science',
    'history',
    'geography',
    'sports',
    'entertainment',
    'literature',
    'mathematics',
    'general-knowledge',
    'business',
    'language',
    'other',
];

// Valid difficulty levels
const validDifficulties = ['easy', 'medium', 'hard'];

// Valid violation types
const validViolationTypes = [
    'tab_switch',
    'copy_paste',
    'right_click',
    'devtools',
    'fullscreen_exit',
    'focus_loss',
    'suspicious_time',
];

// Quiz creation schema
exports.createQuizSchema = Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(1000).optional().allow(''),
    topic: Joi.string().min(1).max(100).required(),
    category: Joi.string()
        .valid(...validCategories)
        .required(),
    difficultyLevel: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    difficulty: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    timeLimit: Joi.number().integer().min(1).max(7200).required(),
    duration: Joi.number().integer().min(1).max(7200).optional(),
    price: Joi.when('isPaid', {
        is: true,
        then: Joi.number().min(5).max(10000).required(),
        otherwise: Joi.number().min(0).max(10000).optional(),
    }),
    isPaid: Joi.boolean().optional(),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().min(Joi.ref('startTime')).required(),

    numQuestions: Joi.number().integer().min(1).max(100).optional(),
    generateWithAI: Joi.boolean().optional(),
    questions: Joi.array()
        .items(
            Joi.object({
                question: Joi.string().required(),
                options: Joi.array()
                    .items(Joi.string())
                    .min(2)
                    .max(6)
                    .required(),
                correctAnswer: Joi.number().integer().min(0).required(),
                explanation: Joi.string().optional().allow(''),
                type: Joi.string()
                    .valid('multiple-choice', 'true-false', 'mcq')
                    .optional(),
                difficulty: Joi.string()
                    .valid(...validDifficulties)
                    .optional(),
                points: Joi.number().min(1).optional(),
                timeLimit: Joi.number().integer().min(5).max(3600).optional(),
            }),
        )
        .optional(),
    settings: Joi.object({
        shuffleQuestions: Joi.boolean().optional(),
    }).optional(),
    tags: Joi.array().items(Joi.string().min(1).max(20)).optional(),
    visibility: Joi.string().valid('public', 'private', 'unlisted').optional(),
});

// Quiz update schema
exports.updateQuizSchema = Joi.object({
    title: Joi.string().min(3).max(100).optional(),
    description: Joi.string().max(500).optional(),
    category: Joi.string()
        .valid(...validCategories)
        .optional(),
    difficultyLevel: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    timeLimit: Joi.number().integer().min(60).max(7200).optional(),
    price: Joi.number().min(0).max(100).optional(),
    isPaid: Joi.boolean().optional(),
    startTime: Joi.date().iso().optional(),
    endTime: Joi.date().iso().optional(),
    settings: Joi.object({
        shuffleQuestions: Joi.boolean().optional(),
    }).optional(),
    tags: Joi.array().items(Joi.string().min(1).max(20)).optional(),
});

// AI question generation schema
exports.generateQuestionsSchema = Joi.object({
    topic: Joi.string().max(100).required(),
    numQuestions: Joi.number().integer().min(1).max(50).optional(),
    count: Joi.number().integer().min(1).max(50).optional(),
    difficulty: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    difficultyLevel: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    category: Joi.string()
        .valid(...validCategories)
        .optional(),
    questionType: Joi.string().valid('mcq', 'true-false', 'mixed').optional(),
});

// Answer submission schema (batch — existing)
exports.submitAnswersSchema = Joi.object({
    answers: Joi.array()
        .items(
            Joi.object({
                questionId: Joi.string()
                    .pattern(/^[0-9a-fA-F]{24}$/)
                    .required(),
                selectedOption: Joi.number().integer().min(0).max(3).required(),
            }),
        )
        .min(0) // Allow empty — one-by-one flow stores answers server-side
        .required(),
    timeSpent: Joi.number().integer().min(0).optional(),
    tabSwitches: Joi.number().integer().min(0).optional(),
});

// Single answer submission schema (one-by-one flow)
exports.singleAnswerSchema = Joi.object({
    questionId: Joi.string()
        .pattern(/^[0-9a-fA-F]{24}$/)
        .required(),
    selectedOption: Joi.number().integer().min(0).max(5).allow(null).required(),
    timeSpent: Joi.number().integer().min(0).optional(),
});

// Question addition schema
exports.addQuestionSchema = Joi.object({
    text: Joi.string().min(10).max(500).required(),
    options: Joi.array()
        .items(Joi.string().max(200).required())
        .min(2)
        .max(4)
        .required(),
    correctAnswer: Joi.number().integer().min(0).max(3).required(),
    explanation: Joi.string().max(300).optional(),
    difficultyLevel: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    tags: Joi.array().items(Joi.string().min(1).max(20)).optional(),
});

// Question update schema
exports.updateQuestionSchema = Joi.object({
    text: Joi.string().min(10).max(500).optional(),
    options: Joi.array()
        .items(Joi.string().max(200).required())
        .min(2)
        .max(4)
        .optional(),
    correctAnswer: Joi.number().integer().min(0).max(3).optional(),
    explanation: Joi.string().max(300).optional(),
    difficultyLevel: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    tags: Joi.array().items(Joi.string().min(1).max(20)).optional(),
});

// Anti-cheat violation schema
exports.violationSchema = Joi.object({
    type: Joi.string()
        .valid(...validViolationTypes)
        .required(),
    details: Joi.string().max(200).optional(),
    timestamp: Joi.date().iso().optional(),
});

exports.quizFilterSchema = Joi.object({
    category: Joi.string()
        .valid(...validCategories)
        .optional(),
    difficulty: Joi.string()
        .valid(...validDifficulties)
        .optional(),
    isPaid: Joi.boolean().optional(),
    search: Joi.string().max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
});

// Wallet transaction filter schema
exports.transactionFilterSchema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    type: Joi.string()
        .valid(
            'payment',
            'earning',
            'refund',
            'withdrawal',
            'bonus',
            'penalty',
            'all',
        )
        .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
});

// Earnings query schema
exports.earningsQuerySchema = Joi.object({
    period: Joi.number().integer().min(1).max(365).default(30),
});

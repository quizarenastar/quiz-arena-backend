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
    price: Joi.number().min(0).max(10000).optional(),
    isPaid: Joi.boolean().optional(),
    startTime: Joi.alternatives()
        .try(Joi.date().iso(), Joi.string().allow('', null))
        .optional(),
    endTime: Joi.alternatives()
        .try(
            Joi.date().iso().min(Joi.ref('startTime')),
            Joi.string().allow('', null)
        )
        .optional(),
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
            })
        )
        .optional(),
    settings: Joi.object({
        allowReview: Joi.boolean().optional(),
        showResults: Joi.boolean().optional(),
        shuffleQuestions: Joi.boolean().optional(),
        shuffleOptions: Joi.boolean().optional(),
        allowSkipQuestions: Joi.boolean().optional(),
        showCorrectAnswers: Joi.boolean().optional(),
        antiCheat: Joi.object({
            enabled: Joi.boolean().optional(),
            detectTabSwitch: Joi.boolean().optional(),
            enableTabSwitchDetection: Joi.boolean().optional(),
            maxTabSwitches: Joi.number().integer().min(0).max(10).optional(),
            detectCopyPaste: Joi.boolean().optional(),
            preventCopyPaste: Joi.boolean().optional(),
            preventRightClick: Joi.boolean().optional(),
            enableTimeLimit: Joi.boolean().optional(),
            timeLimit: Joi.boolean().optional(),
            autoSubmitOnViolation: Joi.boolean().optional(),
            enableFullScreen: Joi.boolean().optional(),
            randomizeQuestions: Joi.boolean().optional(),
        }).optional(),
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
    settings: Joi.object({
        maxAttempts: Joi.number().integer().min(1).max(10).optional(),
        showCorrectAnswers: Joi.boolean().optional(),
        randomizeQuestions: Joi.boolean().optional(),
        enableAntiCheat: Joi.boolean().optional(),
        requireFullscreen: Joi.boolean().optional(),
        enableProctoringMode: Joi.boolean().optional(),
        tabSwitchLimit: Joi.number().integer().min(0).max(10).optional(),
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

// Answer submission schema
exports.submitAnswersSchema = Joi.object({
    answers: Joi.array()
        .items(
            Joi.object({
                questionId: Joi.string()
                    .pattern(/^[0-9a-fA-F]{24}$/)
                    .required(),
                selectedOption: Joi.number().integer().min(0).max(3).required(),
            })
        )
        .min(1)
        .required(),
    timeSpent: Joi.number().integer().min(0).optional(),
    tabSwitches: Joi.number().integer().min(0).optional(),
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
            'all'
        )
        .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
});

// Earnings query schema
exports.earningsQuerySchema = Joi.object({
    period: Joi.number().integer().min(1).max(365).default(30),
});

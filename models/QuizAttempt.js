const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema(
    {
        quizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        answers: [
            {
                questionId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Question',
                    required: true,
                },
                selectedAnswer: {
                    type: mongoose.Schema.Types.Mixed, // Can be number, string, or array
                },
                isCorrect: {
                    type: Boolean,
                    default: false,
                },
                timeSpent: {
                    type: Number,
                    default: 0, // in seconds
                },
                isSkipped: {
                    type: Boolean,
                    default: false,
                },
                confidence: {
                    type: Number,
                    min: 1,
                    max: 5, // User confidence level
                },
            },
        ],
        score: {
            type: Number,
            default: 0,
        },
        totalQuestions: {
            type: Number,
            required: true,
        },
        correctAnswers: {
            type: Number,
            default: 0,
        },
        skippedAnswers: {
            type: Number,
            default: 0,
        },
        percentage: {
            type: Number,
            default: 0,
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endTime: {
            type: Date,
        },
        duration: {
            type: Number,
            default: 0, // actual time taken in seconds
        },
        status: {
            type: String,
            enum: [
                'in-progress',
                'completed',
                'auto-submitted',
                'abandoned',
                'flagged',
            ],
            default: 'in-progress',
        },
        antiCheatViolations: [
            {
                type: {
                    type: String,
                    enum: [
                        'tab-switch',
                        'copy-paste',
                        'right-click',
                        'dev-tools',
                        'fullscreen-exit',
                        'suspicious-timing',
                        'multiple-attempts',
                    ],
                    required: true,
                },
                timestamp: {
                    type: Date,
                    default: Date.now,
                },
                details: {
                    type: String,
                },
                severity: {
                    type: String,
                    enum: ['low', 'medium', 'high', 'critical'],
                    default: 'medium',
                },
            },
        ],
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction',
        },
        sessionData: {
            ipAddress: {
                type: String,
                required: true,
            },
            userAgent: {
                type: String,
                required: true,
            },
            browserFingerprint: {
                type: String,
            },
            screenResolution: {
                type: String,
            },
            timezone: {
                type: String,
            },
        },
        analytics: {
            averageTimePerQuestion: {
                type: Number,
                default: 0,
            },
            questionsRevisited: {
                type: Number,
                default: 0,
            },
            totalKeystrokes: {
                type: Number,
                default: 0,
            },
            totalMouseClicks: {
                type: Number,
                default: 0,
            },
            focusLostCount: {
                type: Number,
                default: 0,
            },
        },
        aiAnalysis: {
            performanceInsights: {
                type: String,
            },
            strengthAreas: [
                {
                    topic: String,
                    score: Number,
                },
            ],
            weaknessAreas: [
                {
                    topic: String,
                    score: Number,
                    suggestions: [String],
                },
            ],
            overallRating: {
                type: String,
                enum: ['excellent', 'good', 'average', 'needs-improvement'],
            },
            timeManagement: {
                rating: {
                    type: String,
                    enum: ['excellent', 'good', 'average', 'poor'],
                },
                feedback: String,
            },
            recommendedStudyPlan: [
                {
                    topic: String,
                    priority: {
                        type: String,
                        enum: ['high', 'medium', 'low'],
                    },
                    studyTime: Number, // minutes
                    resources: [String],
                },
            ],
            confidenceAnalysis: {
                overconfident: Boolean,
                underconfident: Boolean,
                wellCalibrated: Boolean,
                feedback: String,
            },
        },
        review: {
            isReviewed: {
                type: Boolean,
                default: false,
            },
            reviewedAt: {
                type: Date,
            },
            flaggedQuestions: [
                {
                    questionId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Question',
                    },
                    reason: String,
                },
            ],
        },
        retakeData: {
            isRetake: {
                type: Boolean,
                default: false,
            },
            previousAttemptId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'QuizAttempt',
            },
            retakeNumber: {
                type: Number,
                default: 1,
            },
        },
    },
    { timestamps: true }
);

// Compound indexes for efficient queries
quizAttemptSchema.index({ quizId: 1, userId: 1 });
quizAttemptSchema.index({ userId: 1, createdAt: -1 });
quizAttemptSchema.index({ status: 1, createdAt: -1 });
quizAttemptSchema.index({ 'sessionData.ipAddress': 1 });

// Virtual for calculating accuracy
quizAttemptSchema.virtual('accuracy').get(function () {
    return this.totalQuestions > 0
        ? (this.correctAnswers / this.totalQuestions) * 100
        : 0;
});

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

module.exports = QuizAttempt;

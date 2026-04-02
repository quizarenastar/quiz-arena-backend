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
        // Server-side question order tracking for one-by-one serving
        questionOrder: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Question',
            },
        ],
        currentQuestionIndex: {
            type: Number,
            default: 0,
        },
        answers: [
            {
                questionId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Question',
                    required: true,
                },
                selectedAnswer: {
                    type: mongoose.Schema.Types.Mixed,
                },
                isCorrect: {
                    type: Boolean,
                    default: false,
                },
                timeSpent: {
                    type: Number,
                    default: 0,
                },
                isSkipped: {
                    type: Boolean,
                    default: false,
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
            default: 0,
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
        },
    },
    { timestamps: true }
);

// Compound indexes for efficient queries
quizAttemptSchema.index({ quizId: 1, userId: 1 });
quizAttemptSchema.index({ userId: 1, createdAt: -1 });
quizAttemptSchema.index({ status: 1, createdAt: -1 });

// Virtual for calculating accuracy
quizAttemptSchema.virtual('accuracy').get(function () {
    return this.totalQuestions > 0
        ? (this.correctAnswers / this.totalQuestions) * 100
        : 0;
});

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);

module.exports = QuizAttempt;

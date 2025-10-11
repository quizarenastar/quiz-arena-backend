const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            required: true,
            maxlength: 1000,
        },
        topic: {
            type: String,
            required: true,
            trim: true,
        },
        creatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'rejected', 'cancelled'],
            default: 'draft',
        },
        isPaid: {
            type: Boolean,
            default: false,
        },
        price: {
            type: Number,
            default: 0,
            min: 0,
        },
        startTime: {
            type: Date,
            // Required for paid quizzes
        },
        endTime: {
            type: Date,
            // Required for paid quizzes
        },
        duration: {
            type: Number,
            required: true,
            min: 1, // minutes
        },
        totalQuestions: {
            type: Number,
            required: true,
            min: 1,
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium',
        },
        isAIGenerated: {
            type: Boolean,
            default: false,
        },
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        thumbnailUrl: {
            type: String,
        },
        publishedAt: {
            type: Date,
        },
        rejectionReason: {
            type: String,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DashboardUser',
        },
        settings: {
            allowReview: {
                type: Boolean,
                default: true,
            },
            showResults: {
                type: Boolean,
                default: true,
            },
            shuffleQuestions: {
                type: Boolean,
                default: false,
            },
            allowSkipQuestions: {
                type: Boolean,
                default: true,
            },
            antiCheat: {
                enableTabSwitchDetection: {
                    type: Boolean,
                    default: true,
                },
                maxTabSwitches: {
                    type: Number,
                    default: 3,
                },
                enableTimeLimit: {
                    type: Boolean,
                    default: true,
                },
                autoSubmitOnViolation: {
                    type: Boolean,
                    default: true,
                },
                preventCopyPaste: {
                    type: Boolean,
                    default: true,
                },
                preventRightClick: {
                    type: Boolean,
                    default: true,
                },
                enableFullScreen: {
                    type: Boolean,
                    default: false,
                },
            },
        },
        analytics: {
            totalAttempts: {
                type: Number,
                default: 0,
            },
            averageScore: {
                type: Number,
                default: 0,
            },
            revenue: {
                type: Number,
                default: 0,
            },
            completionRate: {
                type: Number,
                default: 0,
            },
            avgTimeSpent: {
                type: Number,
                default: 0,
            },
        },
        category: {
            type: String,
            default: 'other',
        },
        visibility: {
            type: String,
            enum: ['public', 'private', 'unlisted'],
            default: 'public',
        },
        cancelledAt: {
            type: Date,
        },
        cancelledBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DashboardUser',
        },
        cancellationReason: {
            type: String,
        },
    },
    { timestamps: true }
);

// Virtual to check if quiz is active based on timing
quizSchema.virtual('isActive').get(function () {
    if (this.status !== 'approved') return false;
    if (!this.isPaid) return true;

    const now = new Date();
    if (this.startTime && now < this.startTime) return false;
    if (this.endTime && now > this.endTime) return false;

    return true;
});

// Virtual to check if quiz can be attempted
quizSchema.virtual('canAttempt').get(function () {
    if (this.status === 'cancelled') return false;
    return this.isActive;
});

// Set virtuals to be included in JSON
quizSchema.set('toJSON', { virtuals: true });
quizSchema.set('toObject', { virtuals: true });

// Indexes for performance
quizSchema.index({ creatorId: 1, status: 1 });
quizSchema.index({ status: 1, createdAt: -1 });
quizSchema.index({ topic: 1, difficulty: 1 });
quizSchema.index({ isPaid: 1, price: 1 });
quizSchema.index({ category: 1, visibility: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);

module.exports = Quiz;

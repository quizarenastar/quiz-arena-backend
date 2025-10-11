const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
    {
        quizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
            required: true,
        },
        question: {
            type: String,
            required: true,
            trim: true,
        },
        type: {
            type: String,
            enum: [
                'multiple-choice',
                'true-false',
                'fill-blank',
                'essay',
                'mcq',
            ],
            default: 'multiple-choice',
        },
        options: [
            {
                type: String,
                required: function () {
                    return this.type === 'multiple-choice';
                },
            },
        ],
        correctAnswer: {
            type: mongoose.Schema.Types.Mixed, // Number for MCQ, String for others
            required: true,
        },
        explanation: {
            type: String,
            trim: true,
        },
        points: {
            type: Number,
            default: 1,
            min: 1,
        },
        timeLimit: {
            type: Number,
            default: 30, // seconds per question
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium',
        },
        topic: {
            type: String,
            trim: true,
        },
        isAIGenerated: {
            type: Boolean,
            default: false,
        },
        aiPrompt: {
            type: String, // Store the prompt used for AI generation
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        order: {
            type: Number,
            default: 0,
        },
        media: {
            type: {
                type: String,
                enum: ['image', 'video', 'audio'],
            },
            url: {
                type: String,
            },
            description: {
                type: String,
            },
        },
        analytics: {
            totalAttempts: {
                type: Number,
                default: 0,
            },
            correctAttempts: {
                type: Number,
                default: 0,
            },
            averageTimeSpent: {
                type: Number,
                default: 0,
            },
            difficultyRating: {
                type: Number,
                default: 0,
                min: 0,
                max: 5,
            },
        },
        tags: [
            {
                type: String,
                trim: true,
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Indexes for performance
questionSchema.index({ quizId: 1, order: 1 });
questionSchema.index({ createdBy: 1 });
questionSchema.index({ topic: 1, difficulty: 1 });
questionSchema.index({ isAIGenerated: 1 });

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;

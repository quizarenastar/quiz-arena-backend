const mongoose = require('mongoose');

const warRoomAttemptSchema = new mongoose.Schema(
    {
        warRoomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarRoom',
            required: true,
        },
        warRoomQuizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarRoomQuiz',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        answers: [
            {
                questionIndex: {
                    type: Number,
                    required: true,
                },
                selectedAnswer: {
                    type: Number,
                    default: -1, // -1 means unanswered
                },
                isCorrect: {
                    type: Boolean,
                    default: false,
                },
                timeSpent: {
                    type: Number, // milliseconds
                    default: 0,
                },
            },
        ],
        score: {
            type: Number,
            default: 0,
        },
        correctAnswers: {
            type: Number,
            default: 0,
        },
        totalQuestions: {
            type: Number,
            required: true,
        },
        percentage: {
            type: Number,
            default: 0,
        },
        totalTime: {
            type: Number, // milliseconds
            default: 0,
        },
        status: {
            type: String,
            enum: ['in-progress', 'completed', 'auto-submitted'],
            default: 'in-progress',
        },
        startedAt: {
            type: Date,
            default: Date.now,
        },
        completedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Indexes
warRoomAttemptSchema.index({ warRoomQuizId: 1, userId: 1 }, { unique: true });
warRoomAttemptSchema.index({ warRoomId: 1, userId: 1 });
warRoomAttemptSchema.index({ userId: 1, createdAt: -1 });

const WarRoomAttempt = mongoose.model('WarRoomAttempt', warRoomAttemptSchema);

module.exports = WarRoomAttempt;

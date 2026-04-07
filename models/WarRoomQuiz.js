const mongoose = require('mongoose');

const warRoomQuizSchema = new mongoose.Schema(
    {
        warRoomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarRoom',
            required: true,
        },
        roundNumber: {
            type: Number,
            required: true,
        },
        topic: {
            type: String,
            required: true,
            trim: true,
        },
        difficulty: {
            type: String,
            enum: ['easy', 'medium', 'hard'],
            default: 'medium',
        },
        category: {
            type: String,
            default: 'general-knowledge',
        },
        questions: [
            {
                question: {
                    type: String,
                    required: true,
                },
                type: {
                    type: String,
                    enum: ['multiple-choice'],
                    default: 'multiple-choice',
                },
                options: [
                    {
                        type: String,
                        required: true,
                    },
                ],
                correctAnswer: {
                    type: Number,
                    required: true,
                },
                explanation: {
                    type: String,
                    default: '',
                },
                points: {
                    type: Number,
                    default: 1,
                },
                timeLimit: {
                    type: Number,
                    default: 30,
                },
            },
        ],
        totalQuestions: {
            type: Number,
            required: true,
        },
        duration: {
            type: Number, // Total quiz duration in seconds
            required: true,
        },
        startedAt: {
            type: Date,
        },
        endedAt: {
            type: Date,
        },
        status: {
            type: String,
            enum: ['generating', 'ready', 'in-progress', 'completed'],
            default: 'generating',
        },
        results: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                username: String,
                profilePicture: String,
                score: {
                    type: Number,
                    default: 0,
                },
                correctAnswers: {
                    type: Number,
                    default: 0,
                },
                totalTime: {
                    type: Number,
                    default: 0,
                },
                rank: Number,
            },
        ],
        winnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    { timestamps: true }
);

// Indexes
warRoomQuizSchema.index({ warRoomId: 1, roundNumber: -1 });
warRoomQuizSchema.index({ warRoomId: 1, status: 1 });

const WarRoomQuiz = mongoose.model('WarRoomQuiz', warRoomQuizSchema);

module.exports = WarRoomQuiz;

const mongoose = require('mongoose');

const warRoomSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
        },
        description: {
            type: String,
            trim: true,
            maxlength: 300,
            default: '',
        },
        roomCode: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            minlength: 6,
            maxlength: 6,
        },
        visibility: {
            type: String,
            enum: ['public', 'private'],
            default: 'public',
        },
        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: ['waiting', 'countdown', 'in-progress', 'finished', 'closed'],
            default: 'waiting',
        },
        maxPlayers: {
            type: Number,
            min: 2,
            max: 10,
            default: 10,
        },
        members: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                username: {
                    type: String,
                    required: true,
                },
                profilePicture: {
                    type: String,
                    default: '',
                },
                role: {
                    type: String,
                    enum: ['host', 'player'],
                    default: 'player',
                },
                joinedAt: {
                    type: Date,
                    default: Date.now,
                },
                isOnline: {
                    type: Boolean,
                    default: true,
                },
                isReady: {
                    type: Boolean,
                    default: false,
                },
            },
        ],
        settings: {
            topic: {
                type: String,
                trim: true,
                default: '',
            },
            difficulty: {
                type: String,
                enum: ['easy', 'medium', 'hard'],
                default: 'medium',
            },
            totalQuestions: {
                type: Number,
                min: 5,
                max: 30,
                default: 10,
            },
            timePerQuestion: {
                type: Number,
                min: 10,
                max: 120,
                default: 30,
            },
            category: {
                type: String,
                default: 'general-knowledge',
            },
            countdownSeconds: {
                type: Number,
                min: 5,
                max: 30,
                default: 10,
            },
        },
        currentQuizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarRoomQuiz',
        },
        roundNumber: {
            type: Number,
            default: 0,
        },
        analytics: {
            totalQuizzesPlayed: {
                type: Number,
                default: 0,
            },
            totalMessagesCount: {
                type: Number,
                default: 0,
            },
        },
        // Track last activity for auto-expiry
        lastActivityAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

// Indexes
warRoomSchema.index({ hostId: 1, status: 1 });
warRoomSchema.index({ visibility: 1, status: 1 });
warRoomSchema.index({ 'members.userId': 1 });
warRoomSchema.index({ status: 1, createdAt: -1 });
// Auto-delete closed rooms after 24 hours
warRoomSchema.index(
    { lastActivityAt: 1 },
    {
        expireAfterSeconds: 7200, // 2 hours idle → auto-close
        partialFilterExpression: { status: 'closed' },
    }
);

// Virtual for player count
warRoomSchema.virtual('playerCount').get(function () {
    return this.members ? this.members.length : 0;
});

// Virtual to check if room is full
warRoomSchema.virtual('isFull').get(function () {
    return this.members && this.members.length >= this.maxPlayers;
});

warRoomSchema.set('toJSON', { virtuals: true });
warRoomSchema.set('toObject', { virtuals: true });

const WarRoom = mongoose.model('WarRoom', warRoomSchema);

module.exports = WarRoom;

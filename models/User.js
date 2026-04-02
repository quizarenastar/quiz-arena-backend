const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        profilePicture: {
            type: String,
            default: '',
        },
        phone: {
            type: String,
            match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number'],
        },
        blocked: {
            type: Boolean,
            default: false,
        },
        wallet: {
            balance: {
                type: Number,
                default: 20,
                min: 0,
            },
            totalEarned: {
                type: Number,
                default: 0,
            },
            totalSpent: {
                type: Number,
                default: 0,
            },
        },
        analytics: {
            quizzesCreated: {
                type: Number,
                default: 0,
            },
            quizzesAttempted: {
                type: Number,
                default: 0,
            },
            totalEarnings: {
                type: Number,
                default: 0,
            },
            averageScore: {
                type: Number,
                default: 0,
            },
            totalTimeSpent: {
                type: Number,
                default: 0,
            },
        },
    },
    { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;

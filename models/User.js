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

        totalEarn: {
            type: Number,
            default: 20,
        },
        totalRedeem: {
            type: Number,
            default: 20,
        },
        currentBalance: {
            type: Number,
            default: 20,
        },
        blocked: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const User = mongoose.model('User', userSchema);

module.exports = User;

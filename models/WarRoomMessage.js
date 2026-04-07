const mongoose = require('mongoose');

const warRoomMessageSchema = new mongoose.Schema(
    {
        warRoomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WarRoom',
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        username: {
            type: String,
            required: true,
        },
        profilePicture: {
            type: String,
            default: '',
        },
        message: {
            type: String,
            required: true,
            maxlength: 500,
        },
        type: {
            type: String,
            enum: ['chat', 'system', 'reaction'],
            default: 'chat',
        },
    },
    { timestamps: true }
);

// Indexes
warRoomMessageSchema.index({ warRoomId: 1, createdAt: -1 });

const WarRoomMessage = mongoose.model('WarRoomMessage', warRoomMessageSchema);

module.exports = WarRoomMessage;

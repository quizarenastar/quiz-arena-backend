const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
    {
        to: {
            type: String,
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['otp', 'quiz_registration', 'quiz_started', 'quiz_cancelled', 'other'],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['sent', 'failed'],
            default: 'sent',
            index: true,
        },
        error: {
            type: String,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

// Index for dashboard queries
emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ type: 1, createdAt: -1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);

module.exports = EmailLog;

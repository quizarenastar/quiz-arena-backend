const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        type: {
            type: String,
            enum: [
                'payment',
                'earning',
                'refund',
                'withdrawal',
                'bonus',
                'penalty',
            ],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        description: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'cancelled', 'processing'],
            default: 'pending',
        },
        relatedQuizId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
        },
        relatedAttemptId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'QuizAttempt',
        },
        paymentMethod: {
            type: String,
            enum: ['wallet', 'bank-transfer', 'crypto', 'card', 'upi'],
            required: true,
        },
        paymentGateway: {
            transactionId: {
                type: String,
            },
            paymentIntentId: {
                type: String,
            },
            gatewayResponse: {
                type: mongoose.Schema.Types.Mixed,
            },
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        },
        balanceBefore: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        fees: {
            platformFee: {
                type: Number,
                default: 0,
            },
            processingFee: {
                type: Number,
                default: 0,
            },
            totalFees: {
                type: Number,
                default: 0,
            },
        },
        recipient: {
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            type: {
                type: String,
                enum: ['user', 'platform', 'external'],
                default: 'platform',
            },
        },
        refund: {
            isRefunded: {
                type: Boolean,
                default: false,
            },
            refundAmount: {
                type: Number,
                default: 0,
            },
            refundReason: {
                type: String,
            },
            refundedAt: {
                type: Date,
            },
            refundTransactionId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Transaction',
            },
        },
        verification: {
            isVerified: {
                type: Boolean,
                default: false,
            },
            verifiedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
            verifiedAt: {
                type: Date,
            },
            notes: {
                type: String,
            },
        },
        tax: {
            taxAmount: {
                type: Number,
                default: 0,
            },
            taxRate: {
                type: Number,
                default: 0,
            },
            taxRegion: {
                type: String,
            },
        },
    },
    { timestamps: true }
);

// Indexes for performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ relatedQuizId: 1 });
transactionSchema.index({ 'paymentGateway.transactionId': 1 });
transactionSchema.index({ status: 1, type: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;

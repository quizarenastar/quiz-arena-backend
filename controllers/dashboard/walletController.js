const User = require('../../models/User');
const Transaction = require('../../models/Transaction');

class WalletController {
    // Get all transactions with filters
    async getTransactions(req, res) {
        try {
            const { page = 1, limit = 50, status, type, search } = req.query;

            // Build filter query
            const filter = {};

            if (status && status !== 'all') {
                filter.status = status;
            }

            if (type) {
                filter.type = type;
            }

            // Search by user
            if (search) {
                const users = await User.find({
                    $or: [
                        { username: { $regex: search, $options: 'i' } },
                        { email: { $regex: search, $options: 'i' } },
                    ],
                }).select('_id');

                const userIds = users.map((user) => user._id);
                filter.userId = { $in: userIds };
            }

            const skip = (page - 1) * limit;

            const [transactions, total] = await Promise.all([
                Transaction.find(filter)
                    .populate('userId', 'username email')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit))
                    .lean(),
                Transaction.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: {
                    transactions,
                    pagination: {
                        total,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        pages: Math.ceil(total / limit),
                    },
                },
            });
        } catch (error) {
            console.error('Get transactions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch transactions',
            });
        }
    }

    // Approve fund addition (admin only)
    async approveFundAddition(req, res) {
        try {
            const { transactionId } = req.params;
            const adminId = req.user.id;

            const transaction = await Transaction.findById(
                transactionId
            ).populate('userId');

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            if (
                transaction.type !== 'payment' ||
                !transaction.metadata?.walletAddition
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid transaction type',
                });
            }

            if (transaction.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction is not pending',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Add funds to user wallet
                    await User.findByIdAndUpdate(
                        transaction.userId._id,
                        {
                            $inc: { 'wallet.balance': transaction.amount },
                        },
                        { session }
                    );

                    // Update transaction status
                    transaction.status = 'completed';
                    transaction.balanceAfter =
                        transaction.balanceBefore + transaction.amount;
                    transaction.verification = {
                        isVerified: true,
                        verifiedBy: adminId,
                        verifiedAt: new Date(),
                    };
                    await transaction.save({ session });
                });

                res.json({
                    success: true,
                    message: 'Fund addition approved successfully',
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            console.error('Approve fund addition error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to approve fund addition',
            });
        }
    }

    // Reject fund addition (admin only)
    async rejectFundAddition(req, res) {
        try {
            const { transactionId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.id;

            if (!reason || reason.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason must be at least 10 characters',
                });
            }

            const transaction = await Transaction.findById(transactionId);

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            if (
                transaction.type !== 'payment' ||
                !transaction.metadata?.walletAddition
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid transaction type',
                });
            }

            if (transaction.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction is not pending',
                });
            }

            // Update transaction status
            transaction.status = 'failed';
            transaction.reasonForRejection = reason;
            transaction.verification = {
                isVerified: false,
                verifiedBy: adminId,
                verifiedAt: new Date(),
                notes: 'Fund addition rejected by admin',
            };
            await transaction.save();

            res.json({
                success: true,
                message: 'Fund addition rejected',
            });
        } catch (error) {
            console.error('Reject fund addition error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reject fund addition',
            });
        }
    }

    // Approve withdrawal (admin only)
    async approveWithdrawal(req, res) {
        try {
            const { transactionId } = req.params;
            const adminId = req.user.id;

            const transaction = await Transaction.findById(transactionId);

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            if (transaction.type !== 'withdrawal') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid transaction type',
                });
            }

            if (transaction.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction is not pending',
                });
            }

            // Mark as completed (amount already deducted)
            transaction.status = 'completed';
            transaction.metadata.paidAt = new Date();
            transaction.verification = {
                isVerified: true,
                verifiedBy: adminId,
                verifiedAt: new Date(),
                notes: 'Withdrawal approved and marked as paid',
            };
            await transaction.save();

            res.json({
                success: true,
                message: 'Withdrawal approved and marked as paid',
            });
        } catch (error) {
            console.error('Approve withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to approve withdrawal',
            });
        }
    }

    // Reject withdrawal (admin only)
    async rejectWithdrawal(req, res) {
        try {
            const { transactionId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.id;

            if (!reason || reason.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason must be at least 10 characters',
                });
            }

            const transaction = await Transaction.findById(
                transactionId
            ).populate('userId');

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            if (transaction.type !== 'withdrawal') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid transaction type',
                });
            }

            if (transaction.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction is not pending',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Get updated user balance
                    const user = await User.findById(
                        transaction.userId._id
                    ).session(session);

                    // Return amount to user wallet
                    const updatedBalance =
                        user.wallet.balance + transaction.amount;
                    await User.findByIdAndUpdate(
                        transaction.userId._id,
                        {
                            $inc: { 'wallet.balance': transaction.amount },
                        },
                        { session }
                    );

                    // Update transaction status
                    transaction.status = 'failed';
                    transaction.balanceAfter = updatedBalance;
                    transaction.reasonForRejection = reason;
                    transaction.verification = {
                        isVerified: false,
                        verifiedBy: adminId,
                        verifiedAt: new Date(),
                        notes: 'Withdrawal rejected by admin - amount refunded',
                    };
                    await transaction.save({ session });
                });

                res.json({
                    success: true,
                    message:
                        'Withdrawal rejected and amount returned to wallet',
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            console.error('Reject withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reject withdrawal',
            });
        }
    }

    // Process refund (admin only)
    async processRefund(req, res) {
        try {
            const { transactionId } = req.params;
            const { reason } = req.body;

            const transaction = await Transaction.findById(transactionId)
                .populate('userId')
                .populate('relatedQuizId');

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found',
                });
            }

            if (transaction.type !== 'payment') {
                return res.status(400).json({
                    success: false,
                    message: 'Only payments can be refunded',
                });
            }

            if (transaction.status !== 'completed') {
                return res.status(400).json({
                    success: false,
                    message: 'Only completed transactions can be refunded',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Refund to user wallet
                    await User.findByIdAndUpdate(
                        transaction.userId._id,
                        {
                            $inc: {
                                'wallet.balance': transaction.amount,
                                'wallet.totalSpent': -transaction.amount,
                            },
                        },
                        { session }
                    );

                    // Deduct from creator if applicable
                    if (transaction.relatedQuizId) {
                        const quiz = await require('../models/Quiz')
                            .findById(transaction.relatedQuizId)
                            .session(session);
                        if (quiz) {
                            const creatorEarning = transaction.amount * 0.7;
                            await User.findByIdAndUpdate(
                                quiz.creatorId,
                                {
                                    $inc: {
                                        'wallet.balance': -creatorEarning,
                                        'wallet.totalEarned': -creatorEarning,
                                        'analytics.totalEarnings':
                                            -creatorEarning,
                                    },
                                },
                                { session }
                            );
                        }
                    }

                    // Create refund transaction
                    const refundTransaction = new Transaction({
                        userId: transaction.userId._id,
                        type: 'refund',
                        amount: transaction.amount,
                        description: `Refund for: ${transaction.description}`,
                        status: 'completed',
                        relatedQuizId: transaction.relatedQuizId,
                        paymentMethod: transaction.paymentMethod,
                        metadata: {
                            originalTransactionId: transactionId,
                            refundReason: reason,
                            processedBy: req.userId,
                        },
                    });
                    await refundTransaction.save({ session });

                    // Update original transaction
                    transaction.status = 'refunded';
                    transaction.metadata = {
                        ...transaction.metadata,
                        refundedAt: new Date(),
                        refundTransactionId: refundTransaction._id,
                        refundReason: reason,
                    };
                    await transaction.save({ session });
                });

                res.json({
                    success: true,
                    message: 'Refund processed successfully',
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            console.error('Process refund error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process refund',
            });
        }
    }
}

module.exports = new WalletController();

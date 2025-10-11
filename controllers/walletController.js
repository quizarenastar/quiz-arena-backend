const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

class WalletController {
    // Get wallet balance and recent transactions
    async getWallet(req, res) {
        try {
            const userId = req.userId;

            const user = await User.findById(userId).select('wallet');
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Get recent transactions
            const recentTransactions = await Transaction.find({ userId })
                .populate('relatedQuizId', 'title')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            res.json({
                success: true,
                data: {
                    wallet: user.wallet,
                    recentTransactions,
                },
            });
        } catch (error) {
            console.error('Get wallet error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch wallet information',
            });
        }
    }

    // Add funds to wallet (simulate payment)
    async addFunds(req, res) {
        try {
            const userId = req.user;

            const { amount, paymentMethod = 'stripe' } = req.body;

            if (amount <= 0 || amount > 1000) {
                return res.status(400).json({
                    success: false,
                    message: 'Amount must be between 0.01 and 1000',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Update user wallet
                    const user = await User.findById(userId).session(session);
                    if (!user) {
                        throw new Error('User not found');
                    }

                    user.wallet.balance += amount;
                    await user.save({ session });

                    // Create transaction record
                    const transaction = new Transaction({
                        userId,
                        type: 'payment',
                        amount,
                        description: `Added funds to wallet via ${paymentMethod}`,
                        status: 'completed',
                        paymentMethod,
                        metadata: {
                            walletAddition: true,
                            previousBalance: user.wallet.balance - amount,
                        },
                    });
                    await transaction.save({ session });
                });

                res.json({
                    success: true,
                    message: 'Funds added successfully',
                    data: {
                        amount,
                        newBalance: (await User.findById(userId)).wallet
                            .balance,
                    },
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            console.error('Add funds error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add funds',
            });
        }
    }

    // Get transaction history
    async getTransactions(req, res) {
        try {
            const userId = req.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const { type, startDate, endDate } = req.query;

            // Build filter
            const filter = { userId };
            if (type && type !== 'all') filter.type = type;
            if (startDate && endDate) {
                filter.createdAt = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                };
            }

            const transactions = await Transaction.find(filter)
                .populate('relatedQuizId', 'title')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Transaction.countDocuments(filter);

            // Calculate summary
            const summary = await Transaction.aggregate([
                { $match: filter },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' },
                        count: { $sum: 1 },
                    },
                },
            ]);

            res.json({
                success: true,
                data: {
                    transactions,
                    summary,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
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

    // Request withdrawal (for creators)
    async requestWithdrawal(req, res) {
        try {
            const userId = req.userId;
            const {
                amount,
                withdrawalMethod = 'bank',
                accountDetails,
            } = req.body;

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Check minimum withdrawal amount
            if (amount < 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum withdrawal amount is $10',
                });
            }

            // Check if user has sufficient balance
            if (user.wallet.balance < amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient balance',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Deduct amount from wallet
                    user.wallet.balance -= amount;
                    await user.save({ session });

                    // Create withdrawal transaction
                    const transaction = new Transaction({
                        userId,
                        type: 'withdrawal',
                        amount,
                        description: `Withdrawal request via ${withdrawalMethod}`,
                        status: 'pending', // Admin will approve withdrawals
                        paymentMethod: withdrawalMethod,
                        metadata: {
                            accountDetails,
                            requestedAt: new Date(),
                        },
                    });
                    await transaction.save({ session });
                });

                res.json({
                    success: true,
                    message:
                        'Withdrawal request submitted. It will be processed within 3-5 business days.',
                    data: {
                        amount,
                        newBalance: user.wallet.balance,
                    },
                });
            } finally {
                await session.endSession();
            }
        } catch (error) {
            console.error('Request withdrawal error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process withdrawal request',
            });
        }
    }

    // Get earnings summary (for creators)
    async getEarningsSummary(req, res) {
        try {
            const userId = req.userId;
            const { period = '30' } = req.query; // days

            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - parseInt(period));

            // Get earnings in the period
            const earnings = await Transaction.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        type: 'earning',
                        status: 'completed',
                        createdAt: { $gte: daysAgo },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' },
                        },
                        dailyEarnings: { $sum: '$amount' },
                        transactionCount: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]);

            // Get quiz performance
            const quizEarnings = await Transaction.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        type: 'earning',
                        status: 'completed',
                        relatedQuizId: { $exists: true },
                    },
                },
                {
                    $group: {
                        _id: '$relatedQuizId',
                        totalEarnings: { $sum: '$amount' },
                        attemptCount: { $sum: 1 },
                    },
                },
                {
                    $lookup: {
                        from: 'quizzes',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'quiz',
                    },
                },
                {
                    $unwind: '$quiz',
                },
                {
                    $project: {
                        quizTitle: '$quiz.title',
                        totalEarnings: 1,
                        attemptCount: 1,
                    },
                },
                { $sort: { totalEarnings: -1 } },
                { $limit: 10 },
            ]);

            // Get total stats
            const totalStats = await Transaction.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                        type: 'earning',
                        status: 'completed',
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalEarnings: { $sum: '$amount' },
                        totalTransactions: { $sum: 1 },
                    },
                },
            ]);

            res.json({
                success: true,
                data: {
                    dailyEarnings: earnings,
                    topQuizzes: quizEarnings,
                    totalStats: totalStats[0] || {
                        totalEarnings: 0,
                        totalTransactions: 0,
                    },
                },
            });
        } catch (error) {
            console.error('Get earnings summary error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch earnings summary',
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

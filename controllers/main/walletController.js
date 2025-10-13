const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
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

    // Add funds to wallet (create pending request for admin approval)
    async addFunds(req, res) {
        try {
            const userId = req.userId;
            const { amount, paymentMethod = 'upi', transactionId } = req.body;

            if (amount < 10 || amount > 100000) {
                return res.status(400).json({
                    success: false,
                    message: 'Amount must be between ₹10 and ₹100,000',
                });
            }

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Create pending transaction record for admin approval
            const transaction = new Transaction({
                userId,
                type: 'payment',
                amount,
                description: `Fund addition request via ${paymentMethod}`,
                status: 'pending',
                paymentMethod,
                balanceBefore: user.wallet.balance,
                balanceAfter: user.wallet.balance, // Will be updated on approval
                metadata: {
                    walletAddition: true,
                    userTransactionId: transactionId || 'Not provided',
                    requestedAt: new Date(),
                },
            });
            await transaction.save();

            res.json({
                success: true,
                message:
                    'Fund addition request submitted successfully. It will be reviewed by admin.',
                data: {
                    transactionId: transaction._id,
                    amount,
                    status: 'pending',
                },
            });
        } catch (error) {
            console.error('Add funds error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit fund addition request',
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
                withdrawalMethod = 'upi',
                upiId,
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
            if (amount < 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum withdrawal amount is ₹100',
                });
            }

            // Check if user has sufficient balance
            if (user.wallet.balance < amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient balance',
                });
            }

            // Validate UPI ID if method is UPI
            if (withdrawalMethod === 'upi' && !upiId) {
                return res.status(400).json({
                    success: false,
                    message: 'UPI ID is required for UPI withdrawals',
                });
            }

            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    // Deduct amount from wallet immediately (will be reversed if rejected)
                    const previousBalance = user.wallet.balance;
                    user.wallet.balance -= amount;
                    await user.save({ session });

                    // Create withdrawal transaction
                    const transaction = new Transaction({
                        userId,
                        type: 'withdrawal',
                        amount,
                        description: `Withdrawal request via ${withdrawalMethod}${
                            upiId ? ` to ${upiId}` : ''
                        }`,
                        status: 'pending', // Admin will approve withdrawals
                        paymentMethod: withdrawalMethod,
                        balanceBefore: previousBalance,
                        balanceAfter: user.wallet.balance,
                        metadata: {
                            upiId: upiId || null,
                            accountDetails: accountDetails || null,
                            withdrawalMethod,
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
                        withdrawalMethod,
                        upiId: upiId || null,
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
}

module.exports = new WalletController();

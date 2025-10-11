const Quiz = require('../models/Quiz');
const User = require('../models/User');
const QuizAttempt = require('../models/QuizAttempt');
const Transaction = require('../models/Transaction');

class AdminController {
    // Get dashboard statistics
    async getDashboardStats(req, res) {
        try {
            const stats = await Promise.all([
                Quiz.countDocuments({ status: 'pending' }),
                Quiz.countDocuments({ status: 'approved' }),
                Quiz.countDocuments({ status: 'rejected' }),
                User.countDocuments({ role: 'user' }),
                User.countDocuments({ role: 'creator' }),
                QuizAttempt.countDocuments(),
                Transaction.aggregate([
                    { $match: { status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]),
            ]);

            const [
                pendingQuizzes,
                approvedQuizzes,
                rejectedQuizzes,
                totalUsers,
                totalCreators,
                totalAttempts,
                revenueResult,
            ] = stats;

            const totalRevenue = revenueResult[0]?.total || 0;

            // Get recent activity
            const recentQuizzes = await Quiz.find({ status: 'pending' })
                .populate('creatorId', 'username email')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean();

            const recentTransactions = await Transaction.find({
                status: 'completed',
            })
                .populate('userId', 'username email')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            // Get monthly stats
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const monthlyStats = await Promise.all([
                Quiz.countDocuments({
                    createdAt: { $gte: thirtyDaysAgo },
                    status: { $in: ['approved', 'pending'] },
                }),
                User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
                QuizAttempt.countDocuments({
                    createdAt: { $gte: thirtyDaysAgo },
                }),
                Transaction.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: thirtyDaysAgo },
                            status: 'completed',
                        },
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]),
            ]);

            const [
                monthlyQuizzes,
                monthlyUsers,
                monthlyAttempts,
                monthlyRevenueResult,
            ] = monthlyStats;
            const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

            res.json({
                success: true,
                data: {
                    overview: {
                        pendingQuizzes,
                        approvedQuizzes,
                        rejectedQuizzes,
                        totalUsers,
                        totalCreators,
                        totalAttempts,
                        totalRevenue,
                    },
                    monthly: {
                        quizzes: monthlyQuizzes,
                        users: monthlyUsers,
                        attempts: monthlyAttempts,
                        revenue: monthlyRevenue,
                    },
                    recent: {
                        quizzes: recentQuizzes,
                        transactions: recentTransactions,
                    },
                },
            });
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch dashboard statistics',
            });
        }
    }

    // Get pending quizzes for approval
    async getPendingQuizzes(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const quizzes = await Quiz.find({ status: 'pending' })
                .populate('creatorId', 'username email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Quiz.countDocuments({ status: 'pending' });

            // Get question counts and format for each quiz
            const Question = require('../models/Question');
            const quizzesWithDetails = await Promise.all(
                quizzes.map(async (quiz) => {
                    const questions = await Question.find({
                        quizId: quiz._id,
                    }).lean();
                    return {
                        ...quiz,
                        questions,
                        questionCount: questions.length,
                        creator: {
                            name: quiz.creatorId?.username || 'Unknown',
                            email: quiz.creatorId?.email || '',
                        },
                        timeLimit: quiz.duration || 30,
                        attemptCount: quiz.analytics?.totalAttempts || 0,
                    };
                })
            );

            res.json({
                success: true,
                data: {
                    quizzes: quizzesWithDetails,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        totalQuizzes: total,
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get pending quizzes error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch pending quizzes',
            });
        }
    }

    // Get all quizzes with filters
    async getAllQuizzes(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const { status, category, search } = req.query;

            // Build filter
            const filter = {};
            if (status && status !== 'all') {
                filter.status = status;
            }
            if (category) {
                filter.category = category;
            }
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { topic: { $regex: search, $options: 'i' } },
                ];
            }

            const quizzes = await Quiz.find(filter)
                .populate('creatorId', 'username email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Quiz.countDocuments(filter);

            // Get question counts for each quiz
            const Question = require('../models/Question');
            const quizzesWithDetails = await Promise.all(
                quizzes.map(async (quiz) => {
                    const questionCount = await Question.countDocuments({
                        quizId: quiz._id,
                    });
                    const questions = await Question.find({
                        quizId: quiz._id,
                    }).lean();
                    return {
                        ...quiz,
                        questions,
                        questionCount,
                        creator: {
                            name: quiz.creatorId?.username || 'Unknown',
                            email: quiz.creatorId?.email || '',
                        },
                        timeLimit: quiz.duration || 30,
                        attemptCount: quiz.analytics?.totalAttempts || 0,
                    };
                })
            );

            res.json({
                success: true,
                data: {
                    quizzes: quizzesWithDetails,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        totalQuizzes: total,
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get all quizzes error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch quizzes',
            });
        }
    }

    // Get quiz details for review
    async getQuizForReview(req, res) {
        try {
            const { quizId } = req.params;

            const quiz = await Quiz.findById(quizId)
                .populate('creatorId', 'username email analytics')
                .lean();

            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            // Get questions
            const questions = await require('../models/Question')
                .find({ quizId })
                .lean();

            // Get creator's other quizzes stats
            const creatorStats = await Quiz.aggregate([
                { $match: { creatorId: quiz.creatorId._id } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                    },
                },
            ]);

            // Format quiz data
            const formattedQuiz = {
                ...quiz,
                questions,
                creator: {
                    name: quiz.creatorId?.username || 'Unknown',
                    email: quiz.creatorId?.email || '',
                },
                timeLimit: quiz.duration || 30,
                attemptCount: quiz.analytics?.totalAttempts || 0,
            };

            res.json({
                success: true,
                data: {
                    quiz: formattedQuiz,
                    questions,
                    creatorStats,
                },
            });
        } catch (error) {
            console.error('Get quiz for review error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch quiz details',
            });
        }
    }

    // Approve quiz
    async approveQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const { feedback } = req.body;
            const adminId = req.user.id;

            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (quiz.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz is not pending approval',
                });
            }

            // Check if quiz has questions
            const questionCount =
                await require('../models/Question').countDocuments({ quizId });
            if (questionCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot approve quiz without questions',
                });
            }

            quiz.status = 'approved';
            quiz.approvedBy = adminId;
            quiz.publishedAt = new Date();
            if (feedback) {
                quiz.rejectionReason = feedback; // Store as approval feedback
            }
            await quiz.save();

            // Send notification to creator (you can implement email service here)
            console.log(`Quiz ${quiz.title} approved by admin ${adminId}`);

            res.json({
                success: true,
                message: 'Quiz approved successfully',
            });
        } catch (error) {
            console.error('Approve quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to approve quiz',
            });
        }
    }

    // Reject quiz
    async rejectQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.id;

            if (!reason || reason.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Rejection reason must be at least 10 characters long',
                });
            }

            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (quiz.status !== 'pending') {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz is not pending approval',
                });
            }

            quiz.status = 'rejected';
            quiz.rejectionReason = reason;
            quiz.approvedBy = adminId;
            await quiz.save();

            // Send notification to creator (you can implement email service here)
            console.log(
                `Quiz ${quiz.title} rejected by admin ${adminId}: ${reason}`
            );

            res.json({
                success: true,
                message: 'Quiz rejected successfully',
            });
        } catch (error) {
            console.error('Reject quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reject quiz',
            });
        }
    }

    // Get all users with pagination and filters
    async getUsers(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const { role, search } = req.query;

            // Build filter
            const filter = {};
            if (role && role !== 'all') filter.role = role;
            if (search) {
                filter.$or = [
                    { username: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                ];
            }

            const users = await User.find(filter)
                .select('-password')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await User.countDocuments(filter);

            res.json({
                success: true,
                data: {
                    users,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch users',
            });
        }
    }

    // Get all transactions with pagination and filters
    async getTransactions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const skip = (page - 1) * limit;
            const { type, status, userId } = req.query;

            // Build filter
            const filter = {};
            if (type && type !== 'all') filter.type = type;
            if (status && status !== 'all') filter.status = status;
            if (userId) filter.userId = userId;

            const transactions = await Transaction.find(filter)
                .populate('userId', 'username email')
                .populate('relatedQuizId', 'title')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Transaction.countDocuments(filter);

            res.json({
                success: true,
                data: {
                    transactions,
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

    // Get quiz analytics
    async getQuizAnalytics(req, res) {
        try {
            const { period = '30' } = req.query; // days
            const daysAgo = new Date();
            daysAgo.setDate(daysAgo.getDate() - parseInt(period));

            // Quiz creation trends
            const quizTrends = await Quiz.aggregate([
                {
                    $match: {
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
                        count: { $sum: 1 },
                        approved: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'approved'] }, 1, 0],
                            },
                        },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]);

            // Popular topics
            const topicAnalytics = await Quiz.aggregate([
                { $match: { status: 'approved' } },
                {
                    $group: {
                        _id: '$topic',
                        count: { $sum: 1 },
                        totalAttempts: { $sum: '$analytics.totalAttempts' },
                        avgRevenue: { $avg: '$analytics.revenue' },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]);

            // Difficulty distribution
            const difficultyStats = await Quiz.aggregate([
                { $match: { status: 'approved' } },
                {
                    $group: {
                        _id: '$difficulty',
                        count: { $sum: 1 },
                    },
                },
            ]);

            // Revenue analytics
            const revenueAnalytics = await Transaction.aggregate([
                {
                    $match: {
                        createdAt: { $gte: daysAgo },
                        status: 'completed',
                        type: { $in: ['payment', 'earning'] },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' },
                        },
                        revenue: { $sum: '$amount' },
                        transactions: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]);

            res.json({
                success: true,
                data: {
                    quizTrends,
                    topicAnalytics,
                    difficultyStats,
                    revenueAnalytics,
                },
            });
        } catch (error) {
            console.error('Get quiz analytics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch analytics',
            });
        }
    }

    // Update user role
    async updateUserRole(req, res) {
        try {
            const { userId } = req.params;
            const { role } = req.body;

            if (!['user', 'creator', 'admin'].includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid role',
                });
            }

            const user = await User.findByIdAndUpdate(
                userId,
                { role },
                { new: true }
            ).select('-password');

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            res.json({
                success: true,
                data: { user },
                message: 'User role updated successfully',
            });
        } catch (error) {
            console.error('Update user role error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user role',
            });
        }
    }

    // Suspend/unsuspend user
    async toggleUserStatus(req, res) {
        try {
            const { userId } = req.params;
            const { suspended, reason } = req.body;

            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Add suspension fields if they don't exist
            if (!user.suspension) {
                user.suspension = {};
            }

            user.suspension.isSuspended = suspended;
            user.suspension.reason = suspended ? reason : null;
            user.suspension.suspendedAt = suspended ? new Date() : null;
            user.suspension.suspendedBy = suspended ? req.user.id : null;

            await user.save();

            res.json({
                success: true,
                message: suspended
                    ? 'User suspended successfully'
                    : 'User unsuspended successfully',
            });
        } catch (error) {
            console.error('Toggle user status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user status',
            });
        }
    }

    // Delete quiz (admin only)
    async deleteQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const { reason } = req.body;

            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            // Check if quiz has attempts
            const attemptCount = await QuizAttempt.countDocuments({ quizId });
            if (attemptCount > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete quiz with existing attempts',
                });
            }

            // Delete questions first
            await require('../models/Question').deleteMany({ quizId });

            // Delete quiz
            await Quiz.findByIdAndDelete(quizId);

            // Log deletion
            console.log(
                `Quiz ${quiz.title} deleted by admin ${req.user.id}: ${reason}`
            );

            res.json({
                success: true,
                message: 'Quiz deleted successfully',
            });
        } catch (error) {
            console.error('Delete quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete quiz',
            });
        }
    }

    // Cancel quiz with refunds for paid quizzes
    async cancelQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const { reason } = req.body;
            const adminId = req.user.id;

            if (!reason || reason.trim().length < 10) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Cancellation reason must be at least 10 characters',
                });
            }

            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (quiz.cancelledAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz is already cancelled',
                });
            }

            // Mark quiz as cancelled
            quiz.cancelledAt = new Date();
            quiz.cancelledBy = adminId;
            quiz.cancellationReason = reason;
            quiz.status = 'cancelled';
            await quiz.save();

            let refundCount = 0;
            let totalRefunded = 0;

            // If it's a paid quiz, process refunds for all participants
            if (quiz.isPaid && quiz.entryFee > 0) {
                // Find all users who paid for this quiz
                const paidTransactions = await Transaction.find({
                    quizId: quizId,
                    type: 'quiz-entry',
                    status: 'completed',
                }).populate('userId');

                // Process refunds
                for (const transaction of paidTransactions) {
                    try {
                        // Create refund transaction
                        const refundTransaction = new Transaction({
                            userId: transaction.userId._id,
                            quizId: quizId,
                            amount: transaction.amount,
                            type: 'refund',
                            status: 'completed',
                            description: `Refund for cancelled quiz: ${quiz.title}`,
                            metadata: {
                                originalTransactionId: transaction._id,
                                cancellationReason: reason,
                                cancelledBy: adminId,
                            },
                        });
                        await refundTransaction.save();

                        // Update user wallet
                        await User.findByIdAndUpdate(transaction.userId._id, {
                            $inc: { 'wallet.balance': transaction.amount },
                        });

                        refundCount++;
                        totalRefunded += transaction.amount;
                    } catch (refundError) {
                        console.error(
                            `Failed to refund user ${transaction.userId._id}:`,
                            refundError
                        );
                        // Continue with other refunds even if one fails
                    }
                }
            }

            // Log cancellation
            console.log(
                `Quiz "${quiz.title}" cancelled by admin ${adminId}. ` +
                    `Reason: ${reason}. ` +
                    `Refunds processed: ${refundCount}, Total refunded: ${totalRefunded}`
            );

            res.json({
                success: true,
                message: 'Quiz cancelled successfully',
                data: {
                    quiz,
                    refunds: {
                        count: refundCount,
                        totalAmount: totalRefunded,
                    },
                },
            });
        } catch (error) {
            console.error('Cancel quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel quiz',
                error:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined,
            });
        }
    }
}

module.exports = new AdminController();

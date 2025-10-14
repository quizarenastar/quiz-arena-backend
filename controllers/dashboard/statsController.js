const Quiz = require('../../models/Quiz');
const User = require('../../models/User');
const QuizAttempt = require('../../models/QuizAttempt');
const Transaction = require('../../models/Transaction');
const DashboardUser = require('../../models/DashboardUser');
const Contact = require('../../models/Contact');

class StatsController {
    // Get dashboard counts for stats cards
    async getDashboardCounts(req, res) {
        try {
            const [
                quizzesCount,
                usersCount,
                dashboardUsersCount,
                transactionsCount,
                contactsCount,
            ] = await Promise.all([
                Quiz.countDocuments(),
                User.countDocuments(),
                DashboardUser.countDocuments(),
                Transaction.countDocuments(),
                Contact.countDocuments(),
            ]);

            res.json({
                success: true,
                data: {
                    quizzes: quizzesCount,
                    users: usersCount,
                    dashboardUsers: dashboardUsersCount,
                    walletTransactions: transactionsCount,
                    contacts: contactsCount,
                },
            });
        } catch (error) {
            console.error('Get dashboard counts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch dashboard counts',
            });
        }
    }

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
}

module.exports = new StatsController();

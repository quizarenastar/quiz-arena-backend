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

    // Get user registration growth stats (weekly)
    async getUserGrowthStats(req, res) {
        try {
            const { weeks = 14 } = req.query;
            const weeksAgo = new Date();
            weeksAgo.setDate(weeksAgo.getDate() - parseInt(weeks) * 7);

            const userGrowth = await User.aggregate([
                { $match: { createdAt: { $gte: weeksAgo } } },
                {
                    $group: {
                        _id: {
                            year: { $isoWeekYear: '$createdAt' },
                            week: { $isoWeek: '$createdAt' },
                        },
                        count: { $sum: 1 },
                        firstDate: { $min: '$createdAt' },
                    },
                },
                { $sort: { '_id.year': 1, '_id.week': 1 } },
            ]);

            // Calculate cumulative totals
            const usersBeforePeriod = await User.countDocuments({
                createdAt: { $lt: weeksAgo },
            });

            let cumulative = usersBeforePeriod;
            const data = userGrowth.map((week) => {
                cumulative += week.count;
                return {
                    week: `W${week._id.week}`,
                    year: week._id.year,
                    newUsers: week.count,
                    cumulativeUsers: cumulative,
                    date: week.firstDate,
                };
            });

            res.json({
                success: true,
                data: {
                    growth: data,
                    totalUsers: cumulative,
                    usersBeforePeriod,
                },
            });
        } catch (error) {
            console.error('Get user growth stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch user growth stats',
            });
        }
    }

    // Get quiz participation rate by category
    async getCategoryParticipation(req, res) {
        try {
            const categoryStats = await QuizAttempt.aggregate([
                {
                    $lookup: {
                        from: 'quizzes',
                        localField: 'quizId',
                        foreignField: '_id',
                        as: 'quiz',
                    },
                },
                { $unwind: '$quiz' },
                {
                    $group: {
                        _id: '$quiz.category',
                        attempts: { $sum: 1 },
                        uniqueUsers: { $addToSet: '$userId' },
                        avgScore: { $avg: '$percentage' },
                    },
                },
                {
                    $project: {
                        _id: 1,
                        attempts: 1,
                        uniqueUsers: { $size: '$uniqueUsers' },
                        avgScore: { $round: ['$avgScore', 1] },
                    },
                },
                { $sort: { attempts: -1 } },
                { $limit: 10 },
            ]);

            const totalAttempts = categoryStats.reduce(
                (sum, cat) => sum + cat.attempts,
                0,
            );
            const totalQuizzes = await Quiz.countDocuments({
                status: 'approved',
            });

            res.json({
                success: true,
                data: {
                    categories: categoryStats,
                    totalAttempts,
                    totalQuizzes,
                    avgAttemptsPerQuiz:
                        totalQuizzes > 0
                            ? Math.round((totalAttempts / totalQuizzes) * 10) /
                              10
                            : 0,
                },
            });
        } catch (error) {
            console.error('Get category participation error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch category participation',
            });
        }
    }

    // Get anti-cheat violation statistics
    async getAntiCheatStats(req, res) {
        try {
            // Violation count distribution (histogram data)
            const violationDistribution = await QuizAttempt.aggregate([
                {
                    $project: {
                        violationCount: {
                            $size: { $ifNull: ['$antiCheatViolations', []] },
                        },
                        status: 1,
                    },
                },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $gte: ['$violationCount', 10] },
                                10,
                                '$violationCount',
                            ],
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]);

            // Violation type breakdown
            const violationTypes = await QuizAttempt.aggregate([
                { $unwind: '$antiCheatViolations' },
                {
                    $group: {
                        _id: '$antiCheatViolations.type',
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
            ]);

            // Summary stats
            const totalAttempts = await QuizAttempt.countDocuments();
            const cleanAttempts = await QuizAttempt.countDocuments({
                $or: [
                    { antiCheatViolations: { $size: 0 } },
                    { antiCheatViolations: { $exists: false } },
                ],
            });
            const flaggedAttempts = await QuizAttempt.countDocuments({
                status: 'flagged',
            });
            const autoSubmitted = await QuizAttempt.countDocuments({
                status: 'auto-submitted',
            });

            res.json({
                success: true,
                data: {
                    distribution: violationDistribution,
                    violationTypes,
                    summary: {
                        totalAttempts,
                        cleanAttempts,
                        flaggedAttempts,
                        autoSubmitted,
                        cleanPercentage:
                            totalAttempts > 0
                                ? Math.round(
                                      (cleanAttempts / totalAttempts) * 100 * 10,
                                  ) / 10
                                : 0,
                    },
                },
            });
        } catch (error) {
            console.error('Get anti-cheat stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch anti-cheat stats',
            });
        }
    }

    // Get revenue distribution breakdown (platform/creator/prize split)
    async getRevenueDistribution(req, res) {
        try {
            const revenueStats = await Quiz.aggregate([
                {
                    $match: {
                        isPaid: true,
                        'prizePool.distributed': true,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalPool: { $sum: '$prizePool.totalAmount' },
                        totalPlatformFee: { $sum: '$prizePool.platformFee' },
                        totalCreatorFee: { $sum: '$prizePool.creatorFee' },
                        totalPrizeMoney: { $sum: '$prizePool.prizeMoney' },
                        totalQuizzes: { $sum: 1 },
                        totalParticipants: {
                            $sum: '$participantManagement.participantCount',
                        },
                    },
                },
            ]);

            const stats = revenueStats[0] || {
                totalPool: 0,
                totalPlatformFee: 0,
                totalCreatorFee: 0,
                totalPrizeMoney: 0,
                totalQuizzes: 0,
                totalParticipants: 0,
            };

            res.json({
                success: true,
                data: {
                    totalPool: stats.totalPool,
                    platformFee: stats.totalPlatformFee,
                    creatorFee: stats.totalCreatorFee,
                    prizeMoney: stats.totalPrizeMoney,
                    totalPaidQuizzes: stats.totalQuizzes,
                    totalParticipants: stats.totalParticipants,
                },
            });
        } catch (error) {
            console.error('Get revenue distribution error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch revenue distribution',
            });
        }
    }
}

module.exports = new StatsController();

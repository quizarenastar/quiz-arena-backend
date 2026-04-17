const EmailLog = require('../../models/EmailLog');

/**
 * GET /dashboard/v1/emails
 * Fetch email logs with pagination, filtering, and search.
 */
module.exports.getEmailLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 25,
            type,
            status,
            search,
        } = req.query;

        const filter = {};

        if (type && type !== 'all') {
            filter.type = type;
        }
        if (status && status !== 'all') {
            filter.status = status;
        }
        if (search) {
            filter.$or = [
                { to: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [logs, total] = await Promise.all([
            EmailLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            EmailLog.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        console.error('Get email logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email logs',
        });
    }
};

/**
 * GET /dashboard/v1/emails/stats
 * Get email sending statistics (counts by type, status, recent activity).
 */
module.exports.getEmailStats = async (req, res) => {
    try {
        const [byType, byStatus, totalCount, last24h] = await Promise.all([
            EmailLog.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 } } },
            ]),
            EmailLog.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            EmailLog.countDocuments(),
            EmailLog.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            }),
        ]);

        const typeMap = {};
        for (const t of byType) typeMap[t._id] = t.count;

        const statusMap = {};
        for (const s of byStatus) statusMap[s._id] = s.count;

        res.json({
            success: true,
            data: {
                total: totalCount,
                last24h,
                byType: typeMap,
                byStatus: statusMap,
            },
        });
    } catch (error) {
        console.error('Get email stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email stats',
        });
    }
};

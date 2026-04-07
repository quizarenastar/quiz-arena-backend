const WarRoom = require('../../models/WarRoom');
const WarRoomQuiz = require('../../models/WarRoomQuiz');
const WarRoomAttempt = require('../../models/WarRoomAttempt');
const WarRoomMessage = require('../../models/WarRoomMessage');
const logger = require('../../utils/logger');

/**
 * GET /dashboard/v1/war-rooms/stats
 * Aggregate war room statistics
 */
exports.getStats = async (req, res, next) => {
    try {
        const [
            totalRooms,
            activeRooms,
            closedRooms,
            totalQuizzes,
            totalAttempts,
            totalMessages,
            recentRooms,
            topHosts,
            topicDistribution,
        ] = await Promise.all([
            WarRoom.countDocuments(),
            WarRoom.countDocuments({
                status: { $in: ['waiting', 'countdown', 'in-progress', 'finished'] },
            }),
            WarRoom.countDocuments({ status: 'closed' }),
            WarRoomQuiz.countDocuments({ status: 'completed' }),
            WarRoomAttempt.countDocuments(),
            WarRoomMessage.countDocuments(),
            WarRoom.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .select('name roomCode status maxPlayers members settings roundNumber createdAt lastActivityAt')
                .populate('hostId', 'username')
                .lean(),
            // Top hosts by room count
            WarRoom.aggregate([
                { $group: { _id: '$hostId', roomCount: { $sum: 1 } } },
                { $sort: { roomCount: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user',
                    },
                },
                { $unwind: '$user' },
                {
                    $project: {
                        username: '$user.username',
                        profilePicture: '$user.profilePicture',
                        roomCount: 1,
                    },
                },
            ]),
            // Topic distribution
            WarRoomQuiz.aggregate([
                { $match: { status: 'completed' } },
                { $group: { _id: '$topic', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
        ]);

        // Unique participants
        const uniqueParticipants = await WarRoom.aggregate([
            { $unwind: '$members' },
            { $group: { _id: '$members.userId' } },
            { $count: 'total' },
        ]);

        // Average players per room
        const avgPlayers = await WarRoom.aggregate([
            { $project: { memberCount: { $size: '$members' } } },
            { $group: { _id: null, avg: { $avg: '$memberCount' } } },
        ]);

        // Rooms created over last 30 days (grouped by day)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const roomsOverTime = await WarRoom.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                        },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            data: {
                counts: {
                    totalRooms,
                    activeRooms,
                    closedRooms,
                    totalQuizzes,
                    totalAttempts,
                    totalMessages,
                    uniqueParticipants: uniqueParticipants[0]?.total || 0,
                    avgPlayersPerRoom:
                        Math.round((avgPlayers[0]?.avg || 0) * 10) / 10,
                },
                recentRooms,
                topHosts,
                topicDistribution,
                roomsOverTime,
            },
        });
    } catch (err) {
        logger.error('dashboard getStats error', { error: err.message });
        next(err);
    }
};

/**
 * GET /dashboard/v1/war-rooms
 * List all war rooms (paginated)
 */
exports.getAllRooms = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const search = req.query.search;

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { roomCode: { $regex: search.toUpperCase(), $options: 'i' } },
            ];
        }

        const [rooms, total] = await Promise.all([
            WarRoom.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('hostId', 'username profilePicture')
                .lean(),
            WarRoom.countDocuments(filter),
        ]);

        res.json({
            success: true,
            data: rooms,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        logger.error('dashboard getAllRooms error', { error: err.message });
        next(err);
    }
};

/**
 * GET /dashboard/v1/war-rooms/:roomId
 * Get detailed room info for admin
 */
exports.getRoomDetails = async (req, res, next) => {
    try {
        const room = await WarRoom.findById(req.params.roomId)
            .populate('hostId', 'username profilePicture')
            .lean();

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        const [quizzes, messageCount] = await Promise.all([
            WarRoomQuiz.find({ warRoomId: room._id })
                .sort({ roundNumber: -1 })
                .lean(),
            WarRoomMessage.countDocuments({ warRoomId: room._id }),
        ]);

        res.json({
            success: true,
            data: {
                room,
                quizzes,
                messageCount,
            },
        });
    } catch (err) {
        logger.error('dashboard getRoomDetails error', {
            error: err.message,
        });
        next(err);
    }
};

/**
 * DELETE /dashboard/v1/war-rooms/:roomId
 * Admin force-delete a room
 */
exports.deleteRoom = async (req, res, next) => {
    try {
        const room = await WarRoom.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        await Promise.all([
            WarRoomMessage.deleteMany({ warRoomId: room._id }),
            WarRoomAttempt.deleteMany({ warRoomId: room._id }),
            WarRoomQuiz.deleteMany({ warRoomId: room._id }),
            room.deleteOne(),
        ]);

        res.json({
            success: true,
            message: 'Room deleted by admin',
        });
    } catch (err) {
        logger.error('dashboard deleteRoom error', { error: err.message });
        next(err);
    }
};

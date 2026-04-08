const WarRoom = require('../../models/WarRoom');
const WarRoomQuiz = require('../../models/WarRoomQuiz');
const WarRoomAttempt = require('../../models/WarRoomAttempt');
const WarRoomMessage = require('../../models/WarRoomMessage');
const User = require('../../models/User');
const { nanoid } = require('nanoid');
const aiService = require('../../services/aiService');
const logger = require('../../utils/logger');

/**
 * Generate a unique 6-character uppercase room code
 */
async function generateUniqueCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: I,O,0,1
    let code;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 20) {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        exists = await WarRoom.findOne({ roomCode: code });
        attempts++;
    }

    if (exists) {
        // Fallback to nanoid
        code = nanoid(6).toUpperCase().replace(/[IO01]/g, 'X');
    }

    return code;
}

/**
 * POST /api/v1/war-rooms
 * Create a new war room
 */
exports.createRoom = async (req, res, next) => {
    try {
        const { name, description, visibility, maxPlayers, settings } =
            req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Room name must be at least 2 characters',
            });
        }

        const user = await User.findById(req.userId).select(
            'username profilePicture blocked'
        );
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        if (user.blocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account is blocked',
            });
        }

        // Limit active rooms per user to 3
        const activeRoomCount = await WarRoom.countDocuments({
            hostId: req.userId,
            status: { $nin: ['closed'] },
        });
        if (activeRoomCount >= 3) {
            return res.status(400).json({
                success: false,
                message:
                    'You can have at most 3 active war rooms. Close an existing room first.',
            });
        }

        const roomCode = await generateUniqueCode();

        const room = await WarRoom.create({
            name: name.trim(),
            description: (description || '').trim().substring(0, 300),
            roomCode,
            visibility: visibility || 'public',
            hostId: req.userId,
            maxPlayers: Math.min(Math.max(maxPlayers || 10, 2), 10),
            members: [
                {
                    userId: req.userId,
                    username: user.username,
                    profilePicture: user.profilePicture || '',
                    role: 'host',
                    isOnline: true,
                    isReady: true,
                },
            ],
            settings: {
                topic: settings?.topic || 'General Knowledge',
                difficulty: settings?.difficulty || 'medium',
                totalQuestions: Math.min(
                    Math.max(settings?.totalQuestions || 10, 5),
                    30
                ),
                timePerQuestion: Math.min(
                    Math.max(settings?.timePerQuestion || 30, 10),
                    120
                ),
                category: settings?.category || 'general-knowledge',
                countdownSeconds: Math.min(
                    Math.max(settings?.countdownSeconds || 10, 5),
                    30
                ),
            },
        });

        // Create system message
        await WarRoomMessage.create({
            warRoomId: room._id,
            username: 'System',
            message: `${user.username} created the room`,
            type: 'system',
        });

        res.status(201).json({
            success: true,
            data: room,
        });
    } catch (err) {
        logger.error('createRoom error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/:roomId/suggested-questions
 * Generate AI suggested questions from room context
 */
exports.getSuggestedQuestions = async (req, res, next) => {
    try {
        const room = await WarRoom.findById(req.params.roomId).select(
            'name description members status'
        );

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        const isMember = room.members.some(
            (m) => m.userId.toString() === req.userId
        );
        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'Only room members can access suggestions',
            });
        }

        const contextTopic = `${room.name}${
            room.description ? ` - ${room.description}` : ''
        }`;

        const { questions } = await aiService.generateQuizQuestions(
            contextTopic,
            5,
            'medium'
        );

        const suggestions = questions.map((q) => ({
            question: q.question,
            options: q.options,
            explanation: q.explanation,
        }));

        res.json({
            success: true,
            data: {
                topicSuggestion: room.name,
                context: contextTopic,
                questions: suggestions,
            },
        });
    } catch (err) {
        logger.error('getSuggestedQuestions error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/public
 * List public war rooms that are joinable
 */
exports.getPublicRooms = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const skip = (page - 1) * limit;

        const filter = {
            visibility: 'public',
            status: { $in: ['waiting', 'finished'] },
        };

        const [rooms, total] = await Promise.all([
            WarRoom.find(filter)
                .sort({ lastActivityAt: -1 })
                .skip(skip)
                .limit(limit)
                .select(
                    'name description roomCode status maxPlayers members settings roundNumber lastActivityAt createdAt'
                )
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
        logger.error('getPublicRooms error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/my-rooms
 * Get rooms user is host or member of
 */
exports.getMyRooms = async (req, res, next) => {
    try {
        const rooms = await WarRoom.find({
            'members.userId': req.userId,
            status: { $ne: 'closed' },
        })
            .sort({ lastActivityAt: -1 })
            .lean();

        res.json({
            success: true,
            data: rooms,
        });
    } catch (err) {
        logger.error('getMyRooms error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/code/:roomCode
 * Get room details by code
 */
exports.getRoomByCode = async (req, res, next) => {
    try {
        const room = await WarRoom.findOne({
            roomCode: req.params.roomCode.toUpperCase(),
        }).lean();

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        // For private rooms, only members can see details
        if (room.visibility === 'private') {
            const isMember = room.members.some(
                (m) => m.userId.toString() === req.userId
            );
            if (!isMember) {
                // Return limited info for non-members
                return res.json({
                    success: true,
                    data: {
                        _id: room._id,
                        name: room.name,
                        description: room.description,
                        roomCode: room.roomCode,
                        visibility: room.visibility,
                        status: room.status,
                        playerCount: room.members.length,
                        maxPlayers: room.maxPlayers,
                        isMember: false,
                    },
                });
            }
        }

        res.json({
            success: true,
            data: {
                ...room,
                isMember: room.members.some(
                    (m) => m.userId.toString() === req.userId
                ),
            },
        });
    } catch (err) {
        logger.error('getRoomByCode error', { error: err.message });
        next(err);
    }
};

/**
 * POST /api/v1/war-rooms/code/:roomCode/join
 * Join a room via code
 */
exports.joinRoom = async (req, res, next) => {
    try {
        const room = await WarRoom.findOne({
            roomCode: req.params.roomCode.toUpperCase(),
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        if (room.status === 'closed') {
            return res.status(400).json({
                success: false,
                message: 'This room is closed',
            });
        }

        const isMember = room.members.some(
            (m) => m.userId.toString() === req.userId
        );
        if (isMember) {
            return res.json({
                success: true,
                message: 'Already a member',
                data: room,
            });
        }

        if (room.members.length >= room.maxPlayers) {
            return res.status(400).json({
                success: false,
                message: 'Room is full',
            });
        }

        const user = await User.findById(req.userId).select(
            'username profilePicture blocked'
        );
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }
        if (user.blocked) {
            return res.status(403).json({
                success: false,
                message: 'Your account is blocked',
            });
        }

        room.members.push({
            userId: req.userId,
            username: user.username,
            profilePicture: user.profilePicture || '',
            role: 'player',
            isOnline: false, // Will go online when socket connects
            isReady: false,
        });
        room.lastActivityAt = new Date();
        await room.save();

        res.json({
            success: true,
            data: room,
        });
    } catch (err) {
        logger.error('joinRoom error', { error: err.message });
        next(err);
    }
};

/**
 * POST /api/v1/war-rooms/:roomId/leave
 * Leave a room
 */
exports.leaveRoom = async (req, res, next) => {
    try {
        const room = await WarRoom.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        const isMember = room.members.some(
            (m) => m.userId.toString() === req.userId
        );
        if (!isMember) {
            return res.status(400).json({
                success: false,
                message: 'You are not a member of this room',
            });
        }

        room.members = room.members.filter(
            (m) => m.userId.toString() !== req.userId
        );

        // Transfer host if needed
        if (
            room.hostId.toString() === req.userId &&
            room.members.length > 0
        ) {
            room.members[0].role = 'host';
            room.hostId = room.members[0].userId;
        }

        if (room.members.length === 0) {
            room.status = 'closed';
        }

        room.lastActivityAt = new Date();
        await room.save();

        res.json({
            success: true,
            message: 'Left the room',
        });
    } catch (err) {
        logger.error('leaveRoom error', { error: err.message });
        next(err);
    }
};

/**
 * DELETE /api/v1/war-rooms/:roomId
 * Delete/close a room (host only)
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
        if (room.hostId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the host can delete this room',
            });
        }

        // Close the room and cleanup
        room.status = 'closed';
        room.lastActivityAt = new Date();
        await room.save();

        // Cleanup related data
        await Promise.all([
            WarRoomMessage.deleteMany({ warRoomId: room._id }),
            WarRoomAttempt.deleteMany({ warRoomId: room._id }),
            WarRoomQuiz.deleteMany({ warRoomId: room._id }),
        ]);

        await room.deleteOne();

        res.json({
            success: true,
            message: 'Room deleted',
        });
    } catch (err) {
        logger.error('deleteRoom error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/:roomId/history
 * Get quiz history for a room
 */
exports.getRoomHistory = async (req, res, next) => {
    try {
        const room = await WarRoom.findById(req.params.roomId);
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Room not found',
            });
        }

        const isMember = room.members.some(
            (m) => m.userId.toString() === req.userId
        );
        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: 'Only room members can view history',
            });
        }

        const quizzes = await WarRoomQuiz.find({
            warRoomId: room._id,
            status: 'completed',
        })
            .sort({ roundNumber: -1 })
            .select(
                'roundNumber topic difficulty totalQuestions results winnerId startedAt endedAt'
            )
            .lean();

        res.json({
            success: true,
            data: quizzes,
        });
    } catch (err) {
        logger.error('getRoomHistory error', { error: err.message });
        next(err);
    }
};

/**
 * GET /api/v1/war-rooms/:roomId/history/:quizId
 * Get detailed results of a specific round
 */
exports.getRoundDetails = async (req, res, next) => {
    try {
        const quiz = await WarRoomQuiz.findOne({
            _id: req.params.quizId,
            warRoomId: req.params.roomId,
        }).lean();

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: 'Round not found',
            });
        }

        const attempts = await WarRoomAttempt.find({
            warRoomQuizId: quiz._id,
        })
            .populate('userId', 'username profilePicture')
            .lean();

        res.json({
            success: true,
            data: {
                quiz,
                attempts,
            },
        });
    } catch (err) {
        logger.error('getRoundDetails error', { error: err.message });
        next(err);
    }
};

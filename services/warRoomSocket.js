const WarRoom = require('../models/WarRoom');
const WarRoomQuiz = require('../models/WarRoomQuiz');
const WarRoomAttempt = require('../models/WarRoomAttempt');
const WarRoomMessage = require('../models/WarRoomMessage');
const aiService = require('./aiService');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../configs');
const User = require('../models/User');
const logger = require('../utils/logger');

const CHAT_LIMIT = 200;

/**
 * Authenticate socket connections using the same JWT cookie used by REST API
 */
function authenticateSocket(socket, next) {
    try {
        const cookies = socket.handshake.headers.cookie || '';
        logger.info('War Room auth attempt', {
            hasCookies: !!cookies,
            cookieLength: cookies.length,
        });

        const tokenMatch = cookies
            .split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('access_token='));

        if (!tokenMatch) {
            logger.warn('War Room auth: no access_token cookie found');
            return next(new Error('Authentication required'));
        }

        const token = decodeURIComponent(
            tokenMatch.substring('access_token='.length)
        );
        const payload = jwt.verify(token, JWT_SECRET);
        socket.userId = payload.id;
        logger.info('War Room auth success', { userId: payload.id });
        next();
    } catch (err) {
        logger.error('War Room auth failed', { error: err.message });
        next(new Error('Authentication failed'));
    }
}

/**
 * Initialize War Room WebSocket handling
 */
function initWarRoomSocket(io) {
    const warRoomNs = io.of('/war-room');

    warRoomNs.use(authenticateSocket);

    warRoomNs.on('connection', async (socket) => {
        logger.info('War Room socket connected', { userId: socket.userId });

        // Fetch user info once on connect
        let user;
        try {
            user = await User.findById(socket.userId).select(
                'username profilePicture'
            );
            if (!user) {
                logger.warn('War Room: User not found in DB', { userId: socket.userId });
                socket.emit('war-room:error', { message: 'User not found' });
                socket.disconnect();
                return;
            }
            logger.info('War Room: User loaded', { userId: socket.userId, username: user.username });
        } catch (err) {
            logger.error('War Room: Failed to load user', { error: err.message });
            socket.emit('war-room:error', { message: 'Failed to load user' });
            socket.disconnect();
            return;
        }

        socket.userData = {
            userId: user._id.toString(),
            username: user.username,
            profilePicture: user.profilePicture || '',
        };

        // ─── JOIN ROOM ──────────────────────────────────────────
        socket.on('war-room:join', async ({ roomCode }, callback) => {
            logger.info('war-room:join event received', { roomCode, userId: socket.userData.userId });
            try {
                const room = await WarRoom.findOne({ roomCode: roomCode.toUpperCase() });
                if (!room) {
                    return callback?.({ error: 'Room not found' });
                }
                if (room.status === 'closed') {
                    return callback?.({ error: 'Room is closed' });
                }

                const isMember = room.members.some(
                    (m) => m.userId.toString() === socket.userData.userId
                );

                if (!isMember) {
                    if (room.members.length >= room.maxPlayers) {
                        return callback?.({ error: 'Room is full' });
                    }

                    room.members.push({
                        userId: socket.userData.userId,
                        username: socket.userData.username,
                        profilePicture: socket.userData.profilePicture,
                        role: 'player',
                        isOnline: true,
                        isReady: false,
                    });
                    room.lastActivityAt = new Date();
                    await room.save();

                    // System message
                    await createSystemMessage(
                        room._id,
                        `${socket.userData.username} joined the room`
                    );
                } else {
                    // Mark existing member as online
                    const member = room.members.find(
                        (m) => m.userId.toString() === socket.userData.userId
                    );
                    if (member) {
                        member.isOnline = true;
                        room.lastActivityAt = new Date();
                        await room.save();
                    }
                }

                // Join socket room
                socket.join(roomCode);
                socket.currentRoomCode = roomCode;
                socket.currentRoomId = room._id.toString();

                // Fetch recent chat messages
                const messages = await WarRoomMessage.find({
                    warRoomId: room._id,
                })
                    .sort({ createdAt: -1 })
                    .limit(CHAT_LIMIT)
                    .lean();

                // Notify others
                socket.to(roomCode).emit('war-room:member-joined', {
                    member: {
                        userId: socket.userData.userId,
                        username: socket.userData.username,
                        profilePicture: socket.userData.profilePicture,
                        role: isMember
                            ? room.members.find(
                                  (m) =>
                                      m.userId.toString() ===
                                      socket.userData.userId
                              )?.role
                            : 'player',
                        isOnline: true,
                        isReady: false,
                    },
                });

                // Send full room state to joining user
                const freshRoom = await WarRoom.findById(room._id).lean();
                callback?.({
                    success: true,
                    room: freshRoom,
                    messages: messages.reverse(),
                });

                // If room is in-progress, send the active quiz state to this user
                if (freshRoom.status === 'in-progress' && freshRoom.currentQuizId) {
                    const activeQuiz = await WarRoomQuiz.findById(freshRoom.currentQuizId);
                    if (activeQuiz && activeQuiz.status === 'in-progress') {
                        const sanitizedQuestions = activeQuiz.questions.map(
                            (q, idx) => ({
                                index: idx,
                                question: q.question,
                                options: q.options,
                                timeLimit: q.timeLimit,
                                points: q.points,
                            })
                        );
                        
                        let elapsedSeconds = 0;
                        if (activeQuiz.startedAt) {
                            elapsedSeconds = Math.floor((Date.now() - new Date(activeQuiz.startedAt).getTime()) / 1000);
                        }
                        const remainingDuration = Math.max(0, activeQuiz.duration - elapsedSeconds);

                        // Find existing attempt for this user
                        const attempt = await WarRoomAttempt.findOne({
                            warRoomQuizId: activeQuiz._id,
                            userId: socket.userData.userId
                        });

                        const answeredQuestionIndices = attempt ? attempt.answers.map(a => a.questionIndex) : [];
                        const currentScore = attempt ? attempt.score : 0;

                        socket.emit('war-room:quiz-start', {
                            quizId: activeQuiz._id,
                            roundNumber: freshRoom.roundNumber,
                            topic: activeQuiz.topic,
                            difficulty: activeQuiz.difficulty,
                            totalQuestions: activeQuiz.totalQuestions,
                            duration: remainingDuration,
                            questions: sanitizedQuestions,
                            startedAt: activeQuiz.startedAt,
                            answeredQuestionIndices,
                            currentScore
                        });
                    }
                }
            } catch (err) {
                logger.error('war-room:join error', { error: err.message });
                callback?.({ error: 'Failed to join room' });
            }
        });

        // ─── LEAVE ROOM ─────────────────────────────────────────
        socket.on('war-room:leave', async (_, callback) => {
            await handleLeaveRoom(socket, warRoomNs);
            callback?.({ success: true });
        });

        // ─── TOGGLE READY ───────────────────────────────────────
        socket.on('war-room:ready', async ({ isReady }, callback) => {
            try {
                const room = await WarRoom.findById(socket.currentRoomId);
                if (!room) return callback?.({ error: 'Room not found' });

                const member = room.members.find(
                    (m) => m.userId.toString() === socket.userData.userId
                );
                if (!member) return callback?.({ error: 'Not a member' });

                member.isReady = isReady;
                room.lastActivityAt = new Date();
                await room.save();

                warRoomNs.to(socket.currentRoomCode).emit('war-room:member-ready', {
                    userId: socket.userData.userId,
                    isReady,
                });

                callback?.({ success: true });
            } catch (err) {
                logger.error('war-room:ready error', { error: err.message });
                callback?.({ error: 'Failed to update ready status' });
            }
        });

        // ─── UPDATE SETTINGS (Host only) ────────────────────────
        socket.on('war-room:update-settings', async ({ settings }, callback) => {
            try {
                const room = await WarRoom.findById(socket.currentRoomId);
                if (!room) return callback?.({ error: 'Room not found' });
                if (room.hostId.toString() !== socket.userData.userId) {
                    return callback?.({ error: 'Only the host can change settings' });
                }
                if (room.status !== 'waiting' && room.status !== 'finished') {
                    return callback?.({ error: 'Cannot change settings during a quiz' });
                }

                // Apply settings
                const allowed = [
                    'topic',
                    'difficulty',
                    'totalQuestions',
                    'timePerQuestion',
                    'category',
                    'countdownSeconds',
                ];
                for (const key of allowed) {
                    if (settings[key] !== undefined) {
                        room.settings[key] = settings[key];
                    }
                }
                room.lastActivityAt = new Date();
                await room.save();

                warRoomNs.to(socket.currentRoomCode).emit('war-room:settings-updated', {
                    settings: room.settings,
                });

                callback?.({ success: true, settings: room.settings });
            } catch (err) {
                logger.error('war-room:update-settings error', {
                    error: err.message,
                });
                callback?.({ error: 'Failed to update settings' });
            }
        });

        // ─── KICK PLAYER (Host only) ────────────────────────────
        socket.on('war-room:kick', async ({ targetUserId }, callback) => {
            try {
                const room = await WarRoom.findById(socket.currentRoomId);
                if (!room) return callback?.({ error: 'Room not found' });
                if (room.hostId.toString() !== socket.userData.userId) {
                    return callback?.({ error: 'Only the host can kick players' });
                }
                if (targetUserId === socket.userData.userId) {
                    return callback?.({ error: 'Cannot kick yourself' });
                }

                const targetMember = room.members.find(
                    (m) => m.userId.toString() === targetUserId
                );
                if (!targetMember) return callback?.({ error: 'Player not found' });

                room.members = room.members.filter(
                    (m) => m.userId.toString() !== targetUserId
                );
                room.lastActivityAt = new Date();
                await room.save();

                await createSystemMessage(
                    room._id,
                    `${targetMember.username} was removed from the room`
                );

                warRoomNs.to(socket.currentRoomCode).emit('war-room:member-kicked', {
                    userId: targetUserId,
                    username: targetMember.username,
                });

                // Disconnect the kicked player's socket from the room
                const sockets = await warRoomNs.in(socket.currentRoomCode).fetchSockets();
                for (const s of sockets) {
                    if (s.userData?.userId === targetUserId) {
                        s.leave(socket.currentRoomCode);
                        s.emit('war-room:member-kicked', {
                            userId: targetUserId,
                            kicked: true,
                            message: 'You have been removed from the room',
                        });
                        s.currentRoomCode = null;
                        s.currentRoomId = null;
                    }
                }

                callback?.({ success: true });
            } catch (err) {
                logger.error('war-room:kick error', { error: err.message });
                callback?.({ error: 'Failed to kick player' });
            }
        });

        // ─── START QUIZ (Host only) ─────────────────────────────
        socket.on('war-room:start-quiz', async (data, callback) => {
            try {
                const room = await WarRoom.findById(socket.currentRoomId);
                if (!room) return callback?.({ error: 'Room not found' });
                if (room.hostId.toString() !== socket.userData.userId) {
                    return callback?.({ error: 'Only the host can start the quiz' });
                }
                if (room.status !== 'waiting' && room.status !== 'finished') {
                    return callback?.({ error: 'Quiz already in progress' });
                }

                const onlineMembers = room.members.filter((m) => m.isOnline);
                if (onlineMembers.length < 1) {
                    return callback?.({
                        error: 'Need at least 1 online player to start',
                    });
                }

                // Apply quiz settings from client payload
                const quizSettings = {
                    topic:
                        data?.topic?.trim() ||
                        room.settings.topic?.trim() ||
                        room.name,
                    difficulty: data?.difficulty || room.settings.difficulty || 'medium',
                    totalQuestions: data?.totalQuestions || room.settings.totalQuestions || 10,
                    timePerQuestion: data?.timePerQuestion || room.settings.timePerQuestion || 30,
                    countdownSeconds: room.settings.countdownSeconds || 5,
                };

                // Save settings to room for reference
                room.settings = { ...room.settings, ...quizSettings };
                room.status = 'countdown';
                room.lastActivityAt = new Date();
                await room.save();

                callback?.({ success: true });

                await createSystemMessage(
                    room._id,
                    `Quiz is starting in ${quizSettings.countdownSeconds} seconds!`
                );

                // Countdown
                const countdownSecs = quizSettings.countdownSeconds;
                for (let i = countdownSecs; i >= 1; i--) {
                    warRoomNs.to(socket.currentRoomCode).emit('war-room:countdown', {
                        seconds: i,
                    });
                    await sleep(1000);
                }

                // Generate quiz with AI
                warRoomNs.to(socket.currentRoomCode).emit('war-room:generating', {
                    message: 'Generating quiz questions...',
                });

                const newRound = room.roundNumber + 1;

                // Create WarRoomQuiz in generating state
                let warRoomQuiz = await WarRoomQuiz.create({
                    warRoomId: room._id,
                    roundNumber: newRound,
                    topic: quizSettings.topic,
                    difficulty: quizSettings.difficulty,
                    category: quizSettings.category,
                    totalQuestions: quizSettings.totalQuestions,
                    duration:
                        quizSettings.totalQuestions *
                        quizSettings.timePerQuestion,
                    status: 'generating',
                    questions: [],
                });

                try {
                    const { questions } =
                        await aiService.generateQuizQuestions(
                            `${quizSettings.topic}${
                                room.description
                                    ? ` (Room: ${room.name}. Context: ${room.description})`
                                    : ` (Room: ${room.name})`
                            }`,
                            quizSettings.totalQuestions,
                            quizSettings.difficulty
                        );

                    // Add timeLimit from settings to each question
                    const formattedQuestions = questions.map((q) => ({
                        ...q,
                        timeLimit: quizSettings.timePerQuestion,
                    }));

                    warRoomQuiz.questions = formattedQuestions;
                    warRoomQuiz.status = 'in-progress';
                    warRoomQuiz.startedAt = new Date();
                    await warRoomQuiz.save();
                } catch (aiErr) {
                    logger.error('AI quiz generation failed for war room', {
                        error: aiErr.message,
                    });
                    warRoomQuiz.status = 'ready'; // Mark failed
                    await warRoomQuiz.save();
                    room.status = 'waiting';
                    await room.save();
                    warRoomNs.to(socket.currentRoomCode).emit('war-room:error', {
                        message:
                            'Failed to generate quiz. Please try again.',
                    });
                    return;
                }

                // Update room
                room.status = 'in-progress';
                room.currentQuizId = warRoomQuiz._id;
                room.roundNumber = newRound;
                room.lastActivityAt = new Date();
                // Reset ready status for all members
                room.members.forEach((m) => {
                    m.isReady = false;
                });
                await room.save();

                // Create attempts for all online members
                const onlineMemberIds = room.members
                    .filter((m) => m.isOnline)
                    .map((m) => m.userId);

                await Promise.all(
                    onlineMemberIds.map((userId) =>
                        WarRoomAttempt.create({
                            warRoomId: room._id,
                            warRoomQuizId: warRoomQuiz._id,
                            userId,
                            totalQuestions: warRoomQuiz.totalQuestions,
                            startedAt: new Date(),
                        })
                    )
                );

                // Send questions to all players (without correct answers)
                const sanitizedQuestions = warRoomQuiz.questions.map(
                    (q, idx) => ({
                        index: idx,
                        question: q.question,
                        options: q.options,
                        timeLimit: q.timeLimit,
                        points: q.points,
                    })
                );

                warRoomNs.to(socket.currentRoomCode).emit('war-room:quiz-start', {
                    quizId: warRoomQuiz._id,
                    roundNumber: newRound,
                    topic: warRoomQuiz.topic,
                    difficulty: warRoomQuiz.difficulty,
                    totalQuestions: warRoomQuiz.totalQuestions,
                    duration: warRoomQuiz.duration,
                    questions: sanitizedQuestions,
                    startedAt: warRoomQuiz.startedAt,
                });

                await createSystemMessage(room._id, `Round ${newRound} has started!`);

                // Set auto-submit timer for the entire quiz duration
                const totalDurationMs = warRoomQuiz.duration * 1000 + 3000; // +3s buffer
                setTimeout(async () => {
                    await autoSubmitRound(
                        warRoomQuiz._id,
                        room._id,
                        socket.currentRoomCode,
                        warRoomNs
                    );
                }, totalDurationMs);
            } catch (err) {
                logger.error('war-room:start-quiz error', {
                    error: err.message,
                });
                callback?.({ error: 'Failed to start quiz' });
            }
        });

        // ─── SUBMIT ANSWER ──────────────────────────────────────
        socket.on('war-room:submit-answer', async ({ quizId, questionIndex, selectedAnswer, timeSpent }, callback) => {
            try {
                const attempt = await WarRoomAttempt.findOne({
                    warRoomQuizId: quizId,
                    userId: socket.userData.userId,
                });
                if (!attempt || attempt.status !== 'in-progress') {
                    return callback?.({ error: 'No active attempt found' });
                }

                const quiz = await WarRoomQuiz.findById(quizId);
                if (!quiz) return callback?.({ error: 'Quiz not found' });

                const question = quiz.questions[questionIndex];
                if (!question) return callback?.({ error: 'Invalid question index' });

                // Check if already answered
                const existing = attempt.answers.find(
                    (a) => a.questionIndex === questionIndex
                );
                if (existing) {
                    return callback?.({ error: 'Already answered this question' });
                }

                const isCorrect = selectedAnswer === question.correctAnswer;
                const pointsEarned = isCorrect ? question.points : 0;

                attempt.answers.push({
                    questionIndex,
                    selectedAnswer,
                    isCorrect,
                    timeSpent: timeSpent || 0,
                });

                if (isCorrect) {
                    attempt.correctAnswers += 1;
                    attempt.score += pointsEarned;
                }
                attempt.totalTime += timeSpent || 0;
                attempt.percentage =
                    (attempt.correctAnswers / attempt.totalQuestions) * 100;

                await attempt.save();

                // Broadcast progress to room
                warRoomNs.to(socket.currentRoomCode).emit('war-room:progress-update', {
                    userId: socket.userData.userId,
                    username: socket.userData.username,
                    answeredCount: attempt.answers.length,
                    totalQuestions: attempt.totalQuestions,
                    currentScore: attempt.score,
                });

                callback?.({
                    success: true,
                    isCorrect,
                    correctAnswer: question.correctAnswer,
                    explanation: question.explanation,
                    score: attempt.score,
                });
            } catch (err) {
                logger.error('war-room:submit-answer error', {
                    error: err.message,
                });
                callback?.({ error: 'Failed to submit answer' });
            }
        });

        // ─── FINISH QUIZ (Player done) ──────────────────────────
        socket.on('war-room:finish-quiz', async ({ quizId }, callback) => {
            try {
                const attempt = await WarRoomAttempt.findOne({
                    warRoomQuizId: quizId,
                    userId: socket.userData.userId,
                    status: 'in-progress',
                });
                if (!attempt) {
                    return callback?.({ error: 'No active attempt' });
                }

                attempt.status = 'completed';
                attempt.completedAt = new Date();
                await attempt.save();

                warRoomNs.to(socket.currentRoomCode).emit('war-room:player-finished', {
                    userId: socket.userData.userId,
                    username: socket.userData.username,
                    score: attempt.score,
                    correctAnswers: attempt.correctAnswers,
                    totalTime: attempt.totalTime,
                });

                // Check if all players have finished
                const allAttempts = await WarRoomAttempt.find({
                    warRoomQuizId: quizId,
                });
                const allDone = allAttempts.every(
                    (a) => a.status !== 'in-progress'
                );

                if (allDone) {
                    await finalizeRound(
                        quizId,
                        socket.currentRoomId,
                        socket.currentRoomCode,
                        warRoomNs
                    );
                }

                callback?.({ success: true });
            } catch (err) {
                logger.error('war-room:finish-quiz error', {
                    error: err.message,
                });
                callback?.({ error: 'Failed to finish quiz' });
            }
        });

        // ─── CHAT MESSAGE ───────────────────────────────────────
        socket.on('war-room:chat', async ({ message }, callback) => {
            try {
                if (!message || !message.trim()) {
                    return callback?.({ error: 'Message is empty' });
                }

                const room = await WarRoom.findById(socket.currentRoomId);
                if (!room) return callback?.({ error: 'Room not found' });

                // Enforce chat limit — delete oldest if over limit
                const count = await WarRoomMessage.countDocuments({
                    warRoomId: room._id,
                });
                if (count >= CHAT_LIMIT) {
                    const oldest = await WarRoomMessage.findOne({
                        warRoomId: room._id,
                    }).sort({ createdAt: 1 });
                    if (oldest) await oldest.deleteOne();
                }

                const chatMsg = await WarRoomMessage.create({
                    warRoomId: room._id,
                    userId: socket.userData.userId,
                    username: socket.userData.username,
                    profilePicture: socket.userData.profilePicture,
                    message: message.trim().substring(0, 500),
                    type: 'chat',
                });

                room.analytics.totalMessagesCount += 1;
                room.lastActivityAt = new Date();
                await room.save();

                warRoomNs.to(socket.currentRoomCode).emit('war-room:chat-message', {
                    _id: chatMsg._id,
                    userId: socket.userData.userId,
                    username: socket.userData.username,
                    profilePicture: socket.userData.profilePicture,
                    message: chatMsg.message,
                    type: 'chat',
                    createdAt: chatMsg.createdAt,
                });

                callback?.({ success: true });
            } catch (err) {
                logger.error('war-room:chat error', { error: err.message });
                callback?.({ error: 'Failed to send message' });
            }
        });

        // ─── DISCONNECT ─────────────────────────────────────────
        socket.on('disconnect', async () => {
            logger.info('War Room socket disconnected', {
                userId: socket.userId,
            });
            await handleLeaveRoom(socket, warRoomNs, true);
        });
    });

    return warRoomNs;
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────

async function handleLeaveRoom(socket, warRoomNs, isDisconnect = false) {
    try {
        if (!socket.currentRoomId) return;

        const room = await WarRoom.findById(socket.currentRoomId);
        if (!room) return;

        const member = room.members.find(
            (m) => m.userId.toString() === socket.userData.userId
        );
        if (!member) return;

        if (isDisconnect) {
            // Just mark offline on disconnect (they might reconnect)
            member.isOnline = false;
            room.lastActivityAt = new Date();
            await room.save();

            warRoomNs.to(socket.currentRoomCode).emit('war-room:member-left', {
                userId: socket.userData.userId,
                username: socket.userData.username,
                disconnected: true,
            });
        } else {
            // Actually remove from room
            room.members = room.members.filter(
                (m) => m.userId.toString() !== socket.userData.userId
            );
            room.lastActivityAt = new Date();

            // If host leaves and there are other members, transfer host
            if (
                room.hostId.toString() === socket.userData.userId &&
                room.members.length > 0
            ) {
                const newHost = room.members[0];
                newHost.role = 'host';
                room.hostId = newHost.userId;

                await createSystemMessage(
                    room._id,
                    `${socket.userData.username} left. ${newHost.username} is now the host.`
                );
            } else if (room.members.length === 0) {
                room.status = 'closed';
            }

            await room.save();

            await createSystemMessage(
                room._id,
                `${socket.userData.username} left the room`
            );

            warRoomNs.to(socket.currentRoomCode).emit('war-room:member-left', {
                userId: socket.userData.userId,
                username: socket.userData.username,
                disconnected: false,
                newHostId: room.hostId?.toString(),
            });
        }

        socket.leave(socket.currentRoomCode);
        socket.currentRoomCode = null;
        socket.currentRoomId = null;
    } catch (err) {
        logger.error('handleLeaveRoom error', { error: err.message });
    }
}

async function createSystemMessage(warRoomId, message) {
    try {
        // Enforce limit
        const count = await WarRoomMessage.countDocuments({ warRoomId });
        if (count >= CHAT_LIMIT) {
            const oldest = await WarRoomMessage.findOne({ warRoomId }).sort({
                createdAt: 1,
            });
            if (oldest) await oldest.deleteOne();
        }

        return WarRoomMessage.create({
            warRoomId,
            username: 'System',
            message,
            type: 'system',
        });
    } catch (err) {
        logger.error('createSystemMessage error', { error: err.message });
    }
}

async function autoSubmitRound(quizId, roomId, roomCode, warRoomNs) {
    try {
        // Auto-submit any in-progress attempts
        const pendingAttempts = await WarRoomAttempt.find({
            warRoomQuizId: quizId,
            status: 'in-progress',
        });

        for (const attempt of pendingAttempts) {
            attempt.status = 'auto-submitted';
            attempt.completedAt = new Date();
            await attempt.save();
        }

        if (pendingAttempts.length > 0) {
            await finalizeRound(quizId, roomId, roomCode, warRoomNs);
        }
    } catch (err) {
        logger.error('autoSubmitRound error', { error: err.message });
    }
}

async function finalizeRound(quizId, roomId, roomCode, warRoomNs) {
    try {
        const quiz = await WarRoomQuiz.findById(quizId);
        if (!quiz || quiz.status === 'completed') return;

        const attempts = await WarRoomAttempt.find({
            warRoomQuizId: quizId,
        }).populate('userId', 'username profilePicture');

        // Calculate rankings — sort by score desc, then by totalTime asc (faster wins)
        const sorted = attempts.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.totalTime - b.totalTime;
        });

        const results = sorted.map((a, idx) => ({
            userId: a.userId._id || a.userId,
            username: a.userId.username || 'Unknown',
            profilePicture: a.userId.profilePicture || '',
            score: a.score,
            correctAnswers: a.correctAnswers,
            totalTime: a.totalTime,
            percentage: a.percentage,
            rank: idx + 1,
        }));

        quiz.results = results;
        quiz.winnerId = results.length > 0 ? results[0].userId : null;
        quiz.status = 'completed';
        quiz.endedAt = new Date();
        await quiz.save();

        // Update room state
        const room = await WarRoom.findById(roomId);
        if (room) {
            room.status = 'finished';
            room.analytics.totalQuizzesPlayed += 1;
            room.lastActivityAt = new Date();
            await room.save();
        }

        await createSystemMessage(
            roomId,
            `Round ${quiz.roundNumber} complete! 🏆 Winner: ${results[0]?.username || 'No one'}`
        );

        // Include questions with answers for review
        const questionsWithAnswers = quiz.questions.map((q, idx) => ({
            index: idx,
            question: q.question,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
        }));

        warRoomNs.to(roomCode).emit('war-room:quiz-results', {
            quizId: quiz._id,
            roundNumber: quiz.roundNumber,
            results,
            winnerId: quiz.winnerId,
            questions: questionsWithAnswers,
        });
    } catch (err) {
        logger.error('finalizeRound error', { error: err.message });
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = initWarRoomSocket;

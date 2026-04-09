const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const AntiCheatService = require('./antiCheatService');
const AIService = require('./aiService');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../configs');
const logger = require('../utils/logger');

/**
 * Authenticate socket connections using the same JWT cookie used by REST API
 */
function authenticateSocket(socket, next) {
    try {
        const cookies = socket.handshake.headers.cookie || '';
        const tokenMatch = cookies
            .split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('access_token='));

        if (!tokenMatch) {
            return next(new Error('Authentication required'));
        }

        const token = decodeURIComponent(
            tokenMatch.substring('access_token='.length),
        );
        const payload = jwt.verify(token, JWT_SECRET);
        socket.userId = payload.id;
        next();
    } catch (err) {
        logger.error('Quiz socket auth failed', { error: err.message });
        next(new Error('Authentication failed'));
    }
}

/**
 * Initialize Quiz WebSocket handling
 */
function initQuizSocket(io) {
    const quizNs = io.of('/quiz');

    quizNs.use(authenticateSocket);

    quizNs.on('connection', async (socket) => {
        logger.info('Quiz socket connected', { userId: socket.userId });

        let user;
        try {
            user = await User.findById(socket.userId).select('username');
            if (!user) {
                socket.emit('quiz:error', { message: 'User not found' });
                socket.disconnect();
                return;
            }
        } catch (err) {
            logger.error('Quiz socket: Failed to load user', {
                error: err.message,
            });
            socket.disconnect();
            return;
        }

        // ─── START QUIZ ─────────────────────────────────────────
        socket.on('quiz:start', async ({ quizId }, callback) => {
            try {
                const quiz = await Quiz.findById(quizId);
                if (!quiz || quiz.status !== 'approved') {
                    return callback?.({
                        error: 'Quiz not found or not available',
                    });
                }

                if (quiz.creatorId.toString() === socket.userId) {
                    return callback?.({
                        error: 'You cannot attempt your own quiz',
                    });
                }

                // Check for existing in-progress attempt
                const existingAttempt = await QuizAttempt.findOne({
                    quizId,
                    userId: socket.userId,
                    status: 'in-progress',
                });

                if (existingAttempt) {
                    // Resume existing attempt
                    const timeRemaining =
                        quiz.duration * 1000 -
                        (Date.now() - existingAttempt.startTime.getTime());

                    if (timeRemaining <= 0) {
                        // Auto-submit expired attempt
                        existingAttempt.status = 'auto-submitted';
                        existingAttempt.endTime = new Date();
                        existingAttempt.duration =
                            Date.now() - existingAttempt.startTime.getTime();
                        await existingAttempt.save();
                        return callback?.({ error: 'Quiz time has expired' });
                    }

                    // Get current question
                    const currentQId =
                        existingAttempt.questionOrder[
                            existingAttempt.currentQuestionIndex
                        ];
                    const currentQuestion = currentQId
                        ? await Question.findById(currentQId).select(
                              '-correctAnswer -explanation',
                          )
                        : null;

                    socket.attemptId = existingAttempt._id.toString();
                    socket.quizId = quizId;

                    return callback?.({
                        success: true,
                        attemptId: existingAttempt._id,
                        currentQuestion,
                        currentQuestionIndex:
                            existingAttempt.currentQuestionIndex,
                        totalQuestions: existingAttempt.totalQuestions,
                        answeredCount: existingAttempt.answers.length,
                        timeRemaining: Math.max(timeRemaining, 0),
                        quizTitle: quiz.title,
                        resumed: true,
                    });
                }

                // Check paid quiz registration
                if (quiz.isPaid && quiz.price > 0) {
                    const registration =
                        quiz.participantManagement.registeredUsers.find(
                            (reg) =>
                                reg.userId.toString() ===
                                socket.userId.toString(),
                        );
                    if (!registration) {
                        return callback?.({
                            error: 'You must register for this quiz before starting',
                        });
                    }
                    if (registration.status === 'refunded') {
                        return callback?.({
                            error: 'Your registration was refunded',
                        });
                    }
                }

                // Check timing constraints
                if (quiz.startTime && new Date() < new Date(quiz.startTime)) {
                    return callback?.({ error: 'Quiz has not started yet' });
                }
                if (quiz.endTime && new Date() > new Date(quiz.endTime)) {
                    return callback?.({ error: 'Quiz has ended' });
                }

                // Build question order
                let questions = await Question.find({ quizId }).select('_id');
                let questionOrder = questions.map((q) => q._id);

                if (quiz.settings?.shuffleQuestions) {
                    for (let i = questionOrder.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [questionOrder[i], questionOrder[j]] = [
                            questionOrder[j],
                            questionOrder[i],
                        ];
                    }
                }

                // Create attempt
                const attempt = new QuizAttempt({
                    quizId,
                    userId: socket.userId,
                    totalQuestions: questionOrder.length,
                    questionOrder,
                    currentQuestionIndex: 0,
                    sessionData: {
                        ipAddress: socket.handshake.address,
                        userAgent: socket.handshake.headers['user-agent'] || '',
                    },
                    startTime: new Date(),
                });
                await attempt.save();

                // Update quiz analytics
                quiz.analytics.totalAttempts += 1;
                await quiz.save();

                socket.attemptId = attempt._id.toString();
                socket.quizId = quizId;

                // Get first question
                const firstQuestion = await Question.findById(
                    questionOrder[0],
                ).select('-correctAnswer -explanation');

                callback?.({
                    success: true,
                    attemptId: attempt._id,
                    currentQuestion: firstQuestion,
                    currentQuestionIndex: 0,
                    totalQuestions: questionOrder.length,
                    answeredCount: 0,
                    timeRemaining: quiz.duration * 1000,
                    quizTitle: quiz.title,
                });
            } catch (err) {
                logger.error('quiz:start error', { error: err.message });
                callback?.({ error: 'Failed to start quiz' });
            }
        });

        // ─── SUBMIT ANSWER ──────────────────────────────────────
        socket.on(
            'quiz:submit-answer',
            async (
                { attemptId, questionId, selectedOption, timeSpent },
                callback,
            ) => {
                try {
                    const attempt = await QuizAttempt.findOne({
                        _id: attemptId,
                        userId: socket.userId,
                        status: 'in-progress',
                    });
                    if (!attempt) {
                        return callback?.({
                            error: 'Attempt not found or already completed',
                        });
                    }

                    const quiz = await Quiz.findById(attempt.quizId);
                    const elapsed = Date.now() - attempt.startTime.getTime();
                    if (elapsed > quiz.duration * 1000) {
                        attempt.status = 'auto-submitted';
                        attempt.endTime = new Date();
                        attempt.duration = elapsed;
                        await attempt.save();
                        return callback?.({
                            error: 'Quiz time has expired',
                            expired: true,
                        });
                    }

                    // Validate correct question in sequence
                    const expectedQuestionId =
                        attempt.questionOrder[attempt.currentQuestionIndex];
                    if (
                        !expectedQuestionId ||
                        expectedQuestionId.toString() !== questionId
                    ) {
                        return callback?.({
                            error: 'Invalid question for current position',
                        });
                    }

                    // Check already answered
                    const alreadyAnswered = attempt.answers.find(
                        (a) => a.questionId.toString() === questionId,
                    );
                    if (alreadyAnswered) {
                        return callback?.({
                            error: 'Question already answered',
                        });
                    }

                    const question = await Question.findById(questionId);
                    if (!question) {
                        return callback?.({ error: 'Question not found' });
                    }

                    const isCorrect = question.correctAnswer === selectedOption;

                    attempt.answers.push({
                        questionId,
                        selectedAnswer: selectedOption,
                        isCorrect,
                        timeSpent: timeSpent || 0,
                        isSkipped:
                            selectedOption === null ||
                            selectedOption === undefined,
                    });

                    attempt.currentQuestionIndex += 1;
                    if (isCorrect) {
                        attempt.correctAnswers += 1;
                        attempt.score += question.points || 1;
                    }
                    await attempt.save();

                    const isLastQuestion =
                        attempt.currentQuestionIndex >=
                        attempt.questionOrder.length;

                    if (isLastQuestion) {
                        return callback?.({
                            success: true,
                            isComplete: true,
                            currentQuestionIndex: attempt.currentQuestionIndex,
                            answeredCount: attempt.answers.length,
                        });
                    }

                    // Get next question
                    const nextQId =
                        attempt.questionOrder[attempt.currentQuestionIndex];
                    const nextQuestion = await Question.findById(
                        nextQId,
                    ).select('-correctAnswer -explanation');
                    const timeRemainingMs =
                        quiz.duration * 1000 -
                        (Date.now() - attempt.startTime.getTime());

                    callback?.({
                        success: true,
                        isComplete: false,
                        currentQuestion: nextQuestion,
                        currentQuestionIndex: attempt.currentQuestionIndex,
                        answeredCount: attempt.answers.length,
                        timeRemaining: Math.max(timeRemainingMs, 0),
                    });
                } catch (err) {
                    logger.error('quiz:submit-answer error', {
                        error: err.message,
                    });
                    callback?.({ error: 'Failed to submit answer' });
                }
            },
        );

        // ─── REPORT VIOLATION ───────────────────────────────────
        socket.on(
            'quiz:violation',
            async ({ attemptId, type, details }, callback) => {
                try {
                    const attempt = await QuizAttempt.findOne({
                        _id: attemptId,
                        userId: socket.userId,
                    });
                    if (!attempt) {
                        return callback?.({ error: 'Attempt not found' });
                    }

                    const result = await AntiCheatService.recordViolation(
                        attemptId,
                        type,
                        details,
                    );

                    // If auto-submitted, notify client
                    if (result.autoSubmitted) {
                        socket.emit('quiz:auto-submitted', {
                            reason: 'Too many violations',
                            attemptId,
                        });
                    }

                    callback?.({
                        success: true,
                        violationCount: result.totalViolations,
                        autoSubmitted: result.autoSubmitted,
                    });
                } catch (err) {
                    logger.error('quiz:violation error', {
                        error: err.message,
                    });
                    callback?.({ error: 'Failed to record violation' });
                }
            },
        );

        // ─── FINISH QUIZ ────────────────────────────────────────
        socket.on('quiz:finish', async ({ attemptId }, callback) => {
            try {
                const attempt = await QuizAttempt.findOne({
                    _id: attemptId,
                    userId: socket.userId,
                }).populate('quizId');

                if (!attempt) {
                    return callback?.({ error: 'Attempt not found' });
                }
                if (attempt.status !== 'in-progress') {
                    return callback?.({ error: 'Attempt already completed' });
                }

                const questions = await Question.find({
                    quizId: attempt.quizId,
                });

                attempt.endTime = new Date();
                attempt.duration = Date.now() - attempt.startTime.getTime();
                attempt.status = 'completed';
                await attempt.save();

                // Validate for cheating
                const isValid =
                    await AntiCheatService.validateAttempt(attemptId);
                if (!isValid) {
                    attempt.status = 'auto-submitted';
                    await attempt.save();
                }

                // Update user analytics
                await User.findByIdAndUpdate(socket.userId, {
                    $inc: { 'analytics.quizzesAttempted': 1 },
                });

                // Update quiz analytics
                const quiz = await Quiz.findById(attempt.quizId);
                if (quiz) {
                    const newAverage =
                        (quiz.analytics.averageScore *
                            (quiz.analytics.totalAttempts - 1) +
                            attempt.score) /
                        quiz.analytics.totalAttempts;
                    quiz.analytics.averageScore = newAverage;
                    await quiz.save();
                }

                // Generate AI analysis
                let analysis = null;
                try {
                    analysis = await AIService.generateQuizAnalysis(
                        attempt,
                        questions,
                    );
                } catch (analysisError) {
                    logger.error('Failed to generate analysis', {
                        error: analysisError.message,
                    });
                }

                // Build detailed answers
                const answersWithDetails = attempt.answers.map((a) => {
                    const question = questions.find(
                        (q) =>
                            q._id.toString() ===
                            (a.questionId?.toString() || a.questionId),
                    );
                    return {
                        questionId: a.questionId,
                        selectedOption: a.selectedAnswer,
                        selectedAnswer: a.selectedAnswer,
                        isCorrect: a.isCorrect,
                        timeSpent: a.timeSpent,
                        question: question?.question,
                        options: question?.options,
                        correctAnswer: question?.correctAnswer,
                        explanation: question?.explanation,
                    };
                });

                callback?.({
                    success: true,
                    score: attempt.score,
                    correctAnswers: attempt.correctAnswers,
                    totalQuestions: attempt.totalQuestions,
                    percentage:
                        attempt.totalQuestions > 0
                            ? (attempt.correctAnswers /
                                  attempt.totalQuestions) *
                              100
                            : 0,
                    duration: attempt.duration,
                    isValid,
                    analysis,
                    answers: answersWithDetails,
                    status: attempt.status,
                });
            } catch (err) {
                logger.error('quiz:finish error', { error: err.message });
                callback?.({ error: 'Failed to finish quiz' });
            }
        });

        // ─── DISCONNECT ─────────────────────────────────────────
        socket.on('disconnect', () => {
            logger.info('Quiz socket disconnected', { userId: socket.userId });
        });
    });

    return quizNs;
}

module.exports = initQuizSocket;

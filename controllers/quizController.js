const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AIService = require('../services/aiService');
const AntiCheatService = require('../services/antiCheatService');
const mongoose = require('mongoose');

class QuizController {
    // Create quiz with AI generation
    async createQuiz(req, res) {
        try {
            const {
                title,
                description,
                topic,
                category,
                isPaid,
                price,
                duration,
                timeLimit,
                difficulty,
                difficultyLevel,
                generateWithAI,
                numQuestions,
                questions: manualQuestions,
                tags,
                settings,
                startTime,
                endTime,
                visibility,
            } = req.body;

            const userId = req.userId;

            // Map field names to match model
            const quizDuration = duration || timeLimit || 30;
            const quizDifficulty = difficulty || difficultyLevel || 'medium';

            // Clean up timing fields (convert empty strings to undefined)
            const cleanStartTime =
                startTime && startTime.trim() !== '' ? startTime : undefined;
            const cleanEndTime =
                endTime && endTime.trim() !== '' ? endTime : undefined;

            // Validate timing if provided
            if (cleanStartTime && cleanEndTime) {
                const start = new Date(cleanStartTime);
                const end = new Date(cleanEndTime);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid date format for start or end time',
                    });
                }

                if (start >= end) {
                    return res.status(400).json({
                        success: false,
                        message: 'End time must be after start time',
                    });
                }

                // Only check future dates for paid quizzes
                if (isPaid && start < new Date()) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Start time must be in the future for paid quizzes',
                    });
                }
            }

            // Create quiz document
            const quiz = new Quiz({
                title,
                description: description || '',
                topic,
                category: category || 'other',
                creatorId: userId,
                isPaid: isPaid || false,
                price: isPaid ? price : 0,
                duration: quizDuration,
                difficulty: quizDifficulty,
                totalQuestions:
                    numQuestions ||
                    (manualQuestions ? manualQuestions.length : 0),
                status: 'pending', // Set to pending by default for admin approval
                isAIGenerated: generateWithAI || false,
                tags: tags || [],
                startTime: cleanStartTime
                    ? new Date(cleanStartTime)
                    : undefined,
                endTime: cleanEndTime ? new Date(cleanEndTime) : undefined,
                visibility: visibility || 'public',
                settings: {
                    allowReview: settings?.allowReview ?? true,
                    showResults: settings?.showResults ?? true,
                    shuffleQuestions: settings?.shuffleQuestions ?? false,
                    allowSkipQuestions: settings?.allowSkipQuestions ?? true,
                    antiCheat: {
                        enableTabSwitchDetection:
                            settings?.antiCheat?.enableTabSwitchDetection ??
                            settings?.antiCheat?.detectTabSwitch ??
                            true,
                        maxTabSwitches:
                            settings?.antiCheat?.maxTabSwitches ?? 3,
                        enableTimeLimit:
                            settings?.antiCheat?.enableTimeLimit ??
                            settings?.antiCheat?.timeLimit ??
                            true,
                        autoSubmitOnViolation:
                            settings?.antiCheat?.autoSubmitOnViolation ?? true,
                        preventCopyPaste:
                            settings?.antiCheat?.preventCopyPaste ??
                            settings?.antiCheat?.detectCopyPaste ??
                            true,
                        preventRightClick:
                            settings?.antiCheat?.preventRightClick ?? true,
                        enableFullScreen:
                            settings?.antiCheat?.enableFullScreen ?? false,
                    },
                },
            });

            await quiz.save();

            let questions = [];
            let suggestedCategory = category; // Start with provided category

            if (generateWithAI && numQuestions) {
                try {
                    // Generate questions with AI
                    const aiResult = await AIService.generateQuizQuestions(
                        topic,
                        numQuestions,
                        quizDifficulty,
                        category
                    );

                    // Use suggested category if category wasn't provided
                    if (!category && aiResult.suggestedCategory) {
                        suggestedCategory = aiResult.suggestedCategory;
                        quiz.category = suggestedCategory; // Update quiz with suggested category
                    }

                    for (const qData of aiResult.questions) {
                        const question = new Question({
                            ...qData,
                            quizId: quiz._id,
                            createdBy: userId,
                            isAIGenerated: true,
                        });
                        await question.save();
                        questions.push(question);
                    }

                    // Update quiz with actual question count
                    quiz.totalQuestions = questions.length;
                    await quiz.save();
                } catch (aiError) {
                    console.error('AI Generation failed:', aiError);
                    // Continue without AI questions, user can add manually
                }
            } else if (manualQuestions && manualQuestions.length > 0) {
                // Save manual questions
                for (const qData of manualQuestions) {
                    const question = new Question({
                        question: qData.question,
                        options: qData.options,
                        correctAnswer: qData.correctAnswer,
                        explanation: qData.explanation || '',
                        type: qData.type || 'multiple-choice',
                        difficulty: qData.difficulty || quizDifficulty,
                        topic,
                        points:
                            qData.points ||
                            (difficulty === 'easy'
                                ? 1
                                : difficulty === 'medium'
                                ? 2
                                : 3),
                        timeLimit: qData.timeLimit || 30,
                        quizId: quiz._id,
                        createdBy: userId,
                    });
                    await question.save();
                    questions.push(question);
                }
            }

            // Update user analytics
            await User.findByIdAndUpdate(userId, {
                $inc: { 'analytics.quizzesCreated': 1 },
            });

            res.status(201).json({
                success: true,
                data: {
                    quiz,
                    questions,
                    suggestedCategory, // Include the AI-suggested category for frontend
                },
                message: 'Quiz created successfully',
            });
        } catch (error) {
            console.error('Create quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create quiz',
                error:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined,
            });
        }
    }

    // Get quiz by ID with questions
    async getQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;

            const quiz = await Quiz.findById(quizId)
                .populate('creatorId', 'username email')
                .lean();

            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            // Check if quiz is accessible

            if (
                quiz.status !== 'approved' &&
                quiz.creatorId._id.toString() !== userId
            ) {
                return res.status(403).json({
                    success: false,
                    message: 'Quiz not available',
                });
            }

            // Get questions (hide correct answers for non-creators)
            let questions = await Question.find({ quizId }).lean();

            if (quiz.creatorId._id.toString() !== userId) {
                questions = questions.map((q) => ({
                    _id: q._id,
                    question: q.question,
                    options: q.options,
                    type: q.type,
                    timeLimit: q.timeLimit,
                    points: q.points,
                }));
            }

            // Check if user has already attempted
            let userAttempt = null;
            if (userId) {
                userAttempt = await QuizAttempt.findOne({
                    quizId,
                    userId,
                    status: { $in: ['completed', 'auto-submitted'] },
                }).select('score correctAnswers totalQuestions createdAt');
            }

            res.json({
                success: true,
                data: {
                    quiz,
                    questions,
                    userAttempt,
                    hasAccess:
                        !quiz.isPaid ||
                        userAttempt ||
                        quiz.creatorId._id.toString() === userId,
                },
            });
        } catch (error) {
            console.error('Get quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch quiz',
            });
        }
    }

    // Submit quiz for approval
    async submitForApproval(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (quiz.status !== 'draft') {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz already submitted or published',
                });
            }

            // Check if quiz has questions
            const questionCount = await Question.countDocuments({ quizId });
            if (questionCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Quiz must have at least one question',
                });
            }

            quiz.status = 'pending';
            await quiz.save();

            res.json({
                success: true,
                message: 'Quiz submitted for approval',
            });
        } catch (error) {
            console.error('Submit quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit quiz',
            });
        }
    }

    // Start quiz attempt
    async startAttempt(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;
            const userAgent = req.get('User-Agent') || '';
            const ipAddress = req.ip || req.connection.remoteAddress;

            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status !== 'approved') {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found or not available',
                });
            }

            // Check if user already has an in-progress attempt
            const existingAttempt = await QuizAttempt.findOne({
                quizId,
                userId,
                status: 'in-progress',
            });

            if (existingAttempt) {
                const questions = await Question.find({ quizId }).select(
                    '-correctAnswer -explanation'
                );
                return res.json({
                    success: true,
                    data: {
                        attemptId: existingAttempt._id,
                        questions,
                        timeRemaining:
                            quiz.duration * 60 * 1000 -
                            (Date.now() - existingAttempt.startTime.getTime()),
                    },
                    message: 'Resuming existing attempt',
                });
            }

            // Handle payment for paid quizzes
            if (quiz.isPaid && quiz.price > 0) {
                const user = await User.findById(userId);
                if (!user || user.wallet.balance < quiz.price) {
                    return res.status(402).json({
                        success: false,
                        message: 'Insufficient wallet balance',
                        required: quiz.price,
                        available: user?.wallet.balance || 0,
                    });
                }

                // Start transaction session
                const session = await mongoose.startSession();
                await session.withTransaction(async () => {
                    // Deduct amount from wallet
                    user.wallet.balance -= quiz.price;
                    user.wallet.totalSpent += quiz.price;
                    await user.save({ session });

                    // Create transaction record
                    const transaction = new Transaction({
                        userId,
                        type: 'payment',
                        amount: quiz.price,
                        description: `Payment for quiz: ${quiz.title}`,
                        status: 'completed',
                        relatedQuizId: quizId,
                        paymentMethod: 'wallet',
                    });
                    await transaction.save({ session });

                    // Credit creator
                    const creator = await User.findById(quiz.creatorId);
                    if (creator) {
                        const creatorEarning = quiz.price * 0.7; // 70% to creator, 30% platform fee
                        creator.wallet.balance += creatorEarning;
                        creator.wallet.totalEarned += creatorEarning;
                        creator.analytics.totalEarnings += creatorEarning;
                        await creator.save({ session });

                        // Create earning transaction
                        const earningTransaction = new Transaction({
                            userId: creator._id,
                            type: 'earning',
                            amount: creatorEarning,
                            description: `Earning from quiz: ${quiz.title}`,
                            status: 'completed',
                            relatedQuizId: quizId,
                            paymentMethod: 'wallet',
                        });
                        await earningTransaction.save({ session });
                    }
                });
                await session.endSession();
            }

            // Create quiz attempt
            const attempt = new QuizAttempt({
                quizId,
                userId,
                totalQuestions: quiz.totalQuestions,
                sessionData: {
                    ipAddress,
                    userAgent,
                },
                startTime: new Date(),
            });

            await attempt.save();

            // Update quiz analytics
            quiz.analytics.totalAttempts += 1;
            await quiz.save();

            // Get questions without correct answers
            const questions = await Question.find({ quizId }).select(
                '-correctAnswer -explanation'
            );

            res.json({
                success: true,
                data: {
                    attemptId: attempt._id,
                    questions,
                    timeLimit: quiz.duration * 60 * 1000, // Convert to milliseconds
                    settings: quiz.settings,
                },
                message: 'Quiz attempt started',
            });
        } catch (error) {
            console.error('Start attempt error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to start quiz attempt',
            });
        }
    }

    // Record anti-cheat violation
    async recordViolation(req, res) {
        try {
            const { attemptId } = req.params;
            const { type, details } = req.body;
            const userId = req.userId;

            // Verify attempt belongs to user
            const attempt = await QuizAttempt.findOne({
                _id: attemptId,
                userId,
            });
            if (!attempt) {
                return res.status(404).json({
                    success: false,
                    message: 'Attempt not found',
                });
            }

            const updatedAttempt = await AntiCheatService.recordViolation(
                attemptId,
                type,
                details
            );

            res.json({
                success: true,
                data: {
                    status: updatedAttempt.status,
                    violationCount: updatedAttempt.antiCheatViolations.length,
                    autoSubmitted: updatedAttempt.status === 'auto-submitted',
                },
                message: 'Violation recorded',
            });
        } catch (error) {
            console.error('Record violation error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to record violation',
            });
        }
    }

    // Submit quiz attempt
    async submitAttempt(req, res) {
        try {
            const { attemptId } = req.params;
            const { answers } = req.body;
            const userId = req.userId;

            const attempt = await QuizAttempt.findOne({
                _id: attemptId,
                userId,
            }).populate('quizId');

            if (!attempt) {
                return res.status(404).json({
                    success: false,
                    message: 'Attempt not found',
                });
            }

            if (attempt.status !== 'in-progress') {
                return res.status(400).json({
                    success: false,
                    message: 'Attempt already completed',
                });
            }

            // Get questions and calculate score
            const questions = await Question.find({ quizId: attempt.quizId });
            let correctAnswers = 0;
            let totalScore = 0;

            const processedAnswers = answers.map((answer) => {
                const question = questions.find(
                    (q) => q._id.toString() === answer.questionId
                );
                const isCorrect =
                    question?.correctAnswer === answer.selectedOption;

                if (isCorrect) {
                    correctAnswers += 1;
                    totalScore += question?.points || 1;
                }

                return {
                    questionId: answer.questionId,
                    selectedOption: answer.selectedOption,
                    isCorrect,
                    timeSpent: answer.timeSpent || 0,
                };
            });

            // Update attempt
            attempt.answers = processedAnswers;
            attempt.correctAnswers = correctAnswers;
            attempt.score = totalScore;
            attempt.endTime = new Date();
            attempt.duration = Date.now() - attempt.startTime.getTime();
            attempt.status = 'completed';

            await attempt.save();

            // Validate attempt for cheating
            const isValid = await AntiCheatService.validateAttempt(attemptId);
            if (!isValid) {
                attempt.status = 'auto-submitted';
                await attempt.save();
            }

            // Update user analytics
            await User.findByIdAndUpdate(userId, {
                $inc: { 'analytics.quizzesAttempted': 1 },
            });

            // Update quiz analytics
            const quiz = await Quiz.findById(attempt.quizId);
            if (quiz) {
                const newAverage =
                    (quiz.analytics.averageScore *
                        (quiz.analytics.totalAttempts - 1) +
                        totalScore) /
                    quiz.analytics.totalAttempts;
                quiz.analytics.averageScore = newAverage;
                await quiz.save();
            }

            // Generate AI analysis
            let analysis = null;
            try {
                analysis = await AIService.generateQuizAnalysis(
                    attempt,
                    questions
                );
            } catch (analysisError) {
                console.error('Failed to generate analysis:', analysisError);
            }

            res.json({
                success: true,
                data: {
                    score: totalScore,
                    correctAnswers,
                    totalQuestions: attempt.totalQuestions,
                    percentage: (correctAnswers / attempt.totalQuestions) * 100,
                    duration: attempt.duration,
                    isValid,
                    analysis,
                    answers: attempt.settings?.showResults
                        ? processedAnswers.map((a) => {
                              const question = questions.find(
                                  (q) => q._id.toString() === a.questionId
                              );
                              return {
                                  ...a,
                                  question: question?.question,
                                  options: question?.options,
                                  correctAnswer: question?.correctAnswer,
                                  explanation: question?.explanation,
                              };
                          })
                        : null,
                },
                message: 'Quiz submitted successfully',
            });
        } catch (error) {
            console.error('Submit attempt error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit quiz',
            });
        }
    }

    // Get user's quiz attempts
    async getUserAttempts(req, res) {
        try {
            const userId = req.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const attempts = await QuizAttempt.find({ userId })
                .populate('quizId', 'title topic difficulty')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await QuizAttempt.countDocuments({ userId });

            res.json({
                success: true,
                data: {
                    attempts,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get user attempts error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch attempts',
            });
        }
    }

    // Get public quizzes
    async getPublicQuizzes(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 12;
            const skip = (page - 1) * limit;
            const { topic, difficulty, isPaid, search } = req.query;

            // Build filter
            const filter = { status: 'approved' };

            if (topic) filter.topic = { $regex: topic, $options: 'i' };
            if (difficulty) filter.difficulty = difficulty;
            if (isPaid !== undefined) filter.isPaid = isPaid === 'true';
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                    { topic: { $regex: search, $options: 'i' } },
                ];
            }

            const quizzes = await Quiz.find(filter)
                .populate('creatorId', 'username')
                .select('-settings')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Quiz.countDocuments(filter);

            res.json({
                success: true,
                data: {
                    quizzes,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get public quizzes error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch quizzes',
            });
        }
    }

    // Get quiz attempt details with analysis
    async getAttemptAnalysis(req, res) {
        try {
            const { attemptId } = req.params;
            const userId = req.userId;

            const attempt = await QuizAttempt.findOne({
                _id: attemptId,
                userId,
                status: { $in: ['completed', 'auto-submitted'] },
            }).populate('quizId');

            if (!attempt) {
                return res.status(404).json({
                    success: false,
                    message: 'Attempt not found',
                });
            }

            const questions = await Question.find({ quizId: attempt.quizId });

            // Generate fresh analysis if not already done
            let analysis = null;
            try {
                analysis = await AIService.generateQuizAnalysis(
                    attempt,
                    questions
                );
            } catch (analysisError) {
                console.error('Failed to generate analysis:', analysisError);
            }

            const detailedAnswers = attempt.answers.map((a) => {
                const question = questions.find(
                    (q) => q._id.toString() === a.questionId.toString()
                );
                return {
                    ...a,
                    question: question?.question,
                    options: question?.options,
                    correctAnswer: question?.correctAnswer,
                    explanation: question?.explanation,
                };
            });

            res.json({
                success: true,
                data: {
                    attempt,
                    analysis,
                    detailedAnswers,
                    quiz: attempt.quizId,
                },
            });
        } catch (error) {
            console.error('Get attempt analysis error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch attempt analysis',
            });
        }
    }

    // Get user's own quizzes
    async getUserQuizzes(req, res) {
        try {
            const userId = req.userId;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const { status } = req.query;

            const filter = { creatorId: userId };
            if (status) filter.status = status;

            const quizzes = await Quiz.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Quiz.countDocuments(filter);

            // Get question counts for each quiz
            const quizzesWithDetails = await Promise.all(
                quizzes.map(async (quiz) => {
                    const questionCount = await Question.countDocuments({
                        quizId: quiz._id,
                    });
                    return { ...quiz, questionCount };
                })
            );

            res.json({
                success: true,
                data: {
                    quizzes: quizzesWithDetails,
                    pagination: {
                        current: page,
                        total: Math.ceil(total / limit),
                        hasNext: skip + limit < total,
                        hasPrev: page > 1,
                    },
                },
            });
        } catch (error) {
            console.error('Get user quizzes error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch your quizzes',
            });
        }
    }

    // Update quiz
    async updateQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;
            const updates = req.body;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            // Only allow updates to draft quizzes or rejected quizzes
            if (!['draft', 'rejected'].includes(quiz.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot update quiz that is pending or approved',
                });
            }

            // Filter allowed updates
            const allowedUpdates = [
                'title',
                'description',
                'topic',
                'isPaid',
                'price',
                'duration',
                'difficulty',
                'tags',
                'settings',
            ];
            const filteredUpdates = {};

            Object.keys(updates).forEach((key) => {
                if (allowedUpdates.includes(key)) {
                    filteredUpdates[key] = updates[key];
                }
            });

            // Reset status to draft if it was rejected
            if (quiz.status === 'rejected') {
                filteredUpdates.status = 'draft';
                filteredUpdates.rejectionReason = null;
            }

            const updatedQuiz = await Quiz.findByIdAndUpdate(
                quizId,
                filteredUpdates,
                { new: true, runValidators: true }
            );

            res.json({
                success: true,
                data: { quiz: updatedQuiz },
                message: 'Quiz updated successfully',
            });
        } catch (error) {
            console.error('Update quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update quiz',
            });
        }
    }

    // Delete quiz
    async deleteQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
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
            await Question.deleteMany({ quizId });

            // Delete quiz
            await Quiz.findByIdAndDelete(quizId);

            // Update user analytics
            await User.findByIdAndUpdate(userId, {
                $inc: { 'analytics.quizzesCreated': -1 },
            });

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

    // Add question to quiz
    async addQuestion(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;
            const {
                text,
                options,
                correctAnswer,
                explanation,
                difficultyLevel,
                tags,
            } = req.body;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (!['draft', 'rejected'].includes(quiz.status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Cannot add questions to quiz that is pending or approved',
                });
            }

            const question = new Question({
                text,
                options,
                correctAnswer,
                explanation,
                difficultyLevel: difficultyLevel || quiz.difficultyLevel,
                tags: tags || [],
                quizId,
                createdBy: userId,
                points:
                    difficultyLevel === 'easy'
                        ? 1
                        : difficultyLevel === 'medium'
                        ? 2
                        : 3,
            });

            await question.save();

            // Update quiz total questions count
            await Quiz.findByIdAndUpdate(quizId, {
                $inc: { totalQuestions: 1 },
            });

            res.status(201).json({
                success: true,
                data: { question },
                message: 'Question added successfully',
            });
        } catch (error) {
            console.error('Add question error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add question',
            });
        }
    }

    // Update question
    async updateQuestion(req, res) {
        try {
            const { quizId, questionId } = req.params;
            const userId = req.userId;
            const updates = req.body;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (!['draft', 'rejected'].includes(quiz.status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Cannot update questions in quiz that is pending or approved',
                });
            }

            const question = await Question.findOne({
                _id: questionId,
                quizId,
            });
            if (!question) {
                return res.status(404).json({
                    success: false,
                    message: 'Question not found',
                });
            }

            const allowedUpdates = [
                'text',
                'options',
                'correctAnswer',
                'explanation',
                'difficultyLevel',
                'tags',
            ];
            const filteredUpdates = {};

            Object.keys(updates).forEach((key) => {
                if (allowedUpdates.includes(key)) {
                    filteredUpdates[key] = updates[key];
                }
            });

            const updatedQuestion = await Question.findByIdAndUpdate(
                questionId,
                filteredUpdates,
                { new: true, runValidators: true }
            );

            res.json({
                success: true,
                data: { question: updatedQuestion },
                message: 'Question updated successfully',
            });
        } catch (error) {
            console.error('Update question error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update question',
            });
        }
    }

    // Delete question
    async deleteQuestion(req, res) {
        try {
            const { quizId, questionId } = req.params;
            const userId = req.userId;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (!['draft', 'rejected'].includes(quiz.status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Cannot delete questions from quiz that is pending or approved',
                });
            }

            const question = await Question.findOne({
                _id: questionId,
                quizId,
            });
            if (!question) {
                return res.status(404).json({
                    success: false,
                    message: 'Question not found',
                });
            }

            await Question.findByIdAndDelete(questionId);

            // Update quiz total questions count
            await Quiz.findByIdAndUpdate(quizId, {
                $inc: { totalQuestions: -1 },
            });

            res.json({
                success: true,
                message: 'Question deleted successfully',
            });
        } catch (error) {
            console.error('Delete question error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete question',
            });
        }
    }

    // Generate questions with AI
    async generateQuestions(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;
            const { count, difficulty, topic, category } = req.body;

            const quiz = await Quiz.findOne({ _id: quizId, creatorId: userId });
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            if (!['draft', 'rejected'].includes(quiz.status)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Cannot generate questions for quiz that is pending or approved',
                });
            }

            try {
                // Generate questions with AI
                const aiQuestions = await AIService.generateQuizQuestions(
                    topic || quiz.topic,
                    count,
                    difficulty || quiz.difficultyLevel,
                    category || quiz.category
                );

                const questions = [];
                for (const qData of aiQuestions) {
                    const question = new Question({
                        ...qData,
                        quizId: quiz._id,
                        createdBy: userId,
                        difficultyLevel: difficulty || quiz.difficultyLevel,
                        isAIGenerated: true,
                    });
                    await question.save();
                    questions.push(question);
                }

                // Update quiz total questions count
                await Quiz.findByIdAndUpdate(quizId, {
                    $inc: { totalQuestions: count },
                    isAIGenerated: true,
                });

                res.status(201).json({
                    success: true,
                    data: { questions, count: questions.length },
                    message: 'Questions generated successfully',
                });
            } catch (aiError) {
                console.error('AI Generation failed:', aiError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to generate questions with AI',
                    error:
                        process.env.NODE_ENV === 'development'
                            ? aiError.message
                            : undefined,
                });
            }
        } catch (error) {
            console.error('Generate questions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate questions',
            });
        }
    }

    // Generate questions preview without creating quiz (for form population)
    async generateQuestionsPreview(req, res) {
        try {
            const { topic, numQuestions, difficulty, category } = req.body;

            if (!topic || !topic.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Topic is required',
                });
            }

            const questionCount = numQuestions || 5;
            const questionDifficulty = difficulty || 'medium';

            // Generate questions using AI
            const aiResult = await AIService.generateQuizQuestions(
                topic,
                questionCount,
                questionDifficulty,
                category
            );

            // Generate smart title and description
            const suggestedTitle = `${
                topic.charAt(0).toUpperCase() + topic.slice(1)
            } Quiz`;
            const suggestedDescription = `Test your knowledge on ${topic} with this ${questionDifficulty} level quiz featuring ${questionCount} carefully crafted questions.`;

            res.json({
                success: true,
                data: {
                    questions: aiResult.questions,
                    suggestedCategory: aiResult.suggestedCategory,
                    suggestedTitle: suggestedTitle,
                    suggestedDescription: suggestedDescription,
                },
                message: `Generated ${aiResult.questions.length} questions successfully`,
            });
        } catch (error) {
            console.error('Generate questions preview error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate questions',
                error:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined,
            });
        }
    }
}

module.exports = new QuizController();

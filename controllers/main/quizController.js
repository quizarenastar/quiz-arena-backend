const Quiz = require('../../models/Quiz');
const Question = require('../../models/Question');
const QuizAttempt = require('../../models/QuizAttempt');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const AIService = require('../../services/aiService');
const AntiCheatService = require('../../services/antiCheatService');
const prizeDistributionService = require('../../services/prizeDistributionService');
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
                        category,
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

            // ── AI Auto-Moderation ──────────────────────────────────────────
            // Run AI review after all questions are saved.
            // We do this non-awaited so it doesn't delay the API response,
            // but we still want the result before responding.
            let aiReview = null;
            if (questions.length > 0) {
                try {
                    aiReview = await AIService.reviewQuizForApproval(
                        quiz,
                        questions,
                    );
                    if (aiReview.approved) {
                        quiz.status = 'approved';
                    }
                    // Store review metadata on quiz (add field if model supports it)
                    quiz.set('aiReview', {
                        score: aiReview.score,
                        reason: aiReview.reason,
                        reviewedAt: new Date(),
                    });
                    await quiz.save();
                } catch (reviewError) {
                    console.error('AI moderation step failed:', reviewError);
                    // Keep status as pending — admin will review manually
                }
            }
            // ────────────────────────────────────────────────────────────────

            // Update user analytics
            await User.findByIdAndUpdate(userId, {
                $inc: { 'analytics.quizzesCreated': 1 },
            });

            res.status(201).json({
                success: true,
                data: {
                    quiz,
                    questions,
                    suggestedCategory,
                    aiReview: aiReview
                        ? {
                              approved: aiReview.approved,
                              reason: aiReview.reason,
                              score: aiReview.score,
                          }
                        : null,
                },
                message: aiReview?.approved
                    ? 'Quiz created and approved automatically ✓'
                    : 'Quiz created and submitted for review',
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

    // Register for paid quiz (escrow payment before quiz starts)
    async registerForQuiz(req, res) {
        try {
            const { quizId } = req.params;
            const userId = req.userId;

            const quiz = await Quiz.findById(quizId);
            if (!quiz || quiz.status !== 'approved') {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found or not available',
                });
            }

            // Only paid quizzes require registration
            if (!quiz.isPaid) {
                return res.status(400).json({
                    success: false,
                    message: 'This is a free quiz, no registration required',
                });
            }

            // // Check if quiz has been cancelled
            // if (quiz.status === 'cancelled') {
            //     return res.status(400).json({
            //         success: false,
            //         message: 'This quiz has been cancelled',
            //     });
            // }

            // Check if start time has passed
            if (quiz.startTime && new Date() >= new Date(quiz.startTime)) {
                return res.status(400).json({
                    success: false,
                    message: 'Registration is closed, quiz has already started',
                });
            }

            // Check if user already registered
            const alreadyRegistered =
                quiz.participantManagement.registeredUsers.find(
                    (reg) => reg.userId.toString() === userId.toString(),
                );
            if (alreadyRegistered) {
                return res.status(400).json({
                    success: false,
                    message: 'You are already registered for this quiz',
                    registration: alreadyRegistered,
                });
            }

            // Process payment (held in escrow)
            const user = await User.findById(userId);
            if (!user || user.wallet.balance < quiz.price) {
                return res.status(402).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: quiz.price,
                    available: user?.wallet.balance || 0,
                });
            }

            const session = await mongoose.startSession();
            let registration = null;
            let transaction = null;

            await session.withTransaction(async () => {
                const userBalanceBefore = user.wallet.balance;

                // Deduct amount from wallet (held in escrow)
                user.wallet.balance -= quiz.price;
                user.wallet.totalSpent += quiz.price;
                await user.save({ session });

                // Create transaction record (payment in escrow)
                transaction = new Transaction({
                    userId,
                    type: 'payment',
                    amount: quiz.price,
                    description: `Registration for quiz: ${quiz.title}`,
                    status: 'completed',
                    relatedQuizId: quizId,
                    paymentMethod: 'wallet',
                    balanceBefore: userBalanceBefore,
                    balanceAfter: user.wallet.balance,
                    metadata: {
                        isEscrow: true,
                        note: 'Payment held until quiz completion or cancellation',
                    },
                });
                await transaction.save({ session });

                // Add user to registered users
                quiz.participantManagement.registeredUsers.push({
                    userId: userId,
                    registeredAt: new Date(),
                    status: 'paid',
                    paymentId: transaction._id,
                });

                // Update participant count
                quiz.participantManagement.participantCount += 1;

                // Update prize pool total
                quiz.prizePool.totalAmount =
                    quiz.participantManagement.participantCount * quiz.price;

                await quiz.save({ session });

                registration =
                    quiz.participantManagement.registeredUsers[
                        quiz.participantManagement.registeredUsers.length - 1
                    ];
            });

            await session.endSession();

            res.json({
                success: true,
                message: 'Successfully registered for quiz',
                data: {
                    registration: {
                        quizId: quiz._id,
                        quizTitle: quiz.title,
                        registeredAt: registration.registeredAt,
                        amount: quiz.price,
                        startTime: quiz.startTime,
                        participantCount:
                            quiz.participantManagement.participantCount,
                        transactionId: transaction._id,
                    },
                },
            });
        } catch (error) {
            console.error('Register for quiz error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to register for quiz',
            });
        }
    }

    // Start quiz attempt — returns only the FIRST question
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
                const timeRemaining =
                    quiz.duration * 1000 -
                    (Date.now() - existingAttempt.startTime.getTime());

                // Get current question from the stored order
                const currentIdx = existingAttempt.currentQuestionIndex;
                const questionId = existingAttempt.questionOrder[currentIdx];
                const currentQuestion = questionId
                    ? await Question.findById(questionId).select(
                          '-correctAnswer -explanation',
                      )
                    : null;

                return res.json({
                    success: true,
                    data: {
                        attemptId: existingAttempt._id,
                        currentQuestion,
                        currentQuestionIndex: currentIdx,
                        totalQuestions: existingAttempt.totalQuestions,
                        answeredCount: existingAttempt.answers.length,
                        timeLimit: Math.max(timeRemaining, 0),
                        timeRemaining: Math.max(timeRemaining, 0),
                        settings: quiz.settings,
                    },
                    message: 'Resuming existing attempt',
                });
            }

            // Handle payment for paid quizzes - CHECK REGISTRATION INSTEAD
            if (quiz.isPaid && quiz.price > 0) {
                const registration =
                    quiz.participantManagement.registeredUsers.find(
                        (reg) => reg.userId.toString() === userId.toString(),
                    );

                if (!registration) {
                    return res.status(402).json({
                        success: false,
                        message:
                            'You must register for this quiz before starting',
                        action: 'register_required',
                    });
                }

                if (registration.status === 'refunded') {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Your registration was refunded (quiz cancelled)',
                    });
                }
            }

            // Check if quiz has a scheduled start time and hasn't started yet
            if (quiz.startTime) {
                const now = new Date();
                const startTime = new Date(quiz.startTime);

                if (now < startTime) {
                    return res.status(400).json({
                        success: false,
                        message: 'Quiz has not started yet',
                        startTime: quiz.startTime,
                        timeRemaining: startTime - now,
                    });
                }
            }

            // Check if quiz has ended
            if (quiz.endTime) {
                const now = new Date();
                const endTime = new Date(quiz.endTime);

                if (now > endTime) {
                    return res.status(400).json({
                        success: false,
                        message: 'Quiz has ended',
                        endTime: quiz.endTime,
                    });
                }
            }

            // Build question order (shuffle if setting enabled)
            let questions = await Question.find({ quizId }).select('_id');
            let questionOrder = questions.map((q) => q._id);

            if (quiz.settings?.shuffleQuestions) {
                // Fisher-Yates shuffle
                for (let i = questionOrder.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [questionOrder[i], questionOrder[j]] = [
                        questionOrder[j],
                        questionOrder[i],
                    ];
                }
            }

            // Create quiz attempt with question order
            const attempt = new QuizAttempt({
                quizId,
                userId,
                totalQuestions: questionOrder.length,
                questionOrder,
                currentQuestionIndex: 0,
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

            // Get only the FIRST question (without correct answer)
            const firstQuestion = await Question.findById(
                questionOrder[0],
            ).select('-correctAnswer -explanation');

            res.json({
                success: true,
                data: {
                    attemptId: attempt._id,
                    currentQuestion: firstQuestion,
                    currentQuestionIndex: 0,
                    totalQuestions: questionOrder.length,
                    answeredCount: 0,
                    timeLimit: quiz.duration * 1000,
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

    // Submit answer for a single question and get the next one
    async submitSingleAnswer(req, res) {
        try {
            const { attemptId } = req.params;
            const { questionId, selectedOption, timeSpent } = req.body;
            const userId = req.userId;

            const attempt = await QuizAttempt.findOne({
                _id: attemptId,
                userId,
                status: 'in-progress',
            });

            if (!attempt) {
                return res.status(404).json({
                    success: false,
                    message: 'Attempt not found or already completed',
                });
            }

            // Check if attempt has expired
            const quiz = await Quiz.findById(attempt.quizId);
            const elapsed = Date.now() - attempt.startTime.getTime();
            if (elapsed > quiz.duration * 1000) {
                attempt.status = 'auto-submitted';
                attempt.endTime = new Date();
                attempt.duration = elapsed;
                await attempt.save();
                return res.status(400).json({
                    success: false,
                    message: 'Quiz time has expired',
                    expired: true,
                });
            }

            // Validate this is the correct question in sequence
            const expectedQuestionId =
                attempt.questionOrder[attempt.currentQuestionIndex];
            if (
                !expectedQuestionId ||
                expectedQuestionId.toString() !== questionId
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid question for current position',
                });
            }

            // Check if already answered
            const alreadyAnswered = attempt.answers.find(
                (a) => a.questionId.toString() === questionId,
            );
            if (alreadyAnswered) {
                return res.status(400).json({
                    success: false,
                    message: 'Question already answered',
                });
            }

            // Get question to validate answer
            const question = await Question.findById(questionId);
            if (!question) {
                return res.status(404).json({
                    success: false,
                    message: 'Question not found',
                });
            }

            const isCorrect = question.correctAnswer === selectedOption;

            // Record the answer
            attempt.answers.push({
                questionId,
                selectedAnswer: selectedOption,
                isCorrect,
                timeSpent: timeSpent || 0,
                isSkipped:
                    selectedOption === null || selectedOption === undefined,
            });

            // Advance to next question
            attempt.currentQuestionIndex += 1;

            // Update running score
            if (isCorrect) {
                attempt.correctAnswers += 1;
                attempt.score += question.points || 1;
            }

            await attempt.save();

            // Check if there are more questions
            const isLastQuestion =
                attempt.currentQuestionIndex >= attempt.questionOrder.length;

            if (isLastQuestion) {
                // No more questions — return signal to submit
                return res.json({
                    success: true,
                    data: {
                        currentQuestion: null,
                        currentQuestionIndex: attempt.currentQuestionIndex,
                        totalQuestions: attempt.totalQuestions,
                        answeredCount: attempt.answers.length,
                        isComplete: true,
                    },
                    message: 'All questions answered',
                });
            }

            // Get the next question
            const nextQuestionId =
                attempt.questionOrder[attempt.currentQuestionIndex];
            const nextQuestion = await Question.findById(nextQuestionId).select(
                '-correctAnswer -explanation',
            );

            // Calculate remaining time
            const timeRemaining =
                quiz.duration * 1000 -
                (Date.now() - attempt.startTime.getTime());

            res.json({
                success: true,
                data: {
                    currentQuestion: nextQuestion,
                    currentQuestionIndex: attempt.currentQuestionIndex,
                    totalQuestions: attempt.totalQuestions,
                    answeredCount: attempt.answers.length,
                    isComplete: false,
                    timeRemaining: Math.max(timeRemaining, 0),
                },
                message: 'Answer recorded, next question loaded',
            });
        } catch (error) {
            console.error('Submit single answer error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to submit answer',
            });
        }
    }

    // Get the current question for an in-progress attempt
    async getNextQuestion(req, res) {
        try {
            const { attemptId } = req.params;
            const userId = req.userId;

            const attempt = await QuizAttempt.findOne({
                _id: attemptId,
                userId,
                status: 'in-progress',
            });

            if (!attempt) {
                return res.status(404).json({
                    success: false,
                    message: 'Attempt not found or already completed',
                });
            }

            // Check if attempt has expired
            const quiz = await Quiz.findById(attempt.quizId);
            const elapsed = Date.now() - attempt.startTime.getTime();
            if (elapsed > quiz.duration * 1000) {
                attempt.status = 'auto-submitted';
                attempt.endTime = new Date();
                attempt.duration = elapsed;
                await attempt.save();
                return res.status(400).json({
                    success: false,
                    message: 'Quiz time has expired',
                    expired: true,
                });
            }

            // Check if all questions are answered
            if (attempt.currentQuestionIndex >= attempt.questionOrder.length) {
                return res.json({
                    success: true,
                    data: {
                        currentQuestion: null,
                        currentQuestionIndex: attempt.currentQuestionIndex,
                        totalQuestions: attempt.totalQuestions,
                        answeredCount: attempt.answers.length,
                        isComplete: true,
                    },
                    message: 'All questions answered',
                });
            }

            const questionId =
                attempt.questionOrder[attempt.currentQuestionIndex];
            const question = await Question.findById(questionId).select(
                '-correctAnswer -explanation',
            );

            const timeRemaining =
                quiz.duration * 1000 -
                (Date.now() - attempt.startTime.getTime());

            res.json({
                success: true,
                data: {
                    currentQuestion: question,
                    currentQuestionIndex: attempt.currentQuestionIndex,
                    totalQuestions: attempt.totalQuestions,
                    answeredCount: attempt.answers.length,
                    isComplete: false,
                    timeRemaining: Math.max(timeRemaining, 0),
                },
            });
        } catch (error) {
            console.error('Get next question error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get next question',
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
                details,
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

            if (answers && answers.length > 0) {
                // Batch-submit flow: process all answers at once
                const processedAnswers = answers.map((answer) => {
                    const question = questions.find(
                        (q) => q._id.toString() === answer.questionId,
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

                attempt.answers = processedAnswers;
                attempt.correctAnswers = correctAnswers;
                attempt.score = totalScore;
            } else {
                // One-by-one flow: answers already stored per-question, keep them
                correctAnswers = attempt.correctAnswers || 0;
                totalScore = attempt.score || 0;
            }

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
                    questions,
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
                                  (q) => q._id.toString() === a.questionId,
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

            // Optional auth — pick userId from header token if present
            let userId = null;
            try {
                const authHeader = req.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const jwt = require('jsonwebtoken');
                    const decoded = jwt.verify(
                        authHeader.slice(7),
                        process.env.JWT_SECRET,
                    );
                    userId = decoded.userId || decoded.id || decoded._id;
                }
            } catch {
                /* token invalid/absent — stay anonymous */
            }

            const quizzes = await Quiz.find(filter)
                .populate('creatorId', 'username')
                .select('-settings')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Quiz.countDocuments(filter);

            // Attach per-quiz isRegistered flag
            const quizzesWithMeta = quizzes.map((quiz) => {
                const isRegistered = userId
                    ? (quiz.participantManagement?.registeredUsers || []).some(
                          (reg) =>
                              reg.userId?.toString() === userId?.toString(),
                      )
                    : false;
                return { ...quiz, isRegistered };
            });

            res.json({
                success: true,
                data: {
                    quizzes: quizzesWithMeta,
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
                    questions,
                );
            } catch (analysisError) {
                console.error('Failed to generate analysis:', analysisError);
            }

            const detailedAnswers = attempt.answers.map((a) => {
                const question = questions.find(
                    (q) => q._id.toString() === a.questionId.toString(),
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
                }),
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
                { new: true, runValidators: true },
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
                { new: true, runValidators: true },
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
                    category || quiz.category,
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
                category,
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
    // Get leaderboard for a quiz
    async getQuizLeaderboard(req, res) {
        try {
            const { quizId } = req.params;

            const quiz = await Quiz.findById(quizId).lean();
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found',
                });
            }

            // Fetch all completed attempts for this quiz
            const attempts = await QuizAttempt.find({
                quizId,
                status: { $in: ['completed', 'auto-submitted'] },
            })
                .populate('userId', 'username email')
                .lean();

            // Sort: highest score first; on tie, lowest duration (fastest) first
            attempts.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.duration - b.duration;
            });

            // Assign ranks (handle tie ranks)
            const leaderboard = [];
            let currentRank = 1;
            for (let i = 0; i < attempts.length; i++) {
                if (i > 0) {
                    const prev = attempts[i - 1];
                    const curr = attempts[i];
                    const sameTie =
                        prev.score === curr.score &&
                        prev.duration === curr.duration;
                    if (!sameTie) currentRank = i + 1;
                }
                const attempt = attempts[i];
                leaderboard.push({
                    rank: currentRank,
                    userId: attempt.userId?._id,
                    username: attempt.userId?.username || 'Anonymous',
                    score: attempt.score,
                    totalQuestions: attempt.totalQuestions,
                    correctAnswers: attempt.correctAnswers,
                    percentage:
                        attempt.totalQuestions > 0
                            ? Math.round(
                                  (attempt.correctAnswers /
                                      attempt.totalQuestions) *
                                      100,
                              )
                            : 0,
                    timeTaken: Math.round(attempt.duration / 1000), // seconds
                    completedAt: attempt.endTime || attempt.createdAt,
                });
            }

            res.json({
                success: true,
                data: {
                    quizId,
                    quizTitle: quiz.title,
                    totalParticipants: leaderboard.length,
                    leaderboard,
                },
            });
        } catch (error) {
            console.error('Leaderboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch leaderboard',
            });
        }
    }
}

module.exports = new QuizController();

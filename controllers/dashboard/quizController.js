const Quiz = require('../../models/Quiz');
const User = require('../../models/User');
const QuizAttempt = require('../../models/QuizAttempt');
const Transaction = require('../../models/Transaction');
const Question = require('../../models/Question');

class quizController {
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
            const questions = await Question.find({ quizId }).lean();

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
            const questionCount = await Question.countDocuments({ quizId });
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
            await Question.deleteMany({ quizId });

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

module.exports = new quizController();

const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

class PrizeDistributionService {
    /**
     * Calculate prize distribution based on participant count
     * Rules:
     * - < 5participants: Quiz cancelled
     * - 5-9: Winner #1 gets 50%
     * - 10-19: Winner #1: 30%, Winner #2: 20%
     * - 20+: Top 10% (rounded up) split 50%
     * Always: Creator 30%, Platform 20%
     */
    calculateDistribution(participantCount, entryFee) {
        if (participantCount < 5) {
            return {
                shouldCancel: true,
                totalPool: participantCount * entryFee,
                platformFee: 0,
                creatorFee: 0,
                prizeMoney: 0,
                winners: [],
            };
        }

        const totalPool = participantCount * entryFee;
        const platformFee = totalPool * 0.2; // 20%
        const creatorFee = totalPool * 0.3; // 30%
        const prizeMoney = totalPool * 0.5; // 50%

        let winners = [];

        if (participantCount >= 5 && participantCount < 10) {
            // Top 1 winner gets 100% of prize money
            winners = [{ rank: 1, percentage: 100, amount: prizeMoney }];
        } else if (participantCount >= 10 && participantCount < 20) {
            // Top 2 winners
            winners = [
                { rank: 1, percentage: 60, amount: prizeMoney * 0.6 }, // 30/50 = 60%
                { rank: 2, percentage: 40, amount: prizeMoney * 0.4 }, // 20/50 = 40%
            ];
        } else if (participantCount >= 20) {
            // Top 10% (rounded up)
            const winnerCount = Math.ceil(participantCount * 0.1);
            const prizePerWinner = prizeMoney / winnerCount;

            winners = Array.from({ length: winnerCount }, (_, i) => ({
                rank: i + 1,
                amount: prizePerWinner,
            }));
        }

        return {
            shouldCancel: false,
            totalPool,
            platformFee,
            creatorFee,
            prizeMoney,
            winners,
            winnerCount: winners.length,
        };
    }

    /**
     * Process quiz results and distribute prizes
     * Called by cron job when quiz endTime has passed
     */
    async processQuizResults(quizId) {
        const session = await mongoose.startSession();
        let result = {
            success: false,
            message: '',
            distributed: false,
        };

        try {
            await session.withTransaction(async () => {
                // Find quiz
                const quiz = await Quiz.findById(quizId).session(session);
                if (!quiz) {
                    throw new Error('Quiz not found');
                }

                // Check if already distributed
                if (quiz.prizePool.distributed) {
                    result.message = 'Prizes already distributed';
                    result.distributed = true;
                    return;
                }

                // Only process paid quizzes
                if (!quiz.isPaid) {
                    result.message = 'Not a paid quiz';
                    return;
                }

                // Get participant count
                const participantCount =
                    quiz.participantManagement.participantCount;

                // Calculate distribution
                const distribution = this.calculateDistribution(
                    participantCount,
                    quiz.price,
                );

                // Get completed quiz attempts, sorted by score desc, duration asc
                const attempts = await QuizAttempt.find({
                    quizId: quiz._id,
                    status: { $in: ['completed', 'auto-submitted'] },
                })
                    .sort({ score: -1, duration: 1 })
                    .session(session);

                // Distribute prizes to winners
                const winnerTransactions = [];
                for (let i = 0; i < distribution.winners.length; i++) {
                    const attempt = attempts[i];
                    if (!attempt) break; // No more participants

                    const winnerInfo = distribution.winners[i];
                    const prize = winnerInfo.amount;

                    // Credit winner
                    const winner = await User.findById(attempt.userId).session(
                        session,
                    );
                    if (winner) {
                        const balanceBefore = winner.wallet.balance;
                        winner.wallet.balance += prize;
                        winner.wallet.totalEarned += prize;
                        await winner.save({ session });

                        // Create transaction
                        const transaction = new Transaction({
                            userId: winner._id,
                            type: 'earning',
                            amount: prize,
                            description: `Prize for Rank #${winnerInfo.rank} in quiz: ${quiz.title}`,
                            status: 'completed',
                            relatedQuizId: quiz._id,
                            relatedAttemptId: attempt._id,
                            paymentMethod: 'wallet',
                            balanceBefore: balanceBefore,
                            balanceAfter: winner.wallet.balance,
                        });
                        await transaction.save({ session });

                        winnerTransactions.push({
                            userId: winner._id,
                            rank: winnerInfo.rank,
                            prize: prize,
                            attemptId: attempt._id,
                            transactionId: transaction._id,
                        });
                    }
                }

                // Credit creator (30% of total pool)
                const creator = await User.findById(quiz.creatorId).session(
                    session,
                );
                if (creator) {
                    const creatorBalanceBefore = creator.wallet.balance;
                    creator.wallet.balance += distribution.creatorFee;
                    creator.wallet.totalEarned += distribution.creatorFee;
                    creator.analytics.totalEarnings += distribution.creatorFee;
                    await creator.save({ session });

                    const creatorTransaction = new Transaction({
                        userId: creator._id,
                        type: 'earning',
                        amount: distribution.creatorFee,
                        description: `Creator fee (30%) from quiz: ${quiz.title}`,
                        status: 'completed',
                        relatedQuizId: quiz._id,
                        paymentMethod: 'wallet',
                        balanceBefore: creatorBalanceBefore,
                        balanceAfter: creator.wallet.balance,
                        metadata: {
                            participantCount: participantCount,
                            totalPool: distribution.totalPool,
                        },
                    });
                    await creatorTransaction.save({ session });
                }

                // Platform fee (20%) is already deducted, no transaction needed

                // Update quiz with prize distribution info
                quiz.prizePool.totalAmount = distribution.totalPool;
                quiz.prizePool.platformFee = distribution.platformFee;
                quiz.prizePool.creatorFee = distribution.creatorFee;
                quiz.prizePool.prizeMoney = distribution.prizeMoney;
                quiz.prizePool.distributed = true;
                quiz.prizePool.distributedAt = new Date();
                quiz.prizePool.winners = winnerTransactions;
                quiz.analytics.revenue = distribution.totalPool;

                await quiz.save({ session });

                result.success = true;
                result.message = `Distributed prizes to ${winnerTransactions.length} winners`;
                result.distributed = true;
                result.distribution = distribution;
            });
        } catch (error) {
            result.success = false;
            result.message = error.message;
            console.error('Prize distribution error:', error);
        } finally {
            await session.endSession();
        }

        return result;
    }

    /**
     * Cancel quiz and refund all participants
     * Called by cron job if participant count < 5 at startTime
     */
    async cancelQuizAndRefund(quizId, reason = 'Insufficient participants') {
        const session = await mongoose.startSession();
        let result = {
            success: false,
            message: '',
            refundCount: 0,
        };

        try {
            await session.withTransaction(async () => {
                const quiz = await Quiz.findById(quizId).session(session);
                if (!quiz) {
                    throw new Error('Quiz not found');
                }

                // Check if already cancelled
                if (quiz.status === 'cancelled') {
                    result.message = 'Quiz already cancelled';
                    return;
                }

                // Process refunds for all registered users
                const registeredUsers =
                    quiz.participantManagement.registeredUsers;
                let refundCount = 0;

                for (const registration of registeredUsers) {
                    if (registration.status === 'paid') {
                        const user = await User.findById(
                            registration.userId,
                        ).session(session);
                        if (user) {
                            const balanceBefore = user.wallet.balance;
                            user.wallet.balance += quiz.price; // Full refund
                            user.wallet.totalSpent -= quiz.price; // Reverse deduction
                            await user.save({ session });

                            // Create refund transaction
                            const refundTransaction = new Transaction({
                                userId: user._id,
                                type: 'refund',
                                amount: quiz.price,
                                description: `Refund for cancelled quiz: ${quiz.title}`,
                                status: 'completed',
                                relatedQuizId: quiz._id,
                                paymentMethod: 'wallet',
                                balanceBefore: balanceBefore,
                                balanceAfter: user.wallet.balance,
                            });
                            await refundTransaction.save({ session });

                            // Update original payment transaction
                            if (registration.paymentId) {
                                await Transaction.findByIdAndUpdate(
                                    registration.paymentId,
                                    {
                                        'refund.isRefunded': true,
                                        'refund.refundAmount': quiz.price,
                                        'refund.refundReason': reason,
                                        'refund.refundedAt': new Date(),
                                        'refund.refundTransactionId':
                                            refundTransaction._id,
                                    },
                                    { session },
                                );
                            }

                            // Mark registration as refunded
                            registration.status = 'refunded';
                            refundCount++;
                        }
                    }
                }

                // Update quiz status
                quiz.status = 'cancelled';
                quiz.cancelledAt = new Date();
                quiz.cancellationReason = reason;
                quiz.autoCancel.isCancelled = true;
                quiz.autoCancel.cancelReason = reason;
                quiz.autoCancel.refundsProcessed = true;
                quiz.autoCancel.refundedAt = new Date();

                await quiz.save({ session });

                result.success = true;
                result.message = `Quiz cancelled and ${refundCount} participants refunded`;
                result.refundCount = refundCount;
            });
        } catch (error) {
            result.success = false;
            result.message = error.message;
            console.error('Quiz cancellation error:', error);
        } finally {
            await session.endSession();
        }

        return result;
    }
}

module.exports = new PrizeDistributionService();

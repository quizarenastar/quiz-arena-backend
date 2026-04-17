const cron = require('node-cron');
const Quiz = require('../models/Quiz');
const User = require('../models/User');
const prizeDistributionService = require('./prizeDistributionService');
const { sendQuizStartedEmail, sendQuizCancelledEmail } = require('./emailService');

class CronScheduler {
    constructor() {
        this.jobs = [];
    }

    /**
     * Check quizzes at their start time
     * - If participant count < 5: Cancel quiz, refund, and notify users
     * - If participant count >= 5: Mark as checked and notify users
     * Runs every minute
     */
    startQuizStartTimeChecker() {
        const job = cron.schedule('* * * * *', async () => {
            try {
                console.log('[CRON] Checking quiz start times...');
                const now = new Date();

                // Find quizzes that:
                // 1. Are approved
                // 2. Start time has passed
                // 3. Haven't been checked yet
                const quizzesToCheck = await Quiz.find({
                    status: 'approved',
                    isPaid: true,
                    startTime: { $lte: now },
                    'autoCancel.checked': false,
                });

                console.log(
                    `[CRON] Found ${quizzesToCheck.length} quizzes to check`,
                );

                for (const quiz of quizzesToCheck) {
                    const participantCount =
                        quiz.participantManagement.participantCount;
                    const minParticipants =
                        quiz.participantManagement.minParticipants || 5;

                    console.log(
                        `[CRON] Quiz "${quiz.title}": ${participantCount}/${minParticipants} participants`,
                    );

                    // Get all registered user emails for notifications
                    const registeredUserIds = quiz.participantManagement.registeredUsers
                        .filter((r) => r.status === 'paid')
                        .map((r) => r.userId);

                    if (participantCount < minParticipants) {
                        // Cancel and refund
                        console.log(
                            `[CRON] Cancelling quiz "${quiz.title}" - insufficient participants`,
                        );
                        const result =
                            await prizeDistributionService.cancelQuizAndRefund(
                                quiz._id,
                                `Cancelled: Only ${participantCount} participant(s) registered (minimum ${minParticipants} required)`,
                            );
                        console.log(`[CRON] Cancellation result:`, result);

                        // Send cancellation emails to all registered users
                        if (registeredUserIds.length > 0) {
                            try {
                                const users = await User.find({ _id: { $in: registeredUserIds } }).select('email');
                                for (const u of users) {
                                    sendQuizCancelledEmail(u.email, {
                                        quizTitle: quiz.title,
                                        quizId: quiz._id,
                                        refundAmount: quiz.price,
                                        reason: `Only ${participantCount} participant(s) registered (minimum ${minParticipants} required)`,
                                        participantCount,
                                        minParticipants,
                                    });
                                }
                                console.log(
                                    `[CRON] Sent quiz-cancelled emails to ${users.length} participants for "${quiz.title}"`,
                                );
                            } catch (err) {
                                console.error('[CRON] Failed to send quiz-cancelled emails:', err.message);
                            }
                        }
                    } else {
                        // Mark as checked (quiz can proceed)
                        console.log(
                            `[CRON] Quiz "${quiz.title}" has sufficient participants, proceeding...`,
                        );
                        quiz.autoCancel.checked = true;
                        quiz.autoCancel.checkedAt = now;
                        await quiz.save();

                        // Send "quiz started" email to all registered users
                        if (registeredUserIds.length > 0) {
                            try {
                                const users = await User.find({ _id: { $in: registeredUserIds } }).select('email');
                                console.log(
                                    `[CRON] Sending quiz-started emails to ${users.length} participants for "${quiz.title}"`,
                                );
                                for (const u of users) {
                                    sendQuizStartedEmail(u.email, {
                                        quizTitle: quiz.title,
                                        quizId: quiz._id,
                                        duration: quiz.duration,
                                        totalQuestions: quiz.totalQuestions,
                                    });
                                }
                                console.log(
                                    `[CRON] Quiz-started emails dispatched for "${quiz.title}"`,
                                );
                            } catch (err) {
                                console.error('[CRON] Failed to send quiz-started emails:', err.message);
                            }
                        } else {
                            console.log(`[CRON] No registered users found for quiz "${quiz.title}" — skipping emails`);
                        }
                    }
                }
            } catch (error) {
                console.error(
                    '[CRON] Error in quiz start time checker:',
                    error,
                );
            }
        });

        this.jobs.push({ name: 'quizStartTimeChecker', job });
        console.log('[CRON] Quiz start time checker started');
        return job;
    }

    /**
     * Check quizzes at their end time
     * - Calculate winners and distribute prizes
     * Runs every minute
     */
    startQuizEndTimeProcessor() {
        const job = cron.schedule('* * * * *', async () => {
            try {
                console.log('[CRON] Checking quiz end times...');
                const now = new Date();

                // Find quizzes that:
                // 1. Are approved (not cancelled)
                // 2. End time has passed
                // 3. Prizes not distributed yet
                // 4. Is paid quiz
                const quizzesToProcess = await Quiz.find({
                    status: 'approved',
                    isPaid: true,
                    endTime: { $lte: now },
                    'prizePool.distributed': false,
                    'autoCancel.isCancelled': false, // Don't process cancelled quizzes
                });

                console.log(
                    `[CRON] Found ${quizzesToProcess.length} quizzes to process prizes`,
                );

                for (const quiz of quizzesToProcess) {
                    console.log(
                        `[CRON] Processing prizes for quiz "${quiz.title}"`,
                    );
                    const result =
                        await prizeDistributionService.processQuizResults(
                            quiz._id,
                        );
                    console.log(`[CRON] Prize distribution result:`, result);
                }
            } catch (error) {
                console.error(
                    '[CRON] Error in quiz end time processor:',
                    error,
                );
            }
        });

        this.jobs.push({ name: 'quizEndTimeProcessor', job });
        console.log('[CRON] Quiz end time processor started');
        return job;
    }

    /**
     * Start all cron jobs
     */
    startAll() {
        console.log('[CRON] Starting all scheduled tasks...');
        this.startQuizStartTimeChecker();
        this.startQuizEndTimeProcessor();
        console.log('[CRON] All scheduled tasks started');
    }

    /**
     * Stop all cron jobs
     */
    stopAll() {
        console.log('[CRON] Stopping all scheduled tasks...');
        this.jobs.forEach(({ name, job }) => {
            job.stop();
            console.log(`[CRON] Stopped: ${name}`);
        });
        this.jobs = [];
    }
}

module.exports = new CronScheduler();

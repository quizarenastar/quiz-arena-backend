const cron = require('node-cron');
const Quiz = require('../models/Quiz');
const prizeDistributionService = require('./prizeDistributionService');

class CronScheduler {
    constructor() {
        this.jobs = [];
    }

    /**
     * Check quizzes at their start time
     * - If participant count < 5: Cancel quiz and refund
     * - If participant count >= 5: Set status to 'active'
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
                    } else {
                        // Mark as checked (quiz can proceed)
                        console.log(
                            `[CRON] Quiz "${quiz.title}" has sufficient participants, proceeding...`,
                        );
                        quiz.autoCancel.checked = true;
                        quiz.autoCancel.checkedAt = now;
                        await quiz.save();
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

const QuizAttempt = require('../models/QuizAttempt');
const Quiz = require('../models/Quiz');

class AntiCheatService {
    constructor() {
        this.suspiciousPatterns = {
            MIN_TIME_PER_QUESTION: 3, // seconds
            MAX_TIME_PER_QUESTION: 300, // 5 minutes
            MAX_TAB_SWITCHES: 3,
            MAX_COPY_PASTE_EVENTS: 2,
            SUSPICIOUS_PATTERN_THRESHOLD: 0.9, // 90% same answers
            MIN_THINKING_TIME: 2, // Minimum time to read question
        };
    }

    async recordViolation(
        attemptId,
        violationType,
        details = '',
        severity = 'medium'
    ) {
        try {
            const attempt = await QuizAttempt.findById(attemptId);
            if (!attempt) {
                throw new Error('Quiz attempt not found');
            }

            const quiz = await Quiz.findById(attempt.quizId);
            if (!quiz) {
                throw new Error('Quiz not found');
            }

            // Record the violation
            const violation = {
                type: violationType,
                timestamp: new Date(),
                details,
                severity,
            };

            attempt.antiCheatViolations.push(violation);

            // Check if auto-submit is needed
            const shouldAutoSubmit = await this.checkAutoSubmitConditions(
                attempt,
                quiz
            );

            if (shouldAutoSubmit) {
                attempt.status = 'auto-submitted';
                attempt.endTime = new Date();
                attempt.duration = Date.now() - attempt.startTime.getTime();
            }

            await attempt.save();

            return {
                success: true,
                violation,
                autoSubmitted: shouldAutoSubmit,
                totalViolations: attempt.antiCheatViolations.length,
            };
        } catch (error) {
            console.error('Error recording violation:', error);
            throw error;
        }
    }

    async checkAutoSubmitConditions(attempt, quiz) {
        const violations = attempt.antiCheatViolations;
        const antiCheatSettings = quiz.settings.antiCheat;

        if (!antiCheatSettings.autoSubmitOnViolation) {
            return false;
        }

        // Check tab switch violations
        const tabSwitchCount = violations.filter(
            (v) => v.type === 'tab-switch'
        ).length;
        if (
            antiCheatSettings.enableTabSwitchDetection &&
            tabSwitchCount >= antiCheatSettings.maxTabSwitches
        ) {
            return true;
        }

        // Check for critical severity violations
        const criticalViolations = violations.filter(
            (v) => v.severity === 'critical'
        ).length;
        if (criticalViolations >= 1) {
            return true;
        }

        // Check total violation count
        const totalViolations = violations.length;
        if (totalViolations >= 10) {
            // Max 10 violations before auto-submit
            return true;
        }

        return false;
    }

    async validateAttempt(attemptId) {
        try {
            const attempt = await QuizAttempt.findById(attemptId).populate(
                'quizId'
            );
            if (!attempt) {
                return { isValid: false, reason: 'Attempt not found' };
            }

            const quiz = attempt.quizId;
            const suspiciousPatterns = await this.detectSuspiciousPatterns(
                attempt,
                quiz
            );

            const validationResult = {
                isValid: suspiciousPatterns.length === 0,
                suspiciousPatterns,
                riskScore: this.calculateRiskScore(attempt, suspiciousPatterns),
                recommendation: this.getRecommendation(suspiciousPatterns),
            };

            // Flag attempt if highly suspicious
            if (validationResult.riskScore >= 0.8) {
                attempt.status = 'flagged';
                await attempt.save();
            }

            return validationResult;
        } catch (error) {
            console.error('Error validating attempt:', error);
            return { isValid: false, reason: 'Validation error' };
        }
    }

    async detectSuspiciousPatterns(attempt, quiz) {
        const patterns = [];

        // Check timing patterns
        const timingPattern = this.checkTimingPatterns(attempt);
        if (timingPattern.suspicious) {
            patterns.push(timingPattern);
        }

        // Check answer patterns
        const answerPattern = this.checkAnswerPatterns(attempt);
        if (answerPattern.suspicious) {
            patterns.push(answerPattern);
        }

        // Check violation patterns
        const violationPattern = this.checkViolationPatterns(attempt, quiz);
        if (violationPattern.suspicious) {
            patterns.push(violationPattern);
        }

        // Check session consistency
        const sessionPattern = this.checkSessionConsistency(attempt);
        if (sessionPattern.suspicious) {
            patterns.push(sessionPattern);
        }

        return patterns;
    }

    checkTimingPatterns(attempt) {
        const answers = attempt.answers;
        if (answers.length === 0) {
            return { suspicious: false };
        }

        const avgTimePerQuestion = attempt.analytics.averageTimePerQuestion;
        const suspiciousAnswers = answers.filter(
            (answer) =>
                answer.timeSpent <
                    this.suspiciousPatterns.MIN_TIME_PER_QUESTION ||
                answer.timeSpent > this.suspiciousPatterns.MAX_TIME_PER_QUESTION
        );

        const suspiciousRatio = suspiciousAnswers.length / answers.length;

        return {
            suspicious: suspiciousRatio > 0.3, // 30% suspicious timing
            type: 'timing',
            severity: suspiciousRatio > 0.5 ? 'high' : 'medium',
            details: {
                avgTimePerQuestion,
                suspiciousAnswers: suspiciousAnswers.length,
                totalAnswers: answers.length,
                suspiciousRatio,
            },
        };
    }

    checkAnswerPatterns(attempt) {
        const answers = attempt.answers;
        if (answers.length < 5) {
            return { suspicious: false }; // Not enough data
        }

        // Check for patterns like all same option, sequential patterns, etc.
        const selectedOptions = answers
            .filter((a) => typeof a.selectedAnswer === 'number')
            .map((a) => a.selectedAnswer);

        if (selectedOptions.length === 0) {
            return { suspicious: false };
        }

        // Check if all answers are the same option
        const uniqueOptions = new Set(selectedOptions);
        const allSameOption = uniqueOptions.size === 1;

        // Check for sequential patterns (0,1,2,3,0,1,2,3...)
        const isSequential = this.isSequentialPattern(selectedOptions);

        // Check for alternating patterns (0,1,0,1... or 0,2,0,2...)
        const isAlternating = this.isAlternatingPattern(selectedOptions);

        const suspicious = allSameOption || isSequential || isAlternating;

        return {
            suspicious,
            type: 'answer-pattern',
            severity: allSameOption ? 'high' : 'medium',
            details: {
                allSameOption,
                isSequential,
                isAlternating,
                uniqueOptions: uniqueOptions.size,
                totalOptions: selectedOptions.length,
            },
        };
    }

    isSequentialPattern(options) {
        if (options.length < 4) return false;

        let sequentialCount = 0;
        for (let i = 1; i < options.length; i++) {
            if (options[i] === (options[i - 1] + 1) % 4) {
                sequentialCount++;
            }
        }

        return sequentialCount / (options.length - 1) > 0.7; // 70% sequential
    }

    isAlternatingPattern(options) {
        if (options.length < 4) return false;

        let alternatingCount = 0;
        for (let i = 2; i < options.length; i++) {
            if (options[i] === options[i - 2]) {
                alternatingCount++;
            }
        }

        return alternatingCount / (options.length - 2) > 0.8; // 80% alternating
    }

    checkViolationPatterns(attempt, quiz) {
        const violations = attempt.antiCheatViolations;
        const antiCheatSettings = quiz.settings.antiCheat;

        const tabSwitchCount = violations.filter(
            (v) => v.type === 'tab-switch'
        ).length;
        const copyPasteCount = violations.filter(
            (v) => v.type === 'copy-paste'
        ).length;
        const criticalCount = violations.filter(
            (v) => v.severity === 'critical'
        ).length;

        const excessiveTabSwitches =
            tabSwitchCount > antiCheatSettings.maxTabSwitches;
        const excessiveCopyPaste =
            copyPasteCount > this.suspiciousPatterns.MAX_COPY_PASTE_EVENTS;
        const hasCriticalViolations = criticalCount > 0;

        const suspicious =
            excessiveTabSwitches || excessiveCopyPaste || hasCriticalViolations;

        return {
            suspicious,
            type: 'violations',
            severity: hasCriticalViolations ? 'critical' : 'high',
            details: {
                tabSwitchCount,
                copyPasteCount,
                criticalCount,
                totalViolations: violations.length,
                excessiveTabSwitches,
                excessiveCopyPaste,
                hasCriticalViolations,
            },
        };
    }

    checkSessionConsistency(attempt) {
        // Check for inconsistencies in session data
        const sessionData = attempt.sessionData;

        // This is a basic check - in production, you'd want more sophisticated checks
        const suspicious =
            !sessionData.ipAddress ||
            !sessionData.userAgent ||
            sessionData.userAgent.length < 20; // Very short user agent is suspicious

        return {
            suspicious,
            type: 'session',
            severity: 'medium',
            details: {
                hasIpAddress: !!sessionData.ipAddress,
                hasUserAgent: !!sessionData.userAgent,
                userAgentLength: sessionData.userAgent
                    ? sessionData.userAgent.length
                    : 0,
            },
        };
    }

    calculateRiskScore(attempt, suspiciousPatterns) {
        if (suspiciousPatterns.length === 0) {
            return 0;
        }

        const severityWeights = {
            low: 0.1,
            medium: 0.3,
            high: 0.6,
            critical: 1.0,
        };

        let totalScore = 0;
        let maxPossibleScore = 0;

        suspiciousPatterns.forEach((pattern) => {
            const weight = severityWeights[pattern.severity] || 0.3;
            totalScore += weight;
            maxPossibleScore += 1.0;
        });

        return Math.min(totalScore / Math.max(maxPossibleScore, 1), 1.0);
    }

    getRecommendation(suspiciousPatterns) {
        if (suspiciousPatterns.length === 0) {
            return 'No suspicious activity detected. Attempt appears legitimate.';
        }

        const hasCritical = suspiciousPatterns.some(
            (p) => p.severity === 'critical'
        );
        const hasHigh = suspiciousPatterns.some((p) => p.severity === 'high');

        if (hasCritical) {
            return 'Critical violations detected. Recommend manual review and possible disqualification.';
        }

        if (hasHigh) {
            return 'High-risk patterns detected. Recommend manual review.';
        }

        return 'Some suspicious patterns detected. Monitor for future attempts.';
    }

    async getAttemptSecurity(attemptId) {
        try {
            const attempt = await QuizAttempt.findById(attemptId);
            if (!attempt) {
                throw new Error('Attempt not found');
            }

            return {
                violations: attempt.antiCheatViolations,
                status: attempt.status,
                sessionData: attempt.sessionData,
                analytics: attempt.analytics,
            };
        } catch (error) {
            console.error('Error getting attempt security:', error);
            throw error;
        }
    }

    // Real-time monitoring methods
    async updateSessionAnalytics(attemptId, analyticsData) {
        try {
            const attempt = await QuizAttempt.findById(attemptId);
            if (!attempt) {
                throw new Error('Attempt not found');
            }

            // Update analytics
            Object.assign(attempt.analytics, analyticsData);

            // Check for suspicious real-time patterns
            if (analyticsData.focusLostCount > 10) {
                await this.recordViolation(
                    attemptId,
                    'tab-switch',
                    `Excessive focus loss: ${analyticsData.focusLostCount}`,
                    'medium'
                );
            }

            await attempt.save();
            return attempt.analytics;
        } catch (error) {
            console.error('Error updating session analytics:', error);
            throw error;
        }
    }
}

module.exports = new AntiCheatService();

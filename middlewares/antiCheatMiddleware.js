const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const AntiCheatService = require('../services/antiCheatService');
const { sendError } = require('../utils/sendResponse');

// Middleware to track and validate anti-cheat measures
class AntiCheatMiddleware {
    // Check if user has permission to access quiz features
    static checkQuizAccess() {
        return async (req, res, next) => {
            try {
                const userId = req.userId;
                const user = await User.findById(userId);

                if (!user) {
                    return sendError(res, 'User not found', 404);
                }

                // Check if user is suspended or banned
                if (user.suspended) {
                    return sendError(
                        res,
                        'Account suspended. Contact support for assistance.',
                        403
                    );
                }

                // Check for suspicious activity patterns
                const recentViolations = await QuizAttempt.countDocuments({
                    userId,
                    'violations.timestamp': {
                        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                    },
                });

                // If user has too many violations in 24 hours, restrict access
                if (recentViolations > 10) {
                    return sendError(
                        res,
                        'Too many anti-cheat violations detected. Access temporarily restricted.',
                        429
                    );
                }

                req.userSecurityInfo = {
                    recentViolations,
                    lastViolation: user.lastViolation || null,
                    trustScore: Math.max(0, 100 - recentViolations * 5), // Simple trust score
                };

                next();
            } catch (error) {
                console.error('Anti-cheat access check error:', error);
                return sendError(res, 'Security validation failed', 500);
            }
        };
    }

    // Middleware to validate quiz attempt session
    static validateAttemptSession() {
        return async (req, res, next) => {
            try {
                const { attemptId } = req.params;
                const userId = req.userId;

                if (!attemptId) {
                    return sendError(res, 'Attempt ID is required', 400);
                }

                const attempt = await QuizAttempt.findById(attemptId)
                    .populate('quizId', 'settings timeLimit')
                    .lean();

                if (!attempt) {
                    return sendError(res, 'Quiz attempt not found', 404);
                }

                // Verify ownership
                if (attempt.userId.toString() !== userId) {
                    return sendError(
                        res,
                        'Unauthorized access to quiz attempt',
                        403
                    );
                }

                // Check if attempt is still active
                if (attempt.status === 'completed') {
                    return sendError(
                        res,
                        'Quiz attempt already completed',
                        400
                    );
                }

                if (attempt.status === 'abandoned') {
                    return sendError(
                        res,
                        'Quiz attempt was abandoned due to violations',
                        400
                    );
                }

                // Check time limit
                const timeLimit = attempt.quizId.timeLimit * 1000; // Convert to milliseconds
                const timeElapsed =
                    Date.now() - new Date(attempt.startedAt).getTime();

                if (timeElapsed > timeLimit + 30000) {
                    // 30 second grace period
                    // Auto-submit if time exceeded
                    attempt.status = 'completed';
                    attempt.completedAt = new Date();
                    await QuizAttempt.findByIdAndUpdate(attemptId, {
                        status: 'completed',
                        completedAt: new Date(),
                        timeSpent: Math.ceil(timeElapsed / 1000),
                    });

                    return sendError(
                        res,
                        'Quiz time limit exceeded. Attempt auto-submitted.',
                        408
                    );
                }

                // Add attempt info to request
                req.quizAttempt = attempt;
                req.timeRemaining = Math.max(0, timeLimit - timeElapsed);

                next();
            } catch (error) {
                console.error('Attempt session validation error:', error);
                return sendError(res, 'Session validation failed', 500);
            }
        };
    }

    // Rate limiting for violations (prevent spam)
    static violationRateLimit() {
        const violationCounts = new Map();

        return (req, res, next) => {
            const userId = req.userId;
            const now = Date.now();
            const windowMs = 60 * 1000; // 1 minute window
            const maxViolations = 20; // Max violations per minute

            // Clean old entries
            if (!violationCounts.has(userId)) {
                violationCounts.set(userId, []);
            }

            const userViolations = violationCounts.get(userId);
            const recentViolations = userViolations.filter(
                (time) => now - time < windowMs
            );

            // Update the map with recent violations
            violationCounts.set(userId, recentViolations);

            if (recentViolations.length >= maxViolations) {
                return sendError(
                    res,
                    'Too many violation reports. Please slow down.',
                    429
                );
            }

            // Add current timestamp
            recentViolations.push(now);

            next();
        };
    }

    // Security headers and CORS for quiz endpoints
    static securityHeaders() {
        return (req, res, next) => {
            // Prevent clickjacking
            res.setHeader('X-Frame-Options', 'DENY');

            // Prevent MIME type sniffing
            res.setHeader('X-Content-Type-Options', 'nosniff');

            // XSS Protection
            res.setHeader('X-XSS-Protection', '1; mode=block');

            // Referrer Policy
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

            // Content Security Policy for quiz pages
            res.setHeader(
                'Content-Security-Policy',
                "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: https:; " +
                    "connect-src 'self'; " +
                    "font-src 'self'; " +
                    "frame-ancestors 'none';"
            );

            next();
        };
    }

    // Monitor for suspicious patterns during quiz attempts
    static suspiciousActivityMonitor() {
        return async (req, res, next) => {
            try {
                const userId = req.userId;
                const userAgent = req.headers['user-agent'];
                const ip =
                    req.headers['x-forwarded-for'] || req.socket.remoteAddress;

                // Check for suspicious patterns
                const suspiciousPatterns = [
                    // Check for automation tools
                    /selenium|webdriver|automation/i.test(userAgent),
                    // Check for headless browsers
                    /headless/i.test(userAgent),
                    // Check for suspicious response times (too fast)
                    req.body.timeSpent && req.body.timeSpent < 5, // Less than 5 seconds for submission
                ];

                const suspiciousScore =
                    suspiciousPatterns.filter(Boolean).length;

                if (suspiciousScore >= 2) {
                    // Log suspicious activity
                    console.warn('Suspicious activity detected:', {
                        userId,
                        ip,
                        userAgent,
                        suspiciousScore,
                        endpoint: req.originalUrl,
                        timestamp: new Date(),
                    });

                    // Add to anti-cheat tracking
                    if (req.quizAttempt) {
                        await AntiCheatService.recordViolation(
                            req.quizAttempt._id,
                            {
                                type: 'suspicious_activity',
                                details: `Suspicious score: ${suspiciousScore}`,
                                metadata: { userAgent, ip },
                            }
                        );
                    }
                }

                // Add security context to request
                req.securityContext = {
                    suspiciousScore,
                    userAgent,
                    ip,
                    timestamp: new Date(),
                };

                next();
            } catch (error) {
                console.error('Suspicious activity monitoring error:', error);
                // Don't block the request on monitoring errors
                next();
            }
        };
    }

    // Validate API key for external integrations (if needed)
    static validateApiKey() {
        return (req, res, next) => {
            const apiKey = req.headers['x-api-key'];
            const allowedKeys = process.env.ALLOWED_API_KEYS?.split(',') || [];

            // Only require API key for specific endpoints
            const requiresApiKey = req.path.includes('/api/external/');

            if (requiresApiKey && (!apiKey || !allowedKeys.includes(apiKey))) {
                return sendError(res, 'Invalid or missing API key', 401);
            }

            next();
        };
    }

    // Device fingerprinting to detect device switching
    static deviceFingerprint() {
        return (req, res, next) => {
            const fingerprint = {
                userAgent: req.headers['user-agent'],
                acceptLanguage: req.headers['accept-language'],
                acceptEncoding: req.headers['accept-encoding'],
                // Add more fingerprinting data as needed
            };

            // Create a simple hash of the fingerprint
            const fingerprintHash = require('crypto')
                .createHash('md5')
                .update(JSON.stringify(fingerprint))
                .digest('hex');

            req.deviceFingerprint = fingerprintHash;

            next();
        };
    }
}

module.exports = AntiCheatMiddleware;

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const { sendError } = require('../utils/sendResponse');

// Enhanced security middleware configuration
class SecurityMiddleware {
    // Comprehensive rate limiting
    static createRateLimit(options = {}) {
        const defaults = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // Default limit
            message: {
                success: false,
                message:
                    'Too many requests from this IP, please try again later.',
            },
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                sendError(res, options.message || 'Rate limit exceeded', 429);
            },
        };

        return rateLimit({ ...defaults, ...options });
    }

    // Progressive delay for suspicious activity
    static createSlowDown(options = {}) {
        const defaults = {
            windowMs: 15 * 60 * 1000, // 15 minutes
            delayAfter: 5, // Allow 5 requests per windowMs without delay
            delayMs: 500, // Add 500ms delay per request after delayAfter
            maxDelayMs: 10000, // Maximum delay of 10 seconds
        };

        return slowDown({ ...defaults, ...options });
    }

    // Helmet security headers
    static setupHelmet() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                },
            },
            crossOriginEmbedderPolicy: false, // Disable for API
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            },
        });
    }

    // Input sanitization middleware
    static sanitizeInput() {
        return (req, res, next) => {
            if (req.body) {
                req.body = this.sanitizeObject(req.body);
            }
            if (req.query) {
                req.query = this.sanitizeObject(req.query);
            }
            if (req.params) {
                req.params = this.sanitizeObject(req.params);
            }
            next();
        };
    }

    // Recursive object sanitization
    static sanitizeObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return typeof obj === 'string' ? this.sanitizeString(obj) : obj;
        }

        if (Array.isArray(obj)) {
            return obj.map((item) => this.sanitizeObject(item));
        }

        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            const sanitizedKey = this.sanitizeString(key);
            sanitized[sanitizedKey] = this.sanitizeObject(value);
        }
        return sanitized;
    }

    // String sanitization
    static sanitizeString(str) {
        if (typeof str !== 'string') return str;

        // Remove potentially dangerous characters and patterns
        return str
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+\s*=/gi, '') // Remove event handlers
            .replace(/[<>]/g, '') // Remove angle brackets
            .trim();
    }

    // IP whitelist/blacklist middleware
    static ipFilter(options = {}) {
        const { whitelist = [], blacklist = [] } = options;

        return (req, res, next) => {
            const clientIP =
                req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            // Check blacklist first
            if (
                blacklist.length > 0 &&
                blacklist.some((ip) => clientIP.includes(ip))
            ) {
                return sendError(
                    res,
                    'Access denied from this IP address',
                    403
                );
            }

            // Check whitelist if provided
            if (
                whitelist.length > 0 &&
                !whitelist.some((ip) => clientIP.includes(ip))
            ) {
                return sendError(res, 'IP address not authorized', 403);
            }

            next();
        };
    }

    // Request size limiting
    static requestSizeLimit() {
        return (req, res, next) => {
            const maxSize = 5 * 1024 * 1024; // 5MB limit
            const contentLength = parseInt(req.headers['content-length']) || 0;

            if (contentLength > maxSize) {
                return sendError(res, 'Request entity too large', 413);
            }

            next();
        };
    }

    // SQL injection protection (additional layer)
    static sqlInjectionProtection() {
        return (req, res, next) => {
            const sqlPatterns = [
                /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
                /('|(\-\-)|(\;))/gi,
                /((\%27)|(')|(\-\-)|(\%3B)|(;))/gi,
            ];

            const checkForSQLInjection = (obj) => {
                if (typeof obj === 'string') {
                    return sqlPatterns.some((pattern) => pattern.test(obj));
                }
                if (typeof obj === 'object' && obj !== null) {
                    return Object.values(obj).some((value) =>
                        checkForSQLInjection(value)
                    );
                }
                return false;
            };

            if (
                checkForSQLInjection(req.body) ||
                checkForSQLInjection(req.query) ||
                checkForSQLInjection(req.params)
            ) {
                return sendError(
                    res,
                    'Potentially malicious input detected',
                    400
                );
            }

            next();
        };
    }

    // CSRF protection for state-changing operations
    static csrfProtection() {
        return (req, res, next) => {
            // Skip CSRF for GET, HEAD, OPTIONS
            if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
                return next();
            }

            const token = req.headers['x-csrf-token'] || req.body._csrf;
            const sessionToken = req.session?.csrfToken;

            if (!token || !sessionToken || token !== sessionToken) {
                return sendError(res, 'Invalid CSRF token', 403);
            }

            next();
        };
    }

    // Request logging for security monitoring
    static securityLogger() {
        return (req, res, next) => {
            const securityLog = {
                timestamp: new Date().toISOString(),
                ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
                userAgent: req.headers['user-agent'],
                method: req.method,
                url: req.originalUrl,
                userId: req.user?.id || 'anonymous',
            };

            // Log suspicious patterns
            const suspiciousPatterns = [
                /(\.\.\/)|(\.\.\\)/g, // Path traversal
                /(script|javascript|vbscript)/gi, // Script injections
                /(<|%3C)(script|iframe|object|embed)/gi, // HTML injections
            ];

            const isSuspicious = suspiciousPatterns.some(
                (pattern) =>
                    pattern.test(req.originalUrl) ||
                    JSON.stringify(req.body || {}).match(pattern) ||
                    JSON.stringify(req.query || {}).match(pattern)
            );

            if (isSuspicious) {
                console.warn('Suspicious request detected:', securityLog);
            }

            // Add to request for further processing
            req.securityLog = securityLog;
            next();
        };
    }
}

// Predefined security configurations for different endpoints
const SecurityConfigs = {
    // High security for authentication endpoints
    auth: [
        SecurityMiddleware.setupHelmet(),
        SecurityMiddleware.createRateLimit({
            windowMs: 15 * 60 * 1000,
            max: 5, // Very strict for auth
            message: 'Too many authentication attempts',
        }),
        SecurityMiddleware.createSlowDown({
            delayAfter: 2,
            delayMs: 1000,
        }),
        SecurityMiddleware.sanitizeInput(),
        SecurityMiddleware.sqlInjectionProtection(),
        SecurityMiddleware.securityLogger(),
    ],

    // Medium security for quiz operations
    quiz: [
        SecurityMiddleware.setupHelmet(),
        SecurityMiddleware.createRateLimit({
            windowMs: 15 * 60 * 1000,
            max: 50,
            message: 'Too many quiz requests',
        }),
        SecurityMiddleware.sanitizeInput(),
        SecurityMiddleware.requestSizeLimit(),
        SecurityMiddleware.securityLogger(),
    ],

    // Standard security for general API
    api: [
        SecurityMiddleware.setupHelmet(),
        SecurityMiddleware.createRateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
        }),
        SecurityMiddleware.sanitizeInput(),
        SecurityMiddleware.securityLogger(),
    ],

    // Enhanced security for admin endpoints
    admin: [
        SecurityMiddleware.setupHelmet(),
        SecurityMiddleware.createRateLimit({
            windowMs: 15 * 60 * 1000,
            max: 30,
            message: 'Too many admin requests',
        }),
        SecurityMiddleware.createSlowDown({
            delayAfter: 3,
            delayMs: 2000,
        }),
        SecurityMiddleware.sanitizeInput(),
        SecurityMiddleware.sqlInjectionProtection(),
        SecurityMiddleware.csrfProtection(),
        SecurityMiddleware.securityLogger(),
    ],
};

module.exports = {
    SecurityMiddleware,
    SecurityConfigs,
};

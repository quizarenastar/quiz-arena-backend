const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { MONGODB_URI } = require('./configs');

const app = express();
app.use(express.json());
const corsOptions = {
    origin: [
        'http://localhost:5001',
        'http://localhost:5002',
        'https://quizarena.in',
        'https://dashboard.quizarena.in',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info('✅ Connected to DB');

        // Start the server *after* successful DB connection
        app.listen(5000, () => {
            logger.info(`🚀 Server is running on http://localhost:5000`);
        });
    } catch (err) {
        logger.error('❌ Failed to connect to DB', { error: err });
        process.exit(1); // Exit
    }
}

main();

// Rate limiter middleware
const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter); // Apply to all requests

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            ip,
            userAgent: req.headers['user-agent'],
            duration: `${duration}ms`,
        });
    });

    next();
});

app.get('/', (req, res) => {
    res.send('Quiz Arena Backend is running');
});

// Main routes
app.use('/api/v1/users', require('./routes/main/userRoutes'));
app.use('/api/v1/contact', require('./routes/main/contactRoutes'));
app.use('/api/v1/quizzes', require('./routes/main/quizRoutes'));
app.use('/api/v1/wallet', require('./routes/main/walletRoutes'));

// Dashboard routes
app.use(
    '/dashboard/v1/users',
    require('./routes/dashboard/dashboardUserRoutes')
);
app.use('/dashboard/v1/contact', require('./routes/dashboard/contactRoutes'));
app.use('/dashboard/v1/stats', require('./routes/dashboard/statsRoutes'));
app.use('/dashboard/v1/quizzes', require('./routes/dashboard/quizRoutes'));
app.use('/dashboard/v1/wallet', require('./routes/dashboard/walletRoutes'));

// 404 handler (Express 5: use a regex-style catch-all)
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Centralized error handler with logging
app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    logger.error('Request failed', {
        method: req.method,
        url: req.originalUrl,
        statusCode,
        message,
        stack: err.stack,
    });
    res.status(statusCode).json({ success: false, message });
});

app.listen(5000, () => {
    logger.info(`Server is running on http://localhost:5000`);
});

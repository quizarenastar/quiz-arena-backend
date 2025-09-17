const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { MONGODB_URI } = require('./configs');
const userRoutes = require('./routes/main/userRoutes');
const dashboardUserRoutes = require('./routes/dashboard/dashboardUserRoutes');

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

// Connect to MongoDB
async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info('Connected to DB');
    } catch (err) {
        logger.error('Failed to connect to DB', { error: err });
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

app.use('/api/v1/users', userRoutes);
app.use('/dashboard/v1/users', dashboardUserRoutes);

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

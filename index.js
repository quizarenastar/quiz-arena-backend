const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { MONGODB_URI } = require('./configs');
const initWarRoomSocket = require('./services/warRoomSocket');
const initQuizSocket = require('./services/quizSocket');
const PORT = process.env.PORT || 5000;

const app = express();
const server = http.createServer(app);

app.use(express.json());
const corsOrigins = [
    'http://localhost:5001',
    'http://localhost:5002',
    'https://quizarena.in',
    'https://dashboard.quizarena.in',
];
const corsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Initialize Socket.IO with same CORS origins
const io = new SocketIO(server, {
    cors: {
        origin: corsOrigins,
        credentials: true,
    },
});

async function main() {
    try {
        await mongoose.connect(MONGODB_URI);
        logger.info('✅ Connected to DB');

        // Initialize cron scheduler for prize pool automation
        const cronScheduler = require('./services/cronScheduler');
        cronScheduler.startAll();
        logger.info('✅ Cron scheduler started');

        // Initialize War Room WebSocket handler
        initWarRoomSocket(io);
        logger.info('✅ War Room WebSocket initialized');

        // Initialize Quiz WebSocket handler
        initQuizSocket(io);
        logger.info('✅ Quiz WebSocket initialized');

        // Start the server *after* successful DB connection
        server.listen(PORT, () => {
            logger.info(`🚀 Server is running on http://localhost:${PORT}`);
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
    max: 1000, // limit each IP to 100 requests per windowMs
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

app.get('/', async (req, res) => {
    try {
        const dbState = mongoose.connection.readyState;

        const healthData = {
            status: 'ok',
            uptime: process.uptime(), // seconds
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            db: dbState === 1 ? 'connected' : 'disconnected',
            memoryUsage: process.memoryUsage(),
            version: '1.0.1',
        };

        // If DB is not connected → unhealthy
        if (dbState !== 1) {
            return res.status(500).json({
                status: 'error',
                message: 'Database not connected',
                ...healthData,
            });
        }

        res.status(200).json(healthData);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
        });
    }
});

// Main routes
app.use('/api/v1/users', require('./routes/main/userRoutes'));
app.use('/api/v1/contact', require('./routes/main/contactRoutes'));
app.use('/api/v1/quizzes', require('./routes/main/quizRoutes'));
app.use('/api/v1/wallet', require('./routes/main/walletRoutes'));
app.use('/api/v1/war-rooms', require('./routes/main/warRoomRoutes'));

// Dashboard routes
app.use(
    '/dashboard/v1/users',
    require('./routes/dashboard/dashboardUserRoutes'),
);
app.use('/dashboard/v1/contact', require('./routes/dashboard/contactRoutes'));
app.use('/dashboard/v1/stats', require('./routes/dashboard/statsRoutes'));
app.use('/dashboard/v1/quizzes', require('./routes/dashboard/quizRoutes'));
app.use('/dashboard/v1/wallet', require('./routes/dashboard/walletRoutes'));
app.use('/dashboard/v1/war-rooms', require('./routes/dashboard/warRoomRoutes'));
app.use('/dashboard/v1/emails', require('./routes/dashboard/emailRoutes'));

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

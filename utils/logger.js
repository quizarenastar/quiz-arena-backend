const { createLogger, format, transports } = require('winston');
const { Writable } = require('stream');
const Log = require('../models/Log');

const isProduction = process.env.NODE_ENV === 'production';

const logger = createLogger({
    level: isProduction ? 'info' : 'debug',
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize({ all: !isProduction }),
                format.timestamp(),
                format.printf(
                    ({ level, message, timestamp, stack, ...meta }) => {
                        const base = `${timestamp} ${level}: ${message}`;
                        const stackPart = stack ? `\n${stack}` : '';
                        const metaPart = Object.keys(meta).length
                            ? ` ${JSON.stringify(meta)}`
                            : '';
                        return base + metaPart + stackPart;
                    }
                )
            ),
        }),
        // Persist logs to MongoDB
        new transports.Stream({
            level: 'info',
            stream: new Writable({
                objectMode: true,
                write(info, _enc, callback) {
                    const { level, message, timestamp, ...meta } = info;
                    const safeMessage =
                        typeof message === 'string'
                            ? message
                            : JSON.stringify(message);
                    Log.create({
                        level,
                        message: safeMessage,
                        meta: Object.keys(meta).length ? meta : undefined,
                        timestamp: timestamp ? new Date(timestamp) : new Date(),
                        label: info.label,
                        hostname: info.hostname,
                    })
                        .then(() => callback())
                        .catch(() => callback()); // avoid blocking on logging errors
                },
            }),
        }),
    ],
});

module.exports = logger;

const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
    {
        level: { type: String, index: true },
        message: { type: String },
        meta: { type: Object },
        // TTL index -> documents will expire 1 day after this timestamp
        timestamp: { type: Date, default: Date.now, index: { expires: '1d' } },
        label: { type: String },
        hostname: { type: String },
    },
    { timestamps: true }
);

const Log = mongoose.model('Log', logSchema);

module.exports = Log;

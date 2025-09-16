const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
    {
        level: { type: String, index: true },
        message: { type: String },
        meta: { type: Object },
        timestamp: { type: Date, index: true },
        label: { type: String },
        hostname: { type: String },
    },
    { timestamps: true }
);

const Log = mongoose.model('Log', logSchema);

module.exports = Log;

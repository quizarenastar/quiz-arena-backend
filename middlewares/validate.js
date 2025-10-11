const { sendError } = require('../utils/sendResponse');

exports.validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        sendError(res, error.details[0].message, 400);
        return;
    }
    next();
};

// Validate request body
exports.validateBody = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        sendError(res, error.details[0].message, 400);
        return;
    }
    next();
};

// Validate request params
exports.validateParams = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
        sendError(res, error.details[0].message, 400);
        return;
    }
    next();
};

// Validate request query
exports.validateQuery = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
        sendError(res, error.details[0].message, 400);
        return;
    }
    next();
};

// Validate MongoDB ObjectId parameter
exports.validateMongoId =
    (paramName = 'id') =>
    (req, res, next) => {
        const id = req.params[paramName];
        const mongoIdPattern = /^[0-9a-fA-F]{24}$/;

        if (!mongoIdPattern.test(id)) {
            sendError(res, `Invalid ${paramName} format`, 400);
            return;
        }
        next();
    };

const { sendError } = require('../utils/sendResponse');

exports.validate = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        sendError(res, error.details[0].message, 400);
        return;
    }
    next();
};

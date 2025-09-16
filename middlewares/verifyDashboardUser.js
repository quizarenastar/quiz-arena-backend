const jwt = require('jsonwebtoken');
const { sendError } = require('../utils/sendResponse');

module.exports.verifyDashboardUser = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token || token === 'null') {
        sendError(res, 'Unauthorized', 401);
        return;
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            sendError(res, 'Unauthorized', 401);
        }

        req.user = decoded;
        next();
    });
};

module.exports.requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            sendError(
                res,
                'You do not have permission to perform this action',
                403
            );
        }
        next();
    };
};

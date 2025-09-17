const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../configs');

function getCookie(req, name) {
    const cookie = req.headers?.cookie || '';
    const parts = cookie.split(';').map((c) => c.trim());
    for (const part of parts) {
        if (part.startsWith(name + '=')) {
            return decodeURIComponent(part.substring(name.length + 1));
        }
    }
    return null;
}

module.exports = function verifyUser(req, res, next) {
    try {
        const token = getCookie(req, 'access_token');
        if (!token) {
            return res
                .status(401)
                .json({ success: false, message: 'Unauthorized' });
        }
        const payload = jwt.verify(token, JWT_SECRET);
        req.userId = payload.id;
        next();
    } catch (e) {
        return res
            .status(401)
            .json({ success: false, message: 'Unauthorized' });
    }
};

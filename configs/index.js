const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_DASHBOARD = process.env.JWT_SECRET_DASHBOARD;
const MONGODB_URI = process.env.MONGODB_URI;
const PORT = process.env.PORT || 5000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
const MODERATOR_SECRET = process.env.MODERATOR_SECRET || 'mod123';
const MANAGER_SECRET = process.env.MANAGER_SECRET || 'manager123';

module.exports = {
    JWT_SECRET,
    JWT_SECRET_DASHBOARD,
    MONGODB_URI,
    PORT,
    ADMIN_SECRET,
    MODERATOR_SECRET,
    MANAGER_SECRET,
};

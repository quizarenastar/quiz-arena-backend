const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_DASHBOARD = process.env.JWT_SECRET_DASHBOARD;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';
const MODERATOR_SECRET = process.env.MODERATOR_SECRET || 'mod123';
const MANAGER_SECRET = process.env.MANAGER_SECRET || 'manager123';
const expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// SMTP / Email
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || '587';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"Quiz Arena" <noreply@quizarena.in>';

module.exports = {
    JWT_SECRET,
    JWT_SECRET_DASHBOARD,
    MONGODB_URI,
    ADMIN_SECRET,
    MODERATOR_SECRET,
    MANAGER_SECRET,
    expiryDate,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM,
};

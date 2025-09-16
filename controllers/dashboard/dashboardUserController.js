const DashboardUser = require('../../models/DashboardUser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendError, sendSuccess } = require('../../utils/sendResponse');
const {
    JWT_SECRET_DASHBOARD,
    ADMIN_SECRET,
    MODERATOR_SECRET,
    MANAGER_SECRET,
} = require('../../configs');

module.exports.signUp = async (req, res, next) => {
    const { email, name, password, secretCode } = req.body;

    const existingUser = await DashboardUser.findOne({ email });
    if (existingUser) {
        sendError(res, 'User already exists', 400);
        return;
    }

    let role = 'User';
    if (secretCode) {
        if (secretCode === ADMIN_SECRET) {
            role = 'Admin';
        } else if (secretCode === MODERATOR_SECRET) {
            role = 'Moderator';
        } else if (secretCode === MANAGER_SECRET) {
            role = 'Manager';
        } else {
            sendError(res, 'Invalid secret code', 400);
            return;
        }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new DashboardUser({
        email,
        name,
        password: hashedPassword,
        role,
    });
    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
        { id: newUser._id, role: newUser.role },
        JWT_SECRET_DASHBOARD,
        {
            expiresIn: '7d',
        }
    );

    sendSuccess(
        res,
        { token, role: newUser.role },
        'User registered successfully',
        201
    );
};

module.exports.signIn = async (req, res, next) => {
    const { email, password } = req.body;

    const user = await DashboardUser.findOne({ email });
    if (!user) {
        sendError(res, 'Invalid credentials', 401);
        return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        sendError(res, 'Invalid credentials', 401);
        return;
    }
    const token = jwt.sign(
        { id: user._id, role: user.role },
        JWT_SECRET_DASHBOARD,
        { expiresIn: '7d' }
    );

    sendSuccess(res, { token, role: user.role }, 'Login successful');
};

module.exports.getAllDashboardUsers = async (req, res) => {
    const allUsers = DashboardUser.find();
    sendSuccess(res, allUsers, 'All User Of Dashboard');
};

module.exports.getAllUsers = async (req, res) => {
    const allUsers = User.find();
    sendSuccess(res, allUsers, 'All Users');
};

const DashboardUser = require('../../models/DashboardUser');
const User = require('../../models/User');
const Quiz = require('../../models/Quiz');
const QuizAttempt = require('../../models/QuizAttempt');
const Transaction = require('../../models/Transaction');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
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
        },
    );

    sendSuccess(
        res,
        { token, role: newUser.role },
        'User registered successfully',
        201,
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
        { expiresIn: '7d' },
    );

    sendSuccess(res, { token, role: user.role }, 'Login successful');
};

module.exports.getAllDashboardUsers = async (req, res) => {
    try {
        const allUsers = await DashboardUser.find();
        sendSuccess(res, allUsers, 'All Dashboard Users');
    } catch (err) {
        sendError(res, 'Failed to fetch dashboard users', 500);
    }
};

module.exports.getAllUsers = async (req, res) => {
    try {
        const allUsers = await User.find().lean();
        const mapped = allUsers.map((user) => ({
            ...user,
            currentBalance: user.wallet?.balance || 0,
            totalEarn: user.wallet?.totalEarned || 0,
            totalRedeem: user.wallet?.totalSpent || 0,
        }));
        sendSuccess(res, mapped, 'All Users');
    } catch (err) {
        sendError(res, 'Failed to fetch users', 500);
    }
};

module.exports.getUserDetail = async (req, res) => {
    try {
        const { userId } = req.params;
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const user = await User.findById(userObjectId).lean();
        if (!user) {
            return sendError(res, 'User not found', 404);
        }

        const [registeredQuizzes, attempts, transactions] = await Promise.all([
            Quiz.find({ 'participantManagement.registeredUsers': userObjectId })
                .select(
                    'title topic isPaid price status startTime endTime prizePool',
                )
                .sort({ startTime: -1 })
                .lean(),
            QuizAttempt.find({ userId: userObjectId })
                .populate('quizId', 'title topic isPaid price')
                .sort({ createdAt: -1 })
                .lean(),
            Transaction.find({ userId: userObjectId })
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        sendSuccess(
            res,
            {
                user: {
                    ...user,
                    currentBalance: user.wallet?.balance || 0,
                    totalEarn: user.wallet?.totalEarned || 0,
                    totalRedeem: user.wallet?.totalSpent || 0,
                },
                registeredQuizzes,
                attempts,
                transactions,
            },
            'User detail fetched',
        );
    } catch (err) {
        console.error('Get user detail error:', err);
        sendError(res, 'Failed to fetch user detail', 500);
    }
};

module.exports.giveBonusToUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;
        const adminId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return sendError(res, 'User not found', 404);
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const balanceBefore = user.wallet.balance;
                user.wallet.balance += amount;
                user.wallet.totalEarned += amount;
                await user.save({ session });

                const transaction = new Transaction({
                    userId,
                    type: 'bonus',
                    amount,
                    description:
                        reason || `Bonus of ₹${amount} credited by admin`,
                    status: 'completed',
                    paymentMethod: 'wallet',
                    balanceBefore,
                    balanceAfter: balanceBefore + amount,
                    metadata: {
                        bonusType: 'individual',
                        grantedBy: adminId,
                        reason,
                    },
                    verification: {
                        isVerified: true,
                        verifiedBy: adminId,
                        verifiedAt: new Date(),
                    },
                });
                await transaction.save({ session });
            });

            sendSuccess(
                res,
                null,
                `Bonus of ₹${amount} given to ${user.username}`,
            );
        } finally {
            await session.endSession();
        }
    } catch (err) {
        console.error('Give bonus error:', err);
        sendError(res, 'Failed to give bonus', 500);
    }
};

module.exports.giveBonusToAllUsers = async (req, res) => {
    try {
        const { amount, reason } = req.body;
        const adminId = req.user.id;

        const users = await User.find({ blocked: { $ne: true } });
        if (users.length === 0) {
            return sendError(res, 'No active users found', 404);
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                for (const user of users) {
                    const balanceBefore = user.wallet.balance;
                    user.wallet.balance += amount;
                    user.wallet.totalEarned += amount;
                    await user.save({ session });

                    const transaction = new Transaction({
                        userId: user._id,
                        type: 'bonus',
                        amount,
                        description:
                            reason ||
                            `Bulk bonus of ₹${amount} credited by admin`,
                        status: 'completed',
                        paymentMethod: 'wallet',
                        balanceBefore,
                        balanceAfter: balanceBefore + amount,
                        metadata: {
                            bonusType: 'bulk',
                            grantedBy: adminId,
                            reason,
                        },
                        verification: {
                            isVerified: true,
                            verifiedBy: adminId,
                            verifiedAt: new Date(),
                        },
                    });
                    await transaction.save({ session });
                }
            });

            sendSuccess(
                res,
                { usersCount: users.length },
                `Bonus of ₹${amount} given to ${users.length} users`,
            );
        } finally {
            await session.endSession();
        }
    } catch (err) {
        console.error('Give bonus to all users error:', err);
        sendError(res, 'Failed to give bonus to all users', 500);
    }
};

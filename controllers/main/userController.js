const Client = require('../../models/User.js');
const Otp = require('../../models/Otp.js');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendSuccess, sendError } = require('../../utils/sendResponse.js');
const { JWT_SECRET, expiryDate } = require('../../configs/index.js');
const { sendOtpEmail } = require('../../services/emailService.js');

const generateUniqueUsername = async (baseUsername) => {
    let username = baseUsername;
    let counter = 1;

    while (await Client.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
    }

    return username;
};

/**
 * Step 1 — Send OTP to the user's email.
 * POST /api/v1/users/send-otp
 * Body: { email, username (optional), password }
 */
module.exports.sendOtp = async (req, res) => {
    const { email, username } = req.body;

    if (!email) {
        return sendError(res, 'Email is required', 400);
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return sendError(res, 'Please enter a valid email address', 400);
    }

    // Check if email already registered
    const existingUser = await Client.findOne({ email });
    if (existingUser) {
        return sendError(res, 'User already exists with this email', 402);
    }

    // Check if username already taken (if provided)
    if (username) {
        const existingUsername = await Client.findOne({
            username: username.toLowerCase(),
        });
        if (existingUsername) {
            return sendError(res, 'Username is already taken', 402);
        }
    }

    // Rate limit: prevent OTP spam — check if an OTP was sent within last 60 seconds
    const recentOtp = await Otp.findOne({
        email,
        createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recentOtp) {
        return sendError(
            res,
            'OTP already sent. Please wait 60 seconds before requesting again.',
            429
        );
    }

    // Generate 6-digit OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();

    // Hash OTP before storing
    const hashedOtp = await bcryptjs.hash(otpCode, 10);

    // Delete any previous OTPs for this email
    await Otp.deleteMany({ email });

    // Store new OTP
    await Otp.create({ email, otp: hashedOtp });

    // Send email
    try {
        await sendOtpEmail(email, otpCode);
    } catch (err) {
        return sendError(res, 'Failed to send verification email. Please try again.', 500);
    }

    return sendSuccess(res, {}, 'OTP sent to your email', 200);
};

/**
 * Step 2 — Verify OTP and create the user account.
 * POST /api/v1/users/signup
 * Body: { email, otp, username, password }
 */
module.exports.signup = async (req, res) => {
    const { username, email, password, otp } = req.body;

    if (!email || !otp || !password) {
        return sendError(res, 'Email, OTP, and password are required', 400);
    }

    // Find the latest OTP for this email
    const otpRecord = await Otp.findOne({ email }).sort({ createdAt: -1 });
    if (!otpRecord) {
        return sendError(res, 'OTP expired or not found. Please request a new one.', 400);
    }

    // Verify OTP
    const isMatch = await bcryptjs.compare(otp, otpRecord.otp);
    if (!isMatch) {
        return sendError(res, 'Invalid OTP. Please try again.', 400);
    }

    // OTP verified — delete it
    await Otp.deleteMany({ email });

    // Check if email already exists (race condition guard)
    const existingUser = await Client.findOne({ email });
    if (existingUser) {
        return sendError(res, 'User already exists with this email', 402);
    }

    // Ensure unique username
    let finalUsername;
    if (username) {
        finalUsername = await generateUniqueUsername(username.toLowerCase());
    } else {
        const base = email.split('@')[0];
        finalUsername = await generateUniqueUsername(base.toLowerCase());
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const newUser = new Client({
        username: finalUsername,
        email,
        password: hashedPassword,
    });

    await newUser.save();
    return sendSuccess(res, {}, 'User created successfully', 201);
};

module.exports.signin = async (req, res) => {
    const { email, password } = req.body;

    const validUser = await Client.findOne({ email });
    if (!validUser) {
        return sendError(res, 'Wrong email or password', 401);
    }

    const validPassword = await bcryptjs.compare(password, validUser.password);
    if (!validPassword) {
        return sendError(res, 'Wrong email or password', 401);
    }

    const token = jwt.sign({ id: validUser._id }, JWT_SECRET, {
        expiresIn: '7d',
    });
    const { password: hashedPassword, ...rest } = validUser._doc;

    return res
        .cookie('access_token', token, {
            httpOnly: true,
            expires: expiryDate,
        })
        .status(200)
        .json(rest);
};

module.exports.google = async (req, res) => {
    const { email, name } = req.body;

    let user = await Client.findOne({ email });

    if (user) {
        const token = jwt.sign({ id: user._id }, JWT_SECRET, {
            expiresIn: '7d',
        });
        const { password: hashedPassword, ...rest } = user._doc;

        return res
            .cookie('access_token', token, {
                httpOnly: true,
                expires: expiryDate,
            })
            .status(200)
            .json(rest);
    } else {
        const baseUsername = name.split(' ').join('').toLowerCase();
        const uniqueUsername = await generateUniqueUsername(baseUsername);

        const generatedPassword =
            Math.random().toString(36).slice(-8) +
            Math.random().toString(36).slice(-8);

        const hashedPassword = await bcryptjs.hash(generatedPassword, 10);

        const newUser = new Client({
            username: uniqueUsername,
            email,
            password: hashedPassword,
        });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, JWT_SECRET, {
            expiresIn: '7d',
        });
        const { password: hashedPassword2, ...rest } = newUser._doc;

        return res
            .cookie('access_token', token, {
                httpOnly: true,
                expires: expiryDate,
            })
            .status(200)
            .json(rest);
    }
};

module.exports.signout = (req, res) => {
    return res.clearCookie('access_token').status(200).json('Signout success!');
};

module.exports.getProfile = async (req, res) => {
    const user = await Client.findById(req.userId).select('-password');
    if (!user) {
        sendError(res, 'User not found', 404);
        return;
    }
    sendSuccess(res, user, 'Profile fetched');
};

module.exports.updateProfile = async (req, res) => {
    const { username, email, password, profilePicture } = req.body;
    const update = {};
    if (username) update.username = username;
    if (email) update.email = email;
    if (profilePicture !== undefined) update.profilePicture = profilePicture;
    if (password) {
        update.password = await bcryptjs.hash(password, 10);
    }
    const updated = await Client.findByIdAndUpdate(req.userId, update, {
        new: true,
    }).select('-password');
    if (!updated) {
        sendError(res, 'User not found', 404);
        return;
    }
    sendSuccess(res, updated, 'Profile updated');
};

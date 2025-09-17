const Client = require('../../models/User.js');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendSuccess, sendError } = require('../../utils/sendResponse.js');
const { JWT_SECRET, expiryDate } = require('../../configs/index.js');

const generateUniqueUsername = async (baseUsername) => {
    let username = baseUsername;
    let counter = 1;

    while (await Client.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
    }

    return username;
};

module.exports.signup = async (req, res) => {
    const { username, email, password } = req.body;

    // Check if email already exists
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
    console.log(expiryDate);
    console.log(JWT_SECRET);
    console.log(req.body);

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

const asyncHandler = require('express-async-handler'); // Simple wrapper for async functions to catch errors
const User = require('../models/User');
const jwt = require('jsonwebtoken'); // For generating tokens

// @desc    Register new user
// @route   POST /api/users/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Please enter all fields');
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    // Create user
    const user = await User.create({
        name,
        email,
        password, // Password will be hashed by the pre-save middleware in the User model
    });

    if (user) {
        res.status(201).json({ // 201 Created
            _id: user._id,
            name: user.name,
            email: user.email,
            token: generateToken(user._id), // Generate JWT
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Authenticate user & get token
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) { // Check password
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            token: generateToken(user._id), // Generate JWT
        });
    } else {
        res.status(401); // 401 Unauthorized
        throw new Error('Invalid email or password');
    }
});

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getMe = asyncHandler(async (req, res) => {
    // req.user will be available from the protect middleware
    res.json({
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
    });
});

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '1h', // Token expires in 1 hour
    });
};

module.exports = {
    registerUser,
    loginUser,
    getMe,
};
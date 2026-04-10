const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const verifyUser = require('../../middlewares/verifyUser');
const warRoomController = require('../../controllers/main/warRoomController');

// Rate limiting for AI suggestion endpoints
const aiSuggestionLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // 15 suggestion requests per 15 minutes per user
    message: {
        success: false,
        message: 'Too many AI suggestion requests. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// All war room routes require authentication
router.use(verifyUser);

// Create a new war room
router.post('/', warRoomController.createRoom);

// List public war rooms
router.get('/public', warRoomController.getPublicRooms);

// Get user's rooms (created or joined)
router.get('/my-rooms', warRoomController.getMyRooms);

// Get room by code
router.get('/code/:roomCode', warRoomController.getRoomByCode);

// Join a room by code
router.post('/code/:roomCode/join', warRoomController.joinRoom);

// Leave a room
router.post('/:roomId/leave', warRoomController.leaveRoom);

// Delete a room (host only)
router.delete('/:roomId', warRoomController.deleteRoom);

// Get AI-suggested questions from room context
router.get(
    '/:roomId/suggested-questions',
    aiSuggestionLimit,
    warRoomController.getSuggestedQuestions,
);

// Get quiz history for a room
router.get('/:roomId/history', warRoomController.getRoomHistory);

// Get detailed results of a specific round
router.get('/:roomId/history/:quizId', warRoomController.getRoundDetails);

module.exports = router;

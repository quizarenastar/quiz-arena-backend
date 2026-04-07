const express = require('express');
const router = express.Router();
const verifyUser = require('../../middlewares/verifyUser');
const warRoomController = require('../../controllers/main/warRoomController');

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

// Get quiz history for a room
router.get('/:roomId/history', warRoomController.getRoomHistory);

// Get detailed results of a specific round
router.get('/:roomId/history/:quizId', warRoomController.getRoundDetails);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');
const warRoomController = require('../../controllers/dashboard/warRoomController');

// All dashboard war room routes require dashboard auth
router.use(verifyDashboardUser);

// Get war room statistics
router.get('/stats', warRoomController.getStats);

// List all war rooms (paginated)
router.get('/', warRoomController.getAllRooms);

// Get detailed room info
router.get('/:roomId', warRoomController.getRoomDetails);

// Admin delete room
router.delete('/:roomId', warRoomController.deleteRoom);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
    verifyDashboardUser,
    requireRole,
} = require('../../middlewares/verifyDashboardUser');

// Admin routes - Protected by dashboard user verification
router.get(
    '/',
    verifyDashboardUser,
    requireRole(['admin', 'manager', 'moderator']),
    contactController.getAllContacts
);
router.patch(
    '/:id/status',
    verifyDashboardUser,
    requireRole(['admin', 'manager', 'moderator']),
    contactController.updateContactStatus
);

module.exports = router;

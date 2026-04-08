const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/dashboard/walletController');
const { validateBody, validateMongoId } = require('../../middlewares/validate');
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');

const { approveRejectSchema } = require('../../validation/commonValidations');

const { refundSchema } = require('../../validation/dashboardWalletValidation');

// Admin authentication middleware
router.use(verifyDashboardUser);

// Transaction management
router.get('/transactions', walletController.getTransactions);

// Approve fund addition
router.post(
    '/fund-addition/:transactionId/approve',
    validateMongoId('transactionId'),
    walletController.approveFundAddition
);

// Reject fund addition
router.post(
    '/fund-addition/:transactionId/reject',
    validateMongoId('transactionId'),
    validateBody(approveRejectSchema),
    walletController.rejectFundAddition
);

// Approve withdrawal
router.post(
    '/withdrawal/:transactionId/approve',
    validateMongoId('transactionId'),
    walletController.approveWithdrawal
);

// Reject withdrawal
router.post(
    '/withdrawal/:transactionId/reject',
    validateMongoId('transactionId'),
    validateBody(approveRejectSchema),
    walletController.rejectWithdrawal
);

// Get all pending wallet transactions
router.get('/pending-transactions', walletController.getTransactions);

// POST /api/wallet/refund/:transactionId - Process refund (admin only)
router.post(
    '/refund/:transactionId',
    validateMongoId('transactionId'),
    validateBody(refundSchema),
    walletController.processRefund
);

module.exports = router;

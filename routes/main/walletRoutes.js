const express = require('express');
const router = express.Router();
const walletController = require('../../controllers/walletController');
const {
    addFundsSchema,
    withdrawalSchema,
    refundSchema,
    transactionFilterSchema,
    earningsQuerySchema,
} = require('../../validation/quizValidation');
const {
    validateBody,
    validateQuery,
    validateMongoId,
} = require('../../middlewares/validate');
const verifyUser = require('../../middlewares/verifyUser');
const rateLimit = require('express-rate-limit');

// Rate limiting for wallet operations
const walletLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each IP to 30 requests per windowMs
    message: {
        success: false,
        message:
            'Too many wallet requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Sensitive operations rate limit
const sensitiveOperationsLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 requests per hour for sensitive operations
    message: {
        success: false,
        message:
            'Too many sensitive operations from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply authentication and rate limiting to all routes
router.use(verifyUser);
router.use(walletLimit);

// GET /api/wallet - Get wallet information
router.get('/', walletController.getWallet);

// POST /api/wallet/add-funds - Add funds to wallet
router.post(
    '/add-funds',
    sensitiveOperationsLimit,
    validateBody(addFundsSchema),
    walletController.addFunds
);

// GET /api/wallet/transactions - Get transaction history
router.get(
    '/transactions',
    validateQuery(transactionFilterSchema),
    walletController.getTransactions
);

// POST /api/wallet/withdraw - Request withdrawal
router.post(
    '/withdraw',
    sensitiveOperationsLimit,
    validateBody(withdrawalSchema),
    walletController.requestWithdrawal
);

// GET /api/wallet/earnings - Get earnings summary
router.get(
    '/earnings',
    validateQuery(earningsQuerySchema),
    walletController.getEarningsSummary
);

// Admin only routes
const {
    verifyDashboardUser,
} = require('../../middlewares/verifyDashboardUser');

// POST /api/wallet/refund/:transactionId - Process refund (admin only)
router.post(
    '/refund/:transactionId',
    verifyDashboardUser,
    validateMongoId('transactionId'),
    validateBody(refundSchema),
    walletController.processRefund
);

module.exports = router;

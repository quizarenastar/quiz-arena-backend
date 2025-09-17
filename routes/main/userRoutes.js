const express = require('express');
const router = express.Router();

const {
    signin,
    signup,
    google,
    getProfile,
    updateProfile,
    signout,
} = require('../../controllers/main/userController');
const verifyUser = require('../../middlewares/verifyUser');

router.post('/signup', signup);
router.post('/login', signin);
router.post('/google', google);
router.get('/me', verifyUser, getProfile);
router.put('/me', verifyUser, updateProfile);
router.post('/logout', signout);

module.exports = router;

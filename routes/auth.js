const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { checkAuth } = require('../middlewares/auth');

// Authentication routes
router.get('/register', authController.renderRegister);
router.post('/register', authController.register);

router.get('/login', authController.renderLogin);
router.post('/login', authController.login);

router.get('/logout', checkAuth, authController.logout);
router.get('/delete-account', checkAuth, authController.deleteAccount);

router.get('/verify/:token', authController.verifyEmail);

router.get('/forgot-password', authController.renderForgotPassword);
router.post('/forgot-password', authController.forgotPassword);

router.get('/reset-password/:token', authController.renderResetPassword);
router.post('/reset-password/:token', authController.resetPassword);

module.exports = router; 
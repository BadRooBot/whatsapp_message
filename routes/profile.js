const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { checkAuth } = require('../middlewares/auth');

// صفحة الملف الشخصي
router.get('/', checkAuth, profileController.getProfile);

// تحديث بيانات الملف الشخصي
router.post('/update', checkAuth, profileController.updateProfile);

// حذف الحساب
router.post('/delete-account', checkAuth, profileController.deleteAccount);

module.exports = router; 
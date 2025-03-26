const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { checkAuth } = require('../middlewares/auth');

// AI dashboard
router.get('/settings', checkAuth, aiController.renderAIDashboard);

// AI settings
router.post('/configure', checkAuth, aiController.configureAI);

// AI history
router.get('/history', checkAuth, aiController.getAIHistory);

// Test AI
router.post('/test', checkAuth, aiController.testAIResponse);

// إضافة مسار للحصول على قائمة النماذج المتاحة
router.get('/models', checkAuth, aiController.getAvailableModels);

// مسار جديد للبحث في جهات الاتصال
router.get('/search-contacts', checkAuth, aiController.searchContacts);

// إضافة جميع المجموعات إلى قائمة الأرقام المحظورة
router.post('/add-all-groups', checkAuth, aiController.addAllGroupsToBlocked);

// Add new route for conversation details
router.get('/conversation/:contactId', checkAuth, aiController.getConversationDetails);

module.exports = router; 
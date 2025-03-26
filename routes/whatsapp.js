const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// Dashboard
router.get('/dashboard', whatsappController.dashboard);

// Auth routes
router.get('/auth', whatsappController.initializeWhatsApp);
router.get('/session-status', whatsappController.getSessionStatus);
router.post('/reconnect', whatsappController.reconnectWhatsApp);

// Contact routes
router.get('/contacts', whatsappController.getContacts);

// Message routes
router.get('/send', whatsappController.renderSendMessage);
router.post('/send', whatsappController.sendMessage);

// Logout
router.get('/logout', whatsappController.logoutWhatsApp);

module.exports = router; 
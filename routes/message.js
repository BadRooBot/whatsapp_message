const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Get message history
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get message history
    const { rows } = await db.query(
      `SELECT wm.*, wc.name as contact_name
       FROM whatsapp_messages wm
       JOIN whatsapp_contacts wc ON wm.contact_id = wc.contact_id AND wm.user_id = wc.user_id
       WHERE wm.user_id = $1
       ORDER BY wm.created_at DESC
       LIMIT 100`,
      [userId]
    );
    
    res.render('dashboard/message-history', {
      user: req.user,
      messages: rows
    });
  } catch (error) {
    console.error('Message history error:', error);
    res.status(500).render('partials/error', {
      error: 'Error loading message history. Please try again.'
    });
  }
});

// Clear message history
router.post('/clear-history', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Delete all messages for this user
    await db.query(
      'DELETE FROM whatsapp_messages WHERE user_id = $1',
      [userId]
    );
    
    res.redirect('/message/history');
  } catch (error) {
    console.error('Clear message history error:', error);
    res.status(500).render('partials/error', {
      error: 'Error clearing message history. Please try again.'
    });
  }
});

module.exports = router; 
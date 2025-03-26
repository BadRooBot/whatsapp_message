const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware to check if user is authenticated
const checkAuth = async (req, res, next) => {
  try {
    // Check if user is logged in via session
    if (!req.session.userId) {
      return res.redirect('/auth/login');
    }
    
    // Fetch user from database to make sure they exist
    const { rows } = await db.query(
      'SELECT id, name, email, is_verified FROM users WHERE id = $1',
      [req.session.userId]
    );
    
    if (rows.length === 0) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }
    
    // Check if user is verified
    if (!rows[0].is_verified) {
      return res.redirect('/auth/verify');
    }
    
    // Add user to request object
    req.user = rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).render('partials/error', { 
      error: 'Authentication error. Please try again.'
    });
  }
};

// Middleware to check API authentication via JWT
const checkApiAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    jwt.verify(token, process.env.SESSION_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      req.userId = decoded.userId;
      next();
    });
  } catch (error) {
    console.error('API auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

module.exports = { checkAuth, checkApiAuth }; 
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../config/db');
const emailService = require('../services/email');

// Register new user
const register = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    // Validate input
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).render('auth/register', {
        error: 'All fields are required',
        name,
        email
      });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).render('auth/register', {
        error: 'Passwords do not match',
        name,
        email
      });
    }
    
    // Check if user already exists
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (userCheck.rows.length > 0) {
      return res.status(400).render('auth/register', {
        error: 'Email already in use',
        name
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    
    // Create new user
    const result = await db.query(
      'INSERT INTO users (name, email, password, verification_token) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hashedPassword, verificationToken]
    );
    
    // Send verification email
    await emailService.sendVerificationEmail(email, verificationToken);
    
    // Redirect to verification page
    res.render('auth/verification-sent', { email });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).render('auth/register', {
      error: 'Error during registration. Please try again.'
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).render('auth/login', {
        error: 'Email and password are required',
        email
      });
    }
    
    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(400).render('auth/login', {
        error: 'Invalid credentials',
        email
      });
    }
    
    const user = result.rows[0];
    
    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(400).render('auth/login', {
        error: 'Invalid credentials',
        email
      });
    }
    
    // Check if user is verified
    if (!user.is_verified) {
      return res.status(400).render('auth/login', {
        error: 'Please verify your email before logging in',
        email
      });
    }
    
    // Set session
    req.session.userId = user.id;
    
    // Redirect to dashboard
    res.redirect('/whatsapp/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).render('auth/login', {
      error: 'Error during login. Please try again.'
    });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    // Find user with token
    const result = await db.query(
      'SELECT * FROM users WHERE verification_token = $1',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).render('auth/verification-failed', {
        error: 'Invalid or expired verification token'
      });
    }
    
    const user = result.rows[0];
    
    // Update user
    await db.query(
      'UPDATE users SET is_verified = true, verification_token = NULL WHERE id = $1',
      [user.id]
    );
    
    // Redirect to login
    res.render('auth/verification-success');
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).render('auth/verification-failed', {
      error: 'Error during verification. Please try again.'
    });
  }
};

// Request password reset
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).render('auth/forgot-password', {
        error: 'Email is required'
      });
    }
    
    // Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    // Generate token even if user doesn't exist to prevent email enumeration
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour
    
    if (result.rows.length > 0) {
      // Update user with reset token
      await db.query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
        [resetToken, resetTokenExpires, email]
      );
      
      // Send reset email
      await emailService.sendPasswordResetEmail(email, resetToken);
    }
    
    // Always show success to prevent email enumeration
    res.render('auth/reset-password-sent', { email });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).render('auth/forgot-password', {
      error: 'Error processing your request. Please try again.'
    });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;
    
    // Validate passwords
    if (!password || !confirmPassword) {
      return res.status(400).render('auth/reset-password', {
        error: 'All fields are required',
        token
      });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).render('auth/reset-password', {
        error: 'Passwords do not match',
        token
      });
    }
    
    // Find user with token
    const result = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).render('auth/reset-password-failed', {
        error: 'Invalid or expired reset token'
      });
    }
    
    const user = result.rows[0];
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update user
    await db.query(
      'UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );
    
    // Redirect to login
    res.render('auth/reset-password-success');
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).render('auth/reset-password-failed', {
      error: 'Error resetting password. Please try again.'
    });
  }
};

// Logout
const logout = (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).render('partials/error', {
        error: 'Error during logout. Please try again.'
      });
    }
    
    res.redirect('/auth/login');
  });
};

// Delete account
const deleteAccount = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Delete user from database (cascades to all related data)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    
    // End session
    req.session.destroy();
    
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).render('partials/error', {
      error: 'Error deleting account. Please try again.'
    });
  }
};

// Render register page
const renderRegister = (req, res) => {
  if (req.session.userId) {
    return res.redirect('/whatsapp/dashboard');
  }
  res.render('auth/register');
};

// Render login page
const renderLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect('/whatsapp/dashboard');
  }
  res.render('auth/login', { error: null, success: null });
};

// Render forgot password page
const renderForgotPassword = (req, res) => {
  res.render('auth/forgot-password');
};

// Render reset password page
const renderResetPassword = (req, res) => {
  const { token } = req.params;
  res.render('auth/reset-password', { token });
};

module.exports = {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  logout,
  deleteAccount,
  renderRegister,
  renderLogin,
  renderForgotPassword,
  renderResetPassword
}; 
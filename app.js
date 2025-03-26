const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const whatsappRoutes = require('./routes/whatsapp');
const messageRoutes = require('./routes/message');
const aiRoutes = require('./routes/ai');
const profileRoutes = require('./routes/profile');

// Import middlewares
const { checkAuth } = require('./middlewares/auth');

// Initialize app
const app = express();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Setup view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Routes
app.use('/auth', authRoutes);
app.use('/whatsapp', checkAuth, whatsappRoutes);
app.use('/message', checkAuth, messageRoutes);
app.use('/ai', checkAuth, aiRoutes);
app.use('/profile', profileRoutes);

// Home route
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/whatsapp/dashboard');
  }
  res.render('auth/login', { error: null, success: null });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('partials/error', { 
    error: err.message || 'Something went wrong!'
  });
});

module.exports = app; 
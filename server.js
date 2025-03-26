const app = require('./app');
const dotenv = require('dotenv');

dotenv.config();

// Set port
const PORT = process.env.PORT || 3001;

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 
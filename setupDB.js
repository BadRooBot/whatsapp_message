const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function setupDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Starting database setup...');
    
    // Read the schema file
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'models', 'schema.sql'), 'utf8');
    
    // Execute schema SQL
    await pool.query(schemaSQL);
    
    console.log('Database setup completed successfully!');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase(); 
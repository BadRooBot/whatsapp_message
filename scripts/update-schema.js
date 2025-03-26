const db = require('../config/db');

async function updateSchema() {
  try {
    // Add allowed_numbers column if it doesn't exist
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'ai_settings' AND column_name = 'allowed_numbers'
        ) THEN
          ALTER TABLE ai_settings ADD COLUMN allowed_numbers JSONB DEFAULT '[]';
        END IF;
      END$$;
    `);
    
    console.log('Schema updated successfully');
  } catch (error) {
    console.error('Error updating schema:', error);
  } finally {
    process.exit();
  }
}

updateSchema(); 
-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_token VARCHAR(255),
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create session store for Express sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions ("expire");

-- Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_data TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create contacts table to store WhatsApp contacts
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  contact_id VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  number VARCHAR(255) NOT NULL,
  is_group BOOLEAN DEFAULT FALSE,
  is_manual BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, contact_id)
);

-- Add is_manual column if it doesn't exist (for backwards compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'whatsapp_contacts' AND column_name = 'is_manual'
  ) THEN
    ALTER TABLE whatsapp_contacts ADD COLUMN is_manual BOOLEAN DEFAULT FALSE;
  END IF;
END$$;

-- Create messages table to store sent messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  contact_id VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  message_id VARCHAR(255),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create ai_responses table to store AI responses
CREATE TABLE IF NOT EXISTS ai_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  contact_id VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create ai_settings table
CREATE TABLE IF NOT EXISTS ai_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  model TEXT DEFAULT 'deepseek/deepseek-chat:free',
  temperature FLOAT DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,
  system_prompt TEXT,
  auto_reply BOOLEAN DEFAULT false,
  enable_memory BOOLEAN DEFAULT false,
  memory_window INTEGER DEFAULT 10,
  group_reply BOOLEAN DEFAULT false,
  group_trigger TEXT,
  allowed_groups JSONB DEFAULT '[]',
  allowed_numbers JSONB DEFAULT '[]',
  auto_reply_mode VARCHAR(20) DEFAULT 'whitelist', -- 'all', 'whitelist', 'blacklist'
  blocked_numbers JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Add allowed_numbers column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'ai_settings' AND column_name = 'allowed_numbers'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN allowed_numbers JSONB DEFAULT '[]';
  END IF;
END$$;

-- Add auto_reply_mode column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'ai_settings' AND column_name = 'auto_reply_mode'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN auto_reply_mode VARCHAR(20) DEFAULT 'whitelist';
  END IF;
END$$;

-- Add blocked_numbers column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'ai_settings' AND column_name = 'blocked_numbers'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN blocked_numbers JSONB DEFAULT '[]';
  END IF;
END$$;

-- Create ai_conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  contact_id VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  is_group BOOLEAN DEFAULT FALSE,
  last_message TEXT,
  last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create ai_messages table to store conversation history
CREATE TABLE IF NOT EXISTS ai_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL, -- 'user', 'assistant', or 'system'
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_contact_id ON ai_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON ai_messages(conversation_id); 
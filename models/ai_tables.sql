-- Create ai_settings table
CREATE TABLE IF NOT EXISTS ai_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  api_key VARCHAR(255) NOT NULL,
  model VARCHAR(50) DEFAULT 'gpt-3.5-turbo',
  temperature FLOAT DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1000,
  system_prompt TEXT,
  auto_reply BOOLEAN DEFAULT FALSE,
  enable_memory BOOLEAN DEFAULT FALSE,
  memory_window INTEGER DEFAULT 10,
  group_reply BOOLEAN DEFAULT FALSE,
  group_trigger VARCHAR(50),
  allowed_groups TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

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
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_email TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  mailgun_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_mailgun_message_id
ON messages(mailgun_message_id)
WHERE mailgun_message_id IS NOT NULL AND mailgun_message_id <> '';

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
ON conversations(updated_at);

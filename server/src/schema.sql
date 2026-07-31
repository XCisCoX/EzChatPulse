PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL,          -- ms epoch
  last_seen_at  INTEGER                    -- ms epoch; NULL while online
);

CREATE TABLE IF NOT EXISTS chats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL CHECK (type IN ('private','group')),
  name       TEXT,                          -- NULL for private chats
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id   INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  stored_path TEXT NOT NULL,               -- relative to data/uploads
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','file')),
  text       TEXT,
  file_id    INTEGER REFERENCES files(id),
  reply_to   INTEGER REFERENCES messages(id),
  created_at INTEGER NOT NULL
);
-- keyset pagination: per-chat, newest first
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id DESC);

CREATE TABLE IF NOT EXISTS read_state (
  chat_id              INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_message_id INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);

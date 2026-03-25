-- ============================================================
-- LLM Router — SQLite Schema
-- Run once on first startup (server.ts calls initDb() which
-- executes these statements via CREATE TABLE IF NOT EXISTS)
-- ============================================================

-- Users (created/updated on every Google OAuth login)
CREATE TABLE IF NOT EXISTS users (
  uid           TEXT PRIMARY KEY,       -- Google sub (subject)
  email         TEXT NOT NULL,
  display_name  TEXT,
  photo_url     TEXT,
  last_login    TEXT NOT NULL           -- ISO-8601 timestamp
);

-- Per-user API keys, one row per provider
CREATE TABLE IF NOT EXISTS api_keys (
  uid           TEXT NOT NULL,
  provider      TEXT NOT NULL,
  key           TEXT NOT NULL,
  PRIMARY KEY (uid, provider)
);

-- Per-user & global settings (JSON blob for flexibility)
CREATE TABLE IF NOT EXISTS settings (
  uid           TEXT PRIMARY KEY,       -- use 'global' for app-wide settings
  data          TEXT NOT NULL DEFAULT '{}'  -- JSON
);

-- Per-user custom system prompt
CREATE TABLE IF NOT EXISTS user_settings (
  uid           TEXT PRIMARY KEY,
  system_prompt TEXT NOT NULL DEFAULT '',
  local_url     TEXT NOT NULL DEFAULT 'http://localhost:11434',
  use_memory    INTEGER NOT NULL DEFAULT 1,
  auto_memory   INTEGER NOT NULL DEFAULT 1
);

-- Chat history
CREATE TABLE IF NOT EXISTS history (
  id              TEXT PRIMARY KEY,     -- UUID
  uid             TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  response        TEXT NOT NULL,
  model           TEXT,
  tokens_used     INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'success',
  conversation_id TEXT,
  created_at      TEXT NOT NULL         -- ISO-8601 timestamp
);
CREATE INDEX IF NOT EXISTS idx_history_uid    ON history(uid);
CREATE INDEX IF NOT EXISTS idx_history_convid ON history(conversation_id);

-- Memory facts
CREATE TABLE IF NOT EXISTS facts (
  id         TEXT PRIMARY KEY,          -- UUID
  uid        TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_uid ON facts(uid);

-- Memory files (content stored on disk, path here)
CREATE TABLE IF NOT EXISTS memory_files (
  id         TEXT PRIMARY KEY,          -- UUID
  uid        TEXT NOT NULL,
  name       TEXT NOT NULL,
  file_path  TEXT NOT NULL,             -- relative path under /uploads
  mime_type  TEXT,
  size       INTEGER DEFAULT 0,
  is_skill   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_files_uid ON memory_files(uid);

-- Memory URLs
CREATE TABLE IF NOT EXISTS memory_urls (
  id         TEXT PRIMARY KEY,          -- UUID
  uid        TEXT NOT NULL,
  url        TEXT NOT NULL,
  title      TEXT,
  content    TEXT,                      -- markdown-converted page content
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_urls_uid ON memory_urls(uid);

-- Daily token usage
CREATE TABLE IF NOT EXISTS daily_usage (
  uid         TEXT NOT NULL,
  date        TEXT NOT NULL,            -- YYYY-MM-DD
  tokens      INTEGER NOT NULL DEFAULT 0,
  model_usage TEXT NOT NULL DEFAULT '{}', -- JSON map of model -> tokens
  PRIMARY KEY (uid, date)
);

-- Telegram account links
CREATE TABLE IF NOT EXISTS telegram_links (
  chat_id    TEXT PRIMARY KEY,
  uid        TEXT NOT NULL,
  username   TEXT,
  created_at TEXT NOT NULL
);

-- Telegram per-chat state
CREATE TABLE IF NOT EXISTS telegram_state (
  chat_id         TEXT PRIMARY KEY,
  session_id      TEXT,
  last_seen       INTEGER DEFAULT 0,   -- unix ms
  selected_model  TEXT,
  selected_provider TEXT,
  system_prompt   TEXT,
  sandbox_enabled INTEGER DEFAULT 0
);

-- Google OAuth tokens (for Gmail sending via Telegram bot)
CREATE TABLE IF NOT EXISTS user_tokens (
  uid                  TEXT PRIMARY KEY,
  google_access_token  TEXT,
  updated_at           TEXT NOT NULL
);

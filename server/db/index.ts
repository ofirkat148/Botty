import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: ReturnType<typeof drizzle> | null = null;

function bootstrapSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      display_name TEXT,
      photo_url TEXT,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      provider TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(uid, provider)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT,
      tokens_used INTEGER,
      status TEXT DEFAULT 'completed',
      conversation_id TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`CREATE INDEX IF NOT EXISTS history_uid_idx ON history (uid)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS history_uid_timestamp_idx ON history (uid, timestamp DESC)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      bot_id TEXT,
      content TEXT NOT NULL,
      is_skill INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`CREATE INDEX IF NOT EXISTS facts_bot_id_idx ON facts (bot_id)`);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_files (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT,
      size INTEGER,
      is_skill INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS memory_urls (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      uid TEXT PRIMARY KEY,
      local_url TEXT,
      use_memory INTEGER DEFAULT 1,
      auto_memory INTEGER DEFAULT 1,
      sandbox_mode INTEGER DEFAULT 0,
      history_retention_days INTEGER,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id TEXT PRIMARY KEY,
      telegram_bot_token TEXT,
      telegram_bot_enabled INTEGER DEFAULT 1,
      telegram_allowed_chat_ids TEXT,
      telegram_provider TEXT,
      telegram_model TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      uid TEXT PRIMARY KEY,
      system_prompt TEXT,
      custom_skills TEXT,
      custom_bots TEXT,
      conversation_labels TEXT,
      conversation_models TEXT,
      pinned_conversations TEXT,
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agent_definitions (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      command TEXT NOT NULL,
      use_when TEXT NOT NULL,
      boundaries TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      starter_prompt TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      memory_mode TEXT DEFAULT 'shared',
      executor_type TEXT NOT NULL DEFAULT 'internal-llm',
      endpoint TEXT,
      config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(uid, command)
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      date TEXT NOT NULL,
      tokens INTEGER DEFAULT 0,
      model_usage TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key TEXT PRIMARY KEY,
      hits INTEGER NOT NULL DEFAULT 0,
      reset_at TEXT NOT NULL
    )
  `);
}

export function initializeDatabase() {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH
    || path.join(__dirname, '..', '..', 'data', 'botty.db');

  mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  bootstrapSchema(sqlite);

  db = drizzle(sqlite, { schema });
  console.log(`✅ SQLite database ready: ${dbPath}`);
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export default getDatabase;

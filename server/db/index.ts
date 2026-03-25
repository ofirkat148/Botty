import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let db: ReturnType<typeof drizzle> | null = null;

async function bootstrapSchema(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      photo_url TEXT,
      last_login TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      provider VARCHAR(100) NOT NULL,
      encrypted_key TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(uid, provider)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      model VARCHAR(100) NOT NULL,
      tokens_used INTEGER,
      status VARCHAR(50) DEFAULT 'completed',
      conversation_id TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_skill BOOLEAN DEFAULT FALSE,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memory_files (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      type VARCHAR(50),
      size INTEGER,
      is_skill BOOLEAN DEFAULT FALSE,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memory_urls (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      title VARCHAR(255),
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      uid VARCHAR(255) PRIMARY KEY,
      local_url TEXT,
      use_memory BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_settings (
      uid VARCHAR(255) PRIMARY KEY,
      system_prompt TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      id TEXT PRIMARY KEY,
      uid VARCHAR(255) NOT NULL,
      date TIMESTAMP NOT NULL,
      tokens INTEGER DEFAULT 0,
      model_usage JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

export async function initializeDatabase() {
  if (db) {
    return db;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  db = drizzle(pool, { schema });

  // Test connection
  try {
    await pool.query('SELECT 1');
    await bootstrapSchema(pool);
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }

  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export default getDatabase;

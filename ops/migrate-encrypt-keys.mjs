#!/usr/bin/env node
/**
 * One-shot migration: re-encrypt legacy base64 API keys and Telegram token
 * to AES-256-GCM using KEY_ENCRYPTION_SECRET.
 *
 * Safe to run multiple times — already-encrypted (v1:) values are skipped.
 *
 * Usage:
 *   node ops/migrate-encrypt-keys.mjs
 *
 * Requires DATABASE_URL and KEY_ENCRYPTION_SECRET in env (or .env.local).
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Load .env.local if it exists (same resolution path as the main server)
// ---------------------------------------------------------------------------
const envFile = resolve(__dirname, '..', '.env.local');
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL;
const KEY_ENCRYPTION_SECRET = process.env.KEY_ENCRYPTION_SECRET;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}
if (!KEY_ENCRYPTION_SECRET || KEY_ENCRYPTION_SECRET.length < 16) {
  console.error('ERROR: KEY_ENCRYPTION_SECRET must be set and at least 16 characters.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers  (mirrors server/routes/keys.ts)
// ---------------------------------------------------------------------------
const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION_PREFIX = 'v1:';

function encryptionKey() {
  return createHash('sha256').update(KEY_ENCRYPTION_SECRET).digest();
}

function isLegacy(value) {
  return !value.startsWith(VERSION_PREFIX);
}

function decrypt(value) {
  if (isLegacy(value)) {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const key = encryptionKey();
  const raw = Buffer.from(value.slice(VERSION_PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function encrypt(plaintext) {
  const key = encryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------
async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let apiKeysMigrated = 0;
  let telegramMigrated = 0;

  try {
    // --- API keys ---
    const { rows: apiKeyRows } = await pool.query(
      'SELECT id, uid, provider, encrypted_key FROM api_keys',
    );

    for (const row of apiKeyRows) {
      if (!isLegacy(row.encrypted_key)) {
        continue; // already encrypted
      }

      let plaintext;
      try {
        plaintext = decrypt(row.encrypted_key);
      } catch {
        console.warn(`  SKIP api_keys row ${row.id} (${row.provider}): could not base64-decode`);
        continue;
      }

      if (!plaintext) {
        console.warn(`  SKIP api_keys row ${row.id} (${row.provider}): empty plaintext after decode`);
        continue;
      }

      const reencrypted = encrypt(plaintext);
      await pool.query(
        'UPDATE api_keys SET encrypted_key = $1 WHERE id = $2',
        [reencrypted, row.id],
      );
      console.log(`  ✓ api_keys: re-encrypted ${row.provider} key for uid ${row.uid}`);
      apiKeysMigrated++;
    }

    // --- Telegram bot token in app_settings ---
    const { rows: settingsRows } = await pool.query(
      "SELECT id, telegram_bot_token FROM app_settings WHERE id = 'global'",
    );

    for (const row of settingsRows) {
      if (!row.telegram_bot_token) continue;
      if (!isLegacy(row.telegram_bot_token)) continue; // already encrypted

      let plaintext;
      try {
        plaintext = decrypt(row.telegram_bot_token);
      } catch {
        console.warn(`  SKIP app_settings telegram token: could not decode`);
        continue;
      }

      if (!plaintext) {
        console.warn(`  SKIP app_settings telegram token: empty plaintext after decode`);
        continue;
      }

      const reencrypted = encrypt(plaintext);
      await pool.query(
        "UPDATE app_settings SET telegram_bot_token = $1 WHERE id = 'global'",
        [reencrypted],
      );
      console.log(`  ✓ app_settings: re-encrypted Telegram bot token`);
      telegramMigrated++;
    }
  } finally {
    await pool.end();
  }

  console.log(
    `\nMigration complete. API keys re-encrypted: ${apiKeysMigrated}, Telegram tokens re-encrypted: ${telegramMigrated}.`,
  );

  if (apiKeysMigrated === 0 && telegramMigrated === 0) {
    console.log('Nothing to migrate — all values already use AES-256-GCM encryption.');
  }
}

run().catch(error => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});

import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const VERSION_PREFIX = 'v1:';

function getDerivedEncryptionKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('KEY_ENCRYPTION_SECRET env var must be set and at least 16 characters');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptKey(plaintext: string): string {
  const key = getDerivedEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return VERSION_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptKey(stored: string): string {
  // Migration: handle legacy base64-only values that lack the version prefix
  if (!stored.startsWith(VERSION_PREFIX)) {
    try {
      return Buffer.from(stored, 'base64').toString('utf8');
    } catch {
      throw new Error('Failed to decrypt API key');
    }
  }

  const key = getDerivedEncryptionKey();
  const raw = Buffer.from(stored.slice(VERSION_PREFIX.length), 'base64');
  if (raw.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Encrypted API key is malformed');
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

// GET /api/keys - Get all API keys for current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.uid, uid));

    // Decrypt keys before sending
    const decryptedKeys = keys.map(key => ({
      provider: key.provider,
      key: decryptKey(key.encryptedKey),
    }));

    res.json(decryptedKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api/keys - Add a new API key
router.post('/', async (req: Request, res: Response) => {
  try {
    const { provider, key } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!provider || !key) {
      return res.status(400).json({ error: 'Provider and key are required' });
    }

    const id = crypto.randomUUID();
    const encryptedKey = encryptKey(key);

    await db
      .insert(apiKeys)
      .values({
        id,
        uid,
        provider,
        encryptedKey,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [apiKeys.uid, apiKeys.provider],
        set: {
          encryptedKey,
        },
      });

    res.json({ success: true, provider });
  } catch (error) {
    console.error('Error storing API key:', error);
    res.status(500).json({ error: 'Failed to store API key' });
  }
});

// DELETE /api/keys/:provider - Delete an API key
router.delete('/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;

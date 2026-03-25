import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

function encryptKey(key: string): string {
  // Simple encryption - use a more robust solution in production
  return Buffer.from(key).toString('base64');
}

function decryptKey(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString();
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

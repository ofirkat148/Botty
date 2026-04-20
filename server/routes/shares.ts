import { Router, Request, Response } from 'express';
import { randomUUID, randomBytes } from 'crypto';
import { getDatabase } from '../db/index.js';
import { history, conversationShares } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /api/shares/:conversationId — create or return existing share link (auth required)
router.post('/:conversationId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { conversationId } = req.params;

    // Verify the conversation belongs to this user
    const sample = await db
      .select({ id: history.id })
      .from(history)
      .where(and(eq(history.uid, uid), eq(history.conversationId, conversationId)))
      .limit(1);

    if (sample.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Return existing share if one already exists
    const existing = await db
      .select()
      .from(conversationShares)
      .where(and(eq(conversationShares.uid, uid), eq(conversationShares.conversationId, conversationId)))
      .limit(1);

    if (existing.length > 0) {
      return res.json({ token: existing[0].token, id: existing[0].id });
    }

    // Create a new share token
    const token = randomBytes(20).toString('base64url');
    const id = randomUUID();
    const title = typeof req.body.title === 'string' ? req.body.title.slice(0, 200) : null;

    await db.insert(conversationShares).values({ id, uid, conversationId, token, title });

    res.json({ token, id });
  } catch (error) {
    console.error('Error creating share:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// DELETE /api/shares/:conversationId — revoke a share link (auth required)
router.delete('/:conversationId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { conversationId } = req.params;

    await db
      .delete(conversationShares)
      .where(and(eq(conversationShares.uid, uid), eq(conversationShares.conversationId, conversationId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Error revoking share:', error);
    res.status(500).json({ error: 'Failed to revoke share' });
  }
});

// GET /api/shares/view/:token — public read-only view (NO auth)
router.get('/view/:token', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { token } = req.params;

    // Only allow url-safe base64 chars to avoid injection
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const shareRows = await db
      .select()
      .from(conversationShares)
      .where(eq(conversationShares.token, token))
      .limit(1);

    if (shareRows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = shareRows[0];

    // Check expiry
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Fetch conversation messages (prompt + response pairs only — no uid leaked)
    const messages = await db
      .select({
        prompt: history.prompt,
        response: history.response,
        model: history.model,
        provider: history.provider,
        timestamp: history.timestamp,
      })
      .from(history)
      .where(eq(history.conversationId, share.conversationId))
      .orderBy(desc(history.timestamp));

    // Return oldest-first for display
    messages.reverse();

    res.json({
      title: share.title,
      conversationId: share.conversationId,
      createdAt: share.createdAt,
      messages,
    });
  } catch (error) {
    console.error('Error fetching shared conversation:', error);
    res.status(500).json({ error: 'Failed to fetch shared conversation' });
  }
});

// GET /api/shares/my/:conversationId — check if a share exists for this conversation (auth required)
router.get('/my/:conversationId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { conversationId } = req.params;

    const rows = await db
      .select({ token: conversationShares.token, id: conversationShares.id })
      .from(conversationShares)
      .where(and(eq(conversationShares.uid, uid), eq(conversationShares.conversationId, conversationId)))
      .limit(1);

    if (rows.length === 0) {
      return res.json({ shared: false });
    }

    res.json({ shared: true, token: rows[0].token, id: rows[0].id });
  } catch (error) {
    console.error('Error checking share:', error);
    res.status(500).json({ error: 'Failed to check share' });
  }
});

export default router;

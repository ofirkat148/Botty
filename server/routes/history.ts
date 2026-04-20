import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { history } from '../db/schema.js';
import { and, eq, desc, like, or, ne } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { incrementDailyUsage } from '../utils/llm.js';

const router = Router();

// Protect all routes with auth middleware
router.use(authMiddleware);

// GET /api/history - Get chat history for the current user
// Query params: ?q=search+term&limit=50&archived=true&projectId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const rawLimit = Number(req.query.limit) || 50;
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const showArchived = req.query.archived === 'true';
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';

    let baseCondition = showArchived
      ? and(eq(history.uid, uid), eq(history.isArchived, true))
      : and(eq(history.uid, uid), ne(history.isArchived, true));

    if (projectId) {
      baseCondition = and(baseCondition, eq(history.projectId, projectId));
    }

    const whereCondition = q
      ? and(baseCondition, or(like(history.prompt, `%${q}%`), like(history.response, `%${q}%`)))
      : baseCondition;

    const rows = await db
      .select()
      .from(history)
      .where(whereCondition)
      .orderBy(desc(history.timestamp))
      .limit(limit);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/history - Add a new chat entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, response, model, provider, tokensUsed, conversationId } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!prompt || !response || !model) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = randomUUID();
    const newEntry = {
      id,
      uid,
      prompt,
      response,
      model,
      provider: provider || null,
      tokensUsed: tokensUsed || 0,
      status: 'completed',
      conversationId,
      timestamp: new Date().toISOString(),
    };

    await db.insert(history).values(newEntry);

    await incrementDailyUsage(uid, provider || 'local', model, tokensUsed || 0);

    res.json(newEntry);
  } catch (error) {
    console.error('Error creating history entry:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

// PATCH /api/history/group/:conversationId/archive - Archive a conversation
router.patch('/group/:conversationId/archive', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .update(history)
      .set({ isArchived: true })
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
});

// PATCH /api/history/group/:conversationId/unarchive - Unarchive a conversation
router.patch('/group/:conversationId/unarchive', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .update(history)
      .set({ isArchived: false })
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error unarchiving conversation:', error);
    res.status(500).json({ error: 'Failed to unarchive conversation' });
  }
});

// DELETE /api/history/group/:conversationId - Delete entire conversation
router.delete('/group/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    // Delete all entries for this conversation
    await db
      .delete(history)
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting history group:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// DELETE /api/history/all - Delete all history for the authenticated user
router.delete('/all', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    await db.delete(history).where(eq(history.uid, uid));

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing all history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

export default router;

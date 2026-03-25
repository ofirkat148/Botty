import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { history, dailyUsage } from '../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Protect all routes with auth middleware
router.use(authMiddleware);

// GET /api/history - Get chat history for the current user
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const rows = await db
      .select()
      .from(history)
      .where(eq(history.uid, uid))
      .orderBy(desc(history.timestamp))
      .limit(50);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/history - Add a new chat entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, response, model, tokensUsed, conversationId } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!prompt || !response || !model) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = crypto.randomUUID();
    const newEntry = {
      id,
      uid,
      prompt,
      response,
      model,
      tokensUsed: tokensUsed || 0,
      status: 'completed',
      conversationId,
      timestamp: new Date(),
    };

    await db.insert(history).values(newEntry);

    // Update daily usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingUsage = await db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.uid, uid))
      .where(sql`DATE(day_usage.date) = CURRENT_DATE`);

    if (existingUsage.length > 0) {
      await db
        .update(dailyUsage)
        .set({
          tokens: sql`tokens + ${tokensUsed || 0}`,
        })
        .where(eq(dailyUsage.uid, uid));
    } else {
      const usageId = crypto.randomUUID();
      await db.insert(dailyUsage).values({
        id: usageId,
        uid,
        date: new Date(),
        tokens: tokensUsed || 0,
        modelUsage: { [model]: 1 },
      });
    }

    res.json(newEntry);
  } catch (error) {
    console.error('Error creating history entry:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
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
      .where(eq(history.conversationId, conversationId))
      .where(eq(history.uid, uid));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting history group:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

export default router;

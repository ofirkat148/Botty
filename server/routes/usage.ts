import { Router, Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { dailyUsage } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { normalizeModelUsage } from '../utils/llm.js';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const usage = await db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.uid, uid), sql`DATE(${dailyUsage.date}) = CURRENT_DATE`))
      .limit(1);

    if (usage.length === 0) {
      return res.json({
        tokens: 0,
        modelUsage: [],
        date: new Date().toISOString().split('T')[0],
      });
    }

    res.json({
      tokens: usage[0].tokens || 0,
      modelUsage: normalizeModelUsage(usage[0].modelUsage),
      date: new Date().toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;

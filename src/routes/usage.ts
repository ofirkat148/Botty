import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { dailyUsage } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/usage - Get today's token usage
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.uid, uid))
      .where(sql`DATE(daily_usage.date) = CURRENT_DATE`);

    if (usage.length === 0) {
      return res.json({
        tokens: 0,
        modelUsage: {},
      });
    }

    res.json({
      tokens: usage[0].tokens || 0,
      modelUsage: usage[0].modelUsage || {},
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;

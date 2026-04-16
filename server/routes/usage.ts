import { Router, Request, Response } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
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

    const days = Math.min(Math.max(parseInt(String(req.query.days ?? '7'), 10) || 7, 7), 30);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (days - 1));

    const [usage, recentUsage] = await Promise.all([
      db
        .select()
        .from(dailyUsage)
        .where(and(eq(dailyUsage.uid, uid), sql`DATE(${dailyUsage.date}) = CURRENT_DATE`))
        .limit(1),
      db
        .select()
        .from(dailyUsage)
        .where(and(eq(dailyUsage.uid, uid), gte(dailyUsage.date, startDate.toISOString().split('T')[0])))
        .orderBy(desc(dailyUsage.date)),
    ]);

    const trendMap = new Map<string, number>();
    for (let index = 0; index < days; index += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + index);
      trendMap.set(day.toISOString().split('T')[0], 0);
    }

    recentUsage.forEach(row => {
      const key = new Date(row.date).toISOString().split('T')[0];
      trendMap.set(key, row.tokens || 0);
    });

    if (usage.length === 0) {
      return res.json({
        tokens: 0,
        modelUsage: [],
        providerUsage: [],
        trend: Array.from(trendMap.entries()).map(([date, tokens]) => ({ date, tokens })),
        date: new Date().toISOString().split('T')[0],
      });
    }

    const modelUsage = normalizeModelUsage(usage[0].modelUsage);
    const providerUsage = Array.from(modelUsage.reduce((accumulator, entry) => {
      const key = entry.provider || 'unknown';
      accumulator.set(key, (accumulator.get(key) || 0) + entry.tokens);
      return accumulator;
    }, new Map<string, number>()).entries())
      .map(([provider, tokens]) => ({ provider, tokens }))
      .sort((left, right) => right.tokens - left.tokens || left.provider.localeCompare(right.provider));

    res.json({
      tokens: usage[0].tokens || 0,
      modelUsage,
      providerUsage,
      trend: Array.from(trendMap.entries()).map(([date, tokens]) => ({ date, tokens })),
      date: new Date().toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;

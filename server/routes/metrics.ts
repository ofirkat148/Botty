import { Router, Request, Response } from 'express';
import { sql } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { dailyUsage, facts, history, users } from '../db/schema.js';

const router = Router();

/**
 * GET /api/metrics
 *
 * Prometheus-compatible plain-text metrics endpoint (no prom-client dependency).
 * Intentionally unauthenticated so Prometheus scrapers can reach it without JWT.
 * Bind behind a firewall/reverse-proxy if the port is exposed publicly.
 *
 * Protect with METRICS_TOKEN env var: if set, requires ?token=<value> or
 * Authorization: Bearer <value> header. In production, metrics are blocked
 * entirely if METRICS_TOKEN is not configured.
 */
router.get('/', async (req: Request, res: Response) => {
  const metricsToken = process.env.METRICS_TOKEN?.trim();
  if (!metricsToken && process.env.NODE_ENV === 'production') {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'METRICS_TOKEN is not configured. Set it to enable this endpoint.' });
    return;
  }
  if (metricsToken) {
    const provided =
      (req.headers.authorization?.replace(/^Bearer\s+/i, '').trim()) ||
      String(req.query.token || '').trim();
    if (provided !== metricsToken) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const db = getDatabase();

    const [
      userCountRow,
      historyTodayRow,
      historyTotalRow,
      factsCountRow,
      tokensTodayRow,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS c FROM users`),
      db.execute(sql`SELECT COUNT(*) AS c FROM history WHERE DATE(timestamp) = CURRENT_DATE`),
      db.execute(sql`SELECT COUNT(*) AS c FROM history`),
      db.execute(sql`SELECT COUNT(*) AS c FROM facts`),
      db.execute(sql`SELECT COALESCE(SUM(tokens_used), 0) AS c FROM daily_usage WHERE DATE(date) = CURRENT_DATE`),
    ]);

    const g = (name: string, help: string, value: number | string) =>
      `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;

    const lines = [
      g('botty_users_total', 'Total registered users', Number(userCountRow.rows[0]?.c ?? 0)),
      g('botty_history_requests_today', 'Chat requests completed today', Number(historyTodayRow.rows[0]?.c ?? 0)),
      g('botty_history_requests_total', 'Total chat requests ever completed', Number(historyTotalRow.rows[0]?.c ?? 0)),
      g('botty_facts_total', 'Total stored memory facts across all users', Number(factsCountRow.rows[0]?.c ?? 0)),
      g('botty_tokens_used_today', 'LLM tokens consumed today (all users)', Number(tokensTodayRow.rows[0]?.c ?? 0)),
      g('botty_up', 'Whether Botty is up and the database is reachable', 1),
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines);
  } catch (error) {
    console.error('Metrics scrape failed:', error);
    // Still emit botty_up=0 so Prometheus can alert
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send('# HELP botty_up Whether Botty is up and the database is reachable\n# TYPE botty_up gauge\nbotty_up 0\n');
  }
});

export default router;

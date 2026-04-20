import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDatabase } from './db/index.js';
import authRoutes from './routes/auth.js';
import historyRoutes from './routes/history.js';
import memoryRoutes from './routes/memory.js';
import settingsRoutes from './routes/settings.js';
import keysRoutes from './routes/keys.js';
import usageRoutes from './routes/usage.js';
import chatRoutes from './routes/chat.js';
import metricsRoutes from './routes/metrics.js';
import projectsRoutes from './routes/projects.js';
import sharesRoutes from './routes/shares.js';
import { getTelegramBotStatus, startTelegramBot } from './services/telegram.js';
import { getLocalProviderStatus, reconcileAllFacts } from './utils/llm.js';
import { logger } from './utils/logger.js';
import { lt, sql } from 'drizzle-orm';
import { history } from './db/schema.js';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const distDir = path.join(__dirname, '..', 'dist');

function getCorsOrigins() {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();

  if (publicBaseUrl) {
    configured.push(publicBaseUrl.replace(/\/$/, ''));
  }

  return Array.from(new Set([...defaults, ...configured]));
}

function isAllowedOrigin(origin: string) {
  const allowedOrigins = getCorsOrigins();
  if (process.env.CORS_ORIGINS === '*') {
    const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (publicBaseUrl && !publicBaseUrl.startsWith('http://localhost') && !publicBaseUrl.startsWith('http://127.0.0.1')) {
      console.warn('[security] CORS_ORIGINS=* is set with a non-localhost PUBLIC_BASE_URL. This allows any origin. Restrict CORS_ORIGINS in production.');
    }
    return true;
  }
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1';
  } catch {
    return false;
  }
}

// Middleware
app.use(pinoHttp({
  logger,
  // Skip logging health checks to reduce noise
  autoLogging: {
    ignore: (req) => req.url === '/api/health',
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: false,
}));
app.use(express.json({ limit: '20mb' }));
if (existsSync(distDir)) {
  app.use(express.static(distDir));
}

// Initialize database on startup
let dbInitialized = false;

async function logStartupReadinessSummary() {
  const frontendReady = existsSync(path.join(distDir, 'index.html'));
  const [localProviderResult, telegramResult] = await Promise.allSettled([
    getLocalProviderStatus(process.env.LOCAL_LLM_URL || process.env.LOCAL_LLM_URL_CONTAINER),
    getTelegramBotStatus(),
  ]);

  const localProviderSummary = localProviderResult.status === 'fulfilled'
    ? `${localProviderResult.value.readiness}: ${localProviderResult.value.detail}`
    : `error: ${localProviderResult.reason instanceof Error ? localProviderResult.reason.message : 'unknown local model error'}`;

  const telegramSummary = telegramResult.status === 'fulfilled'
    ? telegramResult.value.configured
      ? (telegramResult.value.running
        ? `running${telegramResult.value.username ? ` as @${telegramResult.value.username}` : ''}`
        : `configured but not running${telegramResult.value.error ? ` (${telegramResult.value.error})` : ''}`)
      : (telegramResult.value.enabled ? 'not configured' : 'disabled')
    : `error: ${telegramResult.reason instanceof Error ? telegramResult.reason.message : 'unknown telegram status error'}`;

  console.log([
    '📋 Startup readiness',
    `- Frontend bundle: ${frontendReady ? 'ready' : 'missing dist/index.html'}`,
    `- Database: ${dbInitialized ? 'ready' : 'not ready'}`,
    `- Local LLM: ${localProviderSummary}`,
    `- Telegram: ${telegramSummary}`,
  ].join('\n'));
}

async function startServer() {
  try {
    // Initialize database
    console.log('Initializing database...');
    initializeDatabase();
    dbInitialized = true;
    console.log('✅ Database initialized successfully');
    const RECONCILE_TIMEOUT_MS = 30_000;
    await Promise.race([
      reconcileAllFacts(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('reconcileAllFacts timed out after 30s')), RECONCILE_TIMEOUT_MS)
      ),
    ]);
    console.log('✅ Facts reconciled successfully');

    // Prune old history entries if HISTORY_RETENTION_DAYS is configured
    const retentionDays = Number(process.env.HISTORY_RETENTION_DAYS);
    if (Number.isFinite(retentionDays) && retentionDays > 0) {
      try {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const db = getDatabase();
        const result = db.delete(history).where(lt(history.timestamp, cutoff.toISOString()));
        const deleted = (result as unknown as { changes?: number })?.changes ?? 0;
        if (deleted > 0) {
          console.log(`✅ Pruned ${deleted} history entries older than ${retentionDays} days`);
        }
      } catch (pruneErr) {
        console.error('⚠️  History prune failed (non-fatal):', pruneErr);
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: dbInitialized ? 'connected' : 'disconnected' });
  });

  // Rate limit auth endpoints — 20 requests per 15 minutes per IP.
  // Set DISABLE_RATE_LIMIT=true for local dev/test runs, or CI=true (set by GitHub Actions).
  const rateLimitDisabled = process.env.DISABLE_RATE_LIMIT === 'true' || process.env.CI === 'true';
  const WINDOW_MS = 15 * 60 * 1000;

  const sqliteRateLimitStore = {
    async increment(key: string) {
      const resetAt = new Date(Date.now() + WINDOW_MS).toISOString();
      const db = getDatabase();
      db.run(sql`
        INSERT INTO rate_limit_hits (key, hits, reset_at)
        VALUES (${key}, 1, ${resetAt})
        ON CONFLICT (key) DO UPDATE
          SET hits = CASE
                WHEN reset_at <= datetime('now') THEN 1
                ELSE hits + 1
              END,
              reset_at = CASE
                WHEN reset_at <= datetime('now') THEN ${resetAt}
                ELSE reset_at
              END
      `);
      const row = db.get(sql`SELECT hits, reset_at FROM rate_limit_hits WHERE key = ${key}`) as { hits: number; reset_at: string } | undefined;
      if (!row) return { totalHits: 1, resetTime: new Date(resetAt) };
      return { totalHits: Number(row.hits), resetTime: new Date(row.reset_at) };
    },
    async decrement(key: string) {
      getDatabase().run(sql`UPDATE rate_limit_hits SET hits = MAX(0, hits - 1) WHERE key = ${key}`);
    },
    async resetKey(key: string) {
      getDatabase().run(sql`DELETE FROM rate_limit_hits WHERE key = ${key}`);
    },
    async resetAll() {
      getDatabase().run(sql`DELETE FROM rate_limit_hits`);
    },
  };

  const authLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: rateLimitDisabled ? 10_000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication requests, please try again later.' },
    store: rateLimitDisabled ? undefined : sqliteRateLimitStore,
  });

  // Authentication routes
  app.use('/api/auth', authLimiter, authRoutes);

  // Application routes
  app.use('/api/chat', chatRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/keys', keysRoutes);
  app.use('/api/usage', usageRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/shares', sharesRoutes);

  // Fallback to Vite for client-side routing
  app.get('*', (req, res) => {
    if (!existsSync(path.join(distDir, 'index.html'))) {
      return res.status(404).json({ error: 'Frontend build not found. Run the Vite dev server or npm run build.' });
    }

    res.sendFile(path.join(distDir, 'index.html'));
  });

  // Start server
  const server = app.listen(Number(PORT), HOST, () => {
    console.log(`
🚀 Server is running at http://${HOST}:${PORT}
📊 Database: SQLite
🔐 Auth: Local JWT
    `);
  });

  // Graceful shutdown: stop accepting new connections and close cleanly
  const shutdown = () => {
    console.log('Received shutdown signal, closing server...');
    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });
    // Force-exit if connections don't drain within 10 seconds
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await startTelegramBot();
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
  }

  await logStartupReadinessSummary();
}

startServer().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export default app;

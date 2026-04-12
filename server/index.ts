import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './db/index.js';
import authRoutes from './routes/auth.js';
import historyRoutes from './routes/history.js';
import memoryRoutes from './routes/memory.js';
import settingsRoutes from './routes/settings.js';
import keysRoutes from './routes/keys.js';
import usageRoutes from './routes/usage.js';
import chatRoutes from './routes/chat.js';
import { getTelegramBotStatus, startTelegramBot } from './services/telegram.js';
import { getLocalProviderStatus, reconcileAllFacts } from './utils/llm.js';

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
  if (allowedOrigins.includes(origin) || process.env.CORS_ORIGINS === '*') {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.startsWith('192.168.')
      || hostname.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}

// Middleware
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
app.use(express.json());
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
    await initializeDatabase();
    dbInitialized = true;
    console.log('✅ Database initialized successfully');
    await reconcileAllFacts();
    console.log('✅ Facts reconciled successfully');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error;
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: dbInitialized ? 'connected' : 'disconnected' });
  });

  // Authentication routes
  app.use('/api/auth', authRoutes);

  // Application routes
  app.use('/api/chat', chatRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/keys', keysRoutes);
  app.use('/api/usage', usageRoutes);

  // Fallback to Vite for client-side routing
  app.get('*', (req, res) => {
    if (!existsSync(path.join(distDir, 'index.html'))) {
      return res.status(404).json({ error: 'Frontend build not found. Run the Vite dev server or npm run build.' });
    }

    res.sendFile(path.join(distDir, 'index.html'));
  });

  // Start server
  app.listen(Number(PORT), HOST, () => {
    console.log(`
🚀 Server is running at http://${HOST}:${PORT}
📊 Database: PostgreSQL
🔐 Auth: Local JWT
    `);
  });

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

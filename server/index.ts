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

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;
const distDir = path.join(__dirname, '..', 'dist');

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false,
}));
app.use(express.json());
if (existsSync(distDir)) {
  app.use(express.static(distDir));
}

// Initialize database on startup
let dbInitialized = false;

async function startServer() {
  try {
    // Initialize database
    console.log('Initializing database...');
    await initializeDatabase();
    dbInitialized = true;
    console.log('✅ Database initialized successfully');
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
  app.listen(PORT, () => {
    console.log(`
🚀 Server is running at http://localhost:${PORT}
📊 Database: PostgreSQL
🔐 Auth: Local JWT
    `);
  });
}

startServer().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export default app;

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db/index.js';
import { authMiddleware } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import historyRoutes from './routes/history.js';
import memoryRoutes from './routes/memory.js';
import settingsRoutes from './routes/settings.js';
import keysRoutes from './routes/keys.js';
import usageRoutes from './routes/usage.js';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('dist'));

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

  // Authentication routes (public)
  app.use('/api/auth', authRoutes);

  // Protected routes (with JWT middleware at path level)
  app.use('/api/history', historyRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/keys', keysRoutes);
  app.use('/api/usage', usageRoutes);

  // Fallback to Vite for client-side routing
  app.get('*', (req, res) => {
    res.sendFile(process.cwd() + '/dist/index.html');
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`
🚀 Server is running at http://localhost:${PORT}
📊 Database: PostgreSQL
🔐 Auth: JWT + Google OAuth
    `);
  });
}

startServer().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export default app;

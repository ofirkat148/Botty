import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { settings, userSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/settings - Get user settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const userSettings = await db
      .select()
      .from(settings)
      .where(eq(settings.uid, uid));

    if (userSettings.length === 0) {
      // Return default settings
      return res.json({
        uid,
        localUrl: null,
        useMemory: true,
        autoMemory: true,
      });
    }

    res.json(userSettings[0]);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings - Update user settings
router.post('/', async (req: Request, res: Response) => {
  try {
    const { localUrl, useMemory, autoMemory } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    // Upsert settings
    await db
      .insert(settings)
      .values({
        uid,
        localUrl: localUrl || null,
        useMemory: useMemory !== undefined ? useMemory : true,
        autoMemory: autoMemory !== undefined ? autoMemory : true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.uid,
        set: {
          localUrl: localUrl || null,
          useMemory: useMemory !== undefined ? useMemory : true,
          autoMemory: autoMemory !== undefined ? autoMemory : true,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/user-settings - Get system prompt and other user settings
router.get('/user-settings', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const userSettingsData = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.uid, uid));

    if (userSettingsData.length === 0) {
      return res.json({
        uid,
        systemPrompt: null,
      });
    }

    res.json(userSettingsData[0]);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

// POST /api/user-settings - Update system prompt
router.post('/user-settings', async (req: Request, res: Response) => {
  try {
    const { systemPrompt } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .insert(userSettings)
      .values({
        uid,
        systemPrompt: systemPrompt || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.uid,
        set: {
          systemPrompt: systemPrompt || null,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating user settings:', error);
    res.status(500).json({ error: 'Failed to update user settings' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { appSettings, settings, userSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { getTelegramBotStatus, refreshTelegramBot } from '../services/telegram.js';

const router = Router();
router.use(authMiddleware);
const APP_SETTINGS_ID = 'global';

function encryptValue(value: string): string {
  return Buffer.from(value).toString('base64');
}

function decryptValue(value: string): string {
  return Buffer.from(value, 'base64').toString();
}

// GET /api/settings - Get user settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const userSettings = await db
      .select()
      .from(settings)
      .where(eq(settings.uid, uid));

    const appSettingsRows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .limit(1);

    const appSettingsRow = appSettingsRows[0];
    const telegramBotToken = appSettingsRow?.telegramBotToken
      ? decryptValue(appSettingsRow.telegramBotToken)
      : null;

    if (userSettings.length === 0) {
      // Return default settings
      return res.json({
        uid,
        localUrl: null,
        useMemory: true,
        autoMemory: true,
        sandboxMode: false,
        telegramBotToken,
        telegramBotEnabled: appSettingsRow?.telegramBotEnabled !== false,
        telegramAllowedChatIds: appSettingsRow?.telegramAllowedChatIds || '',
        telegramProvider: appSettingsRow?.telegramProvider || 'auto',
        telegramModel: appSettingsRow?.telegramModel || '',
      });
    }

    res.json({
      ...userSettings[0],
      telegramBotToken,
      telegramBotEnabled: appSettingsRow?.telegramBotEnabled !== false,
      telegramAllowedChatIds: appSettingsRow?.telegramAllowedChatIds || '',
      telegramProvider: appSettingsRow?.telegramProvider || 'auto',
      telegramModel: appSettingsRow?.telegramModel || '',
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings - Update user settings
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      localUrl,
      useMemory,
      autoMemory,
      sandboxMode,
      telegramBotToken,
      telegramBotEnabled,
      telegramAllowedChatIds,
      telegramProvider,
      telegramModel,
    } = req.body;
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
        sandboxMode: sandboxMode === true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.uid,
        set: {
          localUrl: localUrl || null,
          useMemory: useMemory !== undefined ? useMemory : true,
          autoMemory: autoMemory !== undefined ? autoMemory : true,
          sandboxMode: sandboxMode === true,
          updatedAt: new Date(),
        },
      });

    await db
      .insert(appSettings)
      .values({
        id: APP_SETTINGS_ID,
        telegramBotToken: typeof telegramBotToken === 'string' && telegramBotToken.trim()
          ? encryptValue(telegramBotToken.trim())
          : null,
        telegramBotEnabled: telegramBotEnabled !== false,
        telegramAllowedChatIds: typeof telegramAllowedChatIds === 'string' && telegramAllowedChatIds.trim()
          ? telegramAllowedChatIds.trim()
          : null,
        telegramProvider: typeof telegramProvider === 'string' && telegramProvider.trim()
          ? telegramProvider.trim()
          : 'auto',
        telegramModel: typeof telegramModel === 'string' && telegramModel.trim()
          ? telegramModel.trim()
          : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: {
          telegramBotToken: typeof telegramBotToken === 'string' && telegramBotToken.trim()
            ? encryptValue(telegramBotToken.trim())
            : null,
          telegramBotEnabled: telegramBotEnabled !== false,
          telegramAllowedChatIds: typeof telegramAllowedChatIds === 'string' && telegramAllowedChatIds.trim()
            ? telegramAllowedChatIds.trim()
            : null,
          telegramProvider: typeof telegramProvider === 'string' && telegramProvider.trim()
            ? telegramProvider.trim()
            : 'auto',
          telegramModel: typeof telegramModel === 'string' && telegramModel.trim()
            ? telegramModel.trim()
            : null,
          updatedAt: new Date(),
        },
      });

    let telegramError: string | null = null;

    try {
      await refreshTelegramBot();
    } catch (error) {
      telegramError = error instanceof Error ? error.message : 'Failed to refresh Telegram bot';
      console.error('Telegram refresh after settings save failed:', error);
    }

    res.json({ success: true, telegramError });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/telegram-status', async (req: Request, res: Response) => {
  try {
    const status = await getTelegramBotStatus();
    res.json(status);
  } catch (error) {
    console.error('Error fetching Telegram bot status:', error);
    res.status(500).json({ error: 'Failed to fetch Telegram bot status' });
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

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { appSettings, settings, userSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { getTelegramBotStatus, refreshTelegramBot } from '../services/telegram.js';
import { normalizeSlashCommand, RESERVED_SLASH_COMMANDS } from '../../shared/functionPresets.js';

const router = Router();
router.use(authMiddleware);
const APP_SETTINGS_ID = 'global';

function encryptValue(value: string): string {
  return Buffer.from(value).toString('base64');
}

function decryptValue(value: string): string {
  return Buffer.from(value, 'base64').toString();
}

type StoredFunctionPreset = {
  id: string;
  kind: 'skill' | 'agent';
  title: string;
  description: string;
  command: string;
  useWhen?: string;
  boundaries?: string;
  systemPrompt: string;
  starterPrompt: string;
  provider?: string | null;
  model?: string | null;
  memoryMode?: 'shared' | 'isolated' | 'none';
};

function defaultUseWhen(kind: 'skill' | 'agent', title: string) {
  return kind === 'skill'
    ? `Use ${title || 'this skill'} for a narrow, repeatable capability inside the current chat.`
    : `Use ${title || 'this bot'} when a specialist should own a multi-turn task from start to finish.`;
}

function defaultBoundaries(kind: 'skill' | 'agent') {
  return kind === 'skill'
    ? 'Keeps the current provider, model, memory, and conversation context. Best for overlays, not full session control.'
    : 'Can steer provider, model, and memory for the session. Best for specialist ownership, not quick one-off overlays.';
}

function normalizeStoredFunctionPreset(value: unknown, expectedKind: 'skill' | 'agent'): StoredFunctionPreset | null {
  const candidate = value as Partial<StoredFunctionPreset> | null;
  const title = String(candidate?.title || '').trim();
  const description = String(candidate?.description || '').trim();
  const useWhen = String(candidate?.useWhen || '').trim() || defaultUseWhen(expectedKind, title);
  const boundaries = String(candidate?.boundaries || '').trim() || defaultBoundaries(expectedKind);
  const systemPrompt = String(candidate?.systemPrompt || '').trim();
  const starterPrompt = String(candidate?.starterPrompt || '').trim();
  const rawCommand = String(candidate?.command || '').trim();
  const command = normalizeSlashCommand(rawCommand || title);
  const provider = typeof candidate?.provider === 'string' && candidate.provider.trim()
    ? candidate.provider.trim().toLowerCase()
    : null;
  const model = typeof candidate?.model === 'string' && candidate.model.trim()
    ? candidate.model.trim()
    : null;
  const memoryMode = candidate?.memoryMode === 'isolated' || candidate?.memoryMode === 'none'
    ? candidate.memoryMode
    : 'shared';

  if (!title || !description || !systemPrompt || !starterPrompt || !command) {
    return null;
  }

  return {
    id: String(candidate?.id || randomUUID()),
    kind: expectedKind,
    title,
    description,
    command,
    useWhen,
    boundaries,
    systemPrompt,
    starterPrompt,
    provider: expectedKind === 'agent' ? provider : null,
    model: expectedKind === 'agent' ? model : null,
    memoryMode: expectedKind === 'agent' ? memoryMode : 'shared',
  };
}

function readStoredFunctionPresets(value: unknown, expectedKind: 'skill' | 'agent') {
  if (!Array.isArray(value)) {
    return [] as StoredFunctionPreset[];
  }

  const uniqueByCommand = new Map<string, StoredFunctionPreset>();

  value.forEach(item => {
    const normalized = normalizeStoredFunctionPreset(item, expectedKind);
    if (!normalized) {
      return;
    }

    if (!uniqueByCommand.has(normalized.command)) {
      uniqueByCommand.set(normalized.command, normalized);
    }
  });

  return Array.from(uniqueByCommand.values());
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
        customSkills: [],
        customBots: [],
      });
    }

    res.json({
      ...userSettingsData[0],
      customSkills: readStoredFunctionPresets(userSettingsData[0]?.customSkills, 'skill'),
      customBots: readStoredFunctionPresets(userSettingsData[0]?.customBots, 'agent'),
    });
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

router.get('/functions', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const rows = await db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1);
    const row = rows[0];

    res.json({
      skills: readStoredFunctionPresets(row?.customSkills, 'skill'),
      bots: readStoredFunctionPresets(row?.customBots, 'agent'),
    });
  } catch (error) {
    console.error('Error fetching custom functions:', error);
    res.status(500).json({ error: 'Failed to fetch custom functions' });
  }
});

router.post('/functions', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const kind = req.body?.kind === 'agent' ? 'agent' : req.body?.kind === 'skill' ? 'skill' : null;

    if (!kind) {
      return res.status(400).json({ error: 'Function kind is required.' });
    }

    const normalized = normalizeStoredFunctionPreset({
      id: randomUUID(),
      kind,
      title: req.body?.title,
      description: req.body?.description,
      command: req.body?.command,
      useWhen: req.body?.useWhen,
      boundaries: req.body?.boundaries,
      systemPrompt: req.body?.systemPrompt,
      starterPrompt: req.body?.starterPrompt,
      provider: req.body?.provider,
      model: req.body?.model,
      memoryMode: req.body?.memoryMode,
    }, kind);

    if (!normalized) {
      return res.status(400).json({ error: 'Title, description, prompt fields, and a valid command are required.' });
    }

    const rows = await db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1);
    const existingRow = rows[0];
    const currentSkills = readStoredFunctionPresets(existingRow?.customSkills, 'skill');
    const currentBots = readStoredFunctionPresets(existingRow?.customBots, 'agent');
    const existingCommands = new Set([...currentSkills, ...currentBots].map(item => item.command));

    if (RESERVED_SLASH_COMMANDS.has(normalized.command)) {
      return res.status(400).json({ error: 'That slash command is reserved by a built-in command, skill, or agent.' });
    }

    if (existingCommands.has(normalized.command)) {
      return res.status(400).json({ error: 'A custom skill or agent with that slash command already exists.' });
    }

    const nextSkills = kind === 'skill' ? [...currentSkills, normalized] : currentSkills;
    const nextBots = kind === 'agent' ? [...currentBots, normalized] : currentBots;

    await db
      .insert(userSettings)
      .values({
        uid,
        systemPrompt: existingRow?.systemPrompt || null,
        customSkills: nextSkills,
        customBots: nextBots,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.uid,
        set: {
          customSkills: nextSkills,
          customBots: nextBots,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true, item: normalized });
  } catch (error) {
    console.error('Error creating custom function:', error);
    res.status(500).json({ error: 'Failed to create custom function' });
  }
});

export default router;

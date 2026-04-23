import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { history, userSettings } from '../db/schema.js';
import { and, eq, desc, like, or, ne } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { incrementDailyUsage, callLLM, getProviderApiKey, getAvailableProviders, getRuntimeSettings, getDefaultLocalModel, getSuggestedModel } from '../utils/llm.js';

const router = Router();

// Protect all routes with auth middleware
router.use(authMiddleware);

// GET /api/history - Get chat history for the current user
// Query params: ?q=search+term&limit=50&archived=true&projectId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const rawLimit = Number(req.query.limit) || 50;
    const limit = Math.min(Math.max(1, rawLimit), 200);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const showArchived = req.query.archived === 'true';
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';

    let baseCondition = showArchived
      ? and(eq(history.uid, uid), eq(history.isArchived, true))
      : and(eq(history.uid, uid), ne(history.isArchived, true));

    if (projectId) {
      baseCondition = and(baseCondition, eq(history.projectId, projectId));
    }

    const whereCondition = q
      ? and(baseCondition, or(like(history.prompt, `%${q}%`), like(history.response, `%${q}%`)))
      : baseCondition;

    const rows = await db
      .select()
      .from(history)
      .where(whereCondition)
      .orderBy(desc(history.timestamp))
      .limit(limit);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// POST /api/history - Add a new chat entry
router.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, response, model, provider, tokensUsed, conversationId } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!prompt || !response || !model) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = randomUUID();
    const newEntry = {
      id,
      uid,
      prompt,
      response,
      model,
      provider: provider || null,
      tokensUsed: tokensUsed || 0,
      status: 'completed',
      conversationId,
      timestamp: new Date().toISOString(),
    };

    await db.insert(history).values(newEntry);

    await incrementDailyUsage(uid, provider || 'local', model, tokensUsed || 0);

    res.json(newEntry);
  } catch (error) {
    console.error('Error creating history entry:', error);
    res.status(500).json({ error: 'Failed to create history entry' });
  }
});

// PATCH /api/history/group/:conversationId/archive - Archive a conversation
router.patch('/group/:conversationId/archive', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .update(history)
      .set({ isArchived: true })
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
});

// PATCH /api/history/group/:conversationId/unarchive - Unarchive a conversation
router.patch('/group/:conversationId/unarchive', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .update(history)
      .set({ isArchived: false })
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error unarchiving conversation:', error);
    res.status(500).json({ error: 'Failed to unarchive conversation' });
  }
});

// DELETE /api/history/group/:conversationId - Delete entire conversation
router.delete('/group/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    // Delete all entries for this conversation
    await db
      .delete(history)
      .where(and(eq(history.conversationId, conversationId), eq(history.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting history group:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// DELETE /api/history/all - Delete all history for the authenticated user
router.delete('/all', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    await db.delete(history).where(eq(history.uid, uid));

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing all history:', error);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// POST /api/history/auto-title - Generate a short title for a conversation and persist it
router.post('/auto-title', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { conversationId, prompt } = req.body as { conversationId?: string; prompt?: string };

    if (!conversationId || !prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'conversationId and prompt are required' });
    }

    // Pick the fastest available provider to generate the title
    const runtimeSettings = await getRuntimeSettings(uid);
    const availableProviders = await getAvailableProviders(uid);

    let provider = '';
    let model = '';
    let apiKey = '';

    // Prefer local if available (free), then fastest cloud
    const preferredOrder: Array<'local' | 'google' | 'openai' | 'anthropic'> = ['local', 'google', 'openai', 'anthropic'];
    for (const p of preferredOrder) {
      if (!availableProviders.includes(p)) continue;
      if (p === 'local') {
        const localModel = await getDefaultLocalModel(runtimeSettings.localUrl);
        if (!localModel) continue;
        provider = 'local';
        model = localModel;
        apiKey = '';
        break;
      }
      const key = await getProviderApiKey(uid, p);
      if (!key) continue;
      provider = p;
      apiKey = key;
      model = getSuggestedModel(p, prompt, { preferFast: true });
      break;
    }

    if (!provider) {
      return res.status(200).json({ title: null, reason: 'no provider available' });
    }

    const titlePrompt = `Write a short conversation title (5 words or fewer, no punctuation, no quotes) that captures what this message is asking about:\n\n${prompt.slice(0, 400)}`;

    const result = await callLLM({
      prompt: titlePrompt,
      provider,
      model,
      apiKey,
      systemPrompt: 'You generate ultra-short conversation titles. Reply with only the title — no explanation, no quotes, no punctuation.',
      localUrl: runtimeSettings.localUrl,
    });

    const title = result.responseText.trim().replace(/^["']|["']$/g, '').slice(0, 80);
    if (!title) return res.status(200).json({ title: null });

    // Persist into conversationLabels in userSettings
    const existing = await db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1);
    const current = existing[0];
    const labels: Record<string, string> = current?.conversationLabels
      ? JSON.parse(current.conversationLabels as string)
      : {};

    // Only set if no manual label already exists
    if (!labels[conversationId]) {
      labels[conversationId] = title;
      const labelsJson = JSON.stringify(labels);
      if (current) {
        await db.update(userSettings).set({ conversationLabels: labelsJson }).where(eq(userSettings.uid, uid));
      } else {
        await db.insert(userSettings).values({ uid, conversationLabels: labelsJson });
      }
    }

    res.json({ title });
  } catch (error) {
    console.error('Auto-title error:', error);
    res.status(500).json({ error: 'Failed to generate title' });
  }
});

export default router;

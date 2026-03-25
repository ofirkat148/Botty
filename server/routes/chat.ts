import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth.js';
import { getDatabase } from '../db/index.js';
import { history } from '../db/schema.js';
import {
  callLLM,
  getAvailableProviders,
  getDefaultModel,
  getMemoryContext,
  getProviderApiKey,
  getRuntimeSettings,
  getSmartRoute,
  incrementDailyUsage,
} from '../utils/llm.js';

const router = Router();
router.use(authMiddleware);

router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await getAvailableProviders(req.userId!);
    res.json({ providers });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const uid = req.userId!;
  const prompt = String(req.body?.prompt || '').trim();
  const requestedProvider = String(req.body?.provider || '').trim().toLowerCase();
  const requestedModel = String(req.body?.model || '').trim();
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const incomingConversationId = String(req.body?.conversationId || '').trim();

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const runtimeSettings = await getRuntimeSettings(uid);
    const availableProviders = await getAvailableProviders(uid);

    const route = requestedProvider === 'auto' || !requestedProvider
      ? getSmartRoute(prompt, availableProviders)
      : {
          provider: requestedProvider,
          model: requestedModel || getDefaultModel(requestedProvider),
        };

    const provider = route.provider;
    const model = route.model;
    const apiKey = provider === 'local' ? '' : await getProviderApiKey(uid, provider);

    if (provider !== 'local' && !apiKey) {
      return res.status(400).json({ error: `No API key configured for ${provider}.` });
    }

    const memoryContext = runtimeSettings.useMemory ? await getMemoryContext(uid) : '';
    const systemPrompt = [runtimeSettings.systemPrompt, memoryContext].filter(Boolean).join('\n\n');
    const { responseText, tokensUsed } = await callLLM({
      prompt,
      provider,
      model,
      apiKey,
      systemPrompt,
      messages,
      localUrl: runtimeSettings.localUrl,
    });

    const db = getDatabase();
    const conversationId = incomingConversationId || randomUUID();
    const id = randomUUID();

    await db.insert(history).values({
      id,
      uid,
      prompt,
      response: responseText,
      model,
      tokensUsed,
      status: 'completed',
      conversationId,
      timestamp: new Date(),
    });

    await incrementDailyUsage(uid, model, tokensUsed);

    res.json({
      id,
      text: responseText,
      tokensUsed,
      provider,
      model,
      conversationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed';
    console.error('Chat route error:', error);
    res.status(500).json({ error: message });
  }
});

export default router;
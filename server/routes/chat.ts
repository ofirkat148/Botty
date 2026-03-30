import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAvailableProviders,
  getDefaultLocalModel,
  getProviderModelCatalog,
  getProviderStatuses,
  isAbortError,
  getRuntimeSettings,
} from '../utils/llm.js';
import { runChatForUser } from '../services/chat.js';

const router = Router();
router.use(authMiddleware);

router.get('/providers', async (req: Request, res: Response) => {
  try {
    const providers = await getAvailableProviders(req.userId!);
    const runtimeSettings = await getRuntimeSettings(req.userId!);
    const [defaultLocalModel, modelCatalog, providerStatuses] = await Promise.all([
      providers.includes('local')
        ? getDefaultLocalModel(runtimeSettings.localUrl)
        : Promise.resolve(null),
      getProviderModelCatalog(runtimeSettings.localUrl),
      getProviderStatuses(req.userId!, runtimeSettings.localUrl),
    ]);

    res.json({ providers, defaultLocalModel, modelCatalog, providerStatuses });
  } catch (error) {
    console.error('Error fetching providers:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const abortController = new AbortController();
  const abortRequest = () => abortController.abort();
  req.once('aborted', abortRequest);
  req.once('close', abortRequest);

  try {
    const result = await runChatForUser({
      uid: req.userId!,
      prompt: String(req.body?.prompt || '').trim(),
      requestedProvider: String(req.body?.provider || '').trim().toLowerCase(),
      routingMode: String(req.body?.routingMode || '').trim().toLowerCase(),
      requestedModel: String(req.body?.model || '').trim(),
      messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      incomingConversationId: String(req.body?.conversationId || '').trim(),
      activeBot: req.body?.activeBot && typeof req.body.activeBot === 'object'
        ? {
            id: String(req.body.activeBot.id || '').trim(),
            provider: typeof req.body.activeBot.provider === 'string' ? req.body.activeBot.provider : '',
            model: typeof req.body.activeBot.model === 'string' ? req.body.activeBot.model : '',
            memoryMode: req.body.activeBot.memoryMode,
          }
        : null,
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      signal: abortController.signal,
    });

    res.json(result);
  } catch (error) {
    if (isAbortError(error)) {
      if (!res.headersSent && !res.writableEnded) {
        res.status(499).json({ error: 'Request cancelled' });
      }
      return;
    }

    const message = error instanceof Error ? error.message : 'Chat request failed';
    console.error('Chat route error:', error);
    res.status(message === 'Prompt is required' || /^No API key configured/.test(message) ? 400 : 500).json({ error: message });
  } finally {
    req.off('aborted', abortRequest);
    req.off('close', abortRequest);
  }
});

export default router;
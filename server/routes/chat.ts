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
import { runChatForUser, streamChatForUser } from '../services/chat.js';

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
  const abortOnResponseClose = () => {
    if (!res.writableEnded) {
      abortRequest();
    }
  };
  req.once('aborted', abortRequest);
  res.once('close', abortOnResponseClose);

  try {
    const result = await runChatForUser({
      uid: req.userId!,
      prompt: String(req.body?.prompt || '').trim(),
      requestedProvider: String(req.body?.provider || '').trim().toLowerCase(),
      routingMode: String(req.body?.routingMode || '').trim().toLowerCase(),
      requestedModel: String(req.body?.model || '').trim(),
      messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      incomingConversationId: String(req.body?.conversationId || '').trim(),
      activeAgentId: typeof req.body?.activeAgentId === 'string' ? req.body.activeAgentId.trim() : '',
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
    res.status(message === 'Prompt is required' || /^No API key configured/.test(message) || message === 'Active agent not found' ? 400 : 500).json({ error: message });
  } finally {
    req.off('aborted', abortRequest);
    res.off('close', abortOnResponseClose);
  }
});

// POST /api/chat/stream — Server-Sent Events streaming chat
// Client reads SSE events: data: {"type":"chunk","delta":"..."} and data: {"type":"done","meta":{...}}
router.post('/stream', async (req: Request, res: Response) => {
  const abortController = new AbortController();
  const abortRequest = () => abortController.abort();
  req.once('aborted', abortRequest);
  res.once('close', abortRequest);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event: Record<string, unknown>) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  try {
    const result = await streamChatForUser({
      uid: req.userId!,
      prompt: String(req.body?.prompt || '').trim(),
      requestedProvider: String(req.body?.provider || '').trim().toLowerCase(),
      routingMode: String(req.body?.routingMode || '').trim().toLowerCase(),
      requestedModel: String(req.body?.model || '').trim(),
      messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      incomingConversationId: String(req.body?.conversationId || '').trim(),
      activeAgentId: typeof req.body?.activeAgentId === 'string' ? req.body.activeAgentId.trim() : '',
      attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
      signal: abortController.signal,
      onChunk: (delta) => send({ type: 'chunk', delta }),
    });

    send({
      type: 'done',
      meta: {
        id: result.id,
        text: result.text,
        tokensUsed: result.tokensUsed,
        model: result.model,
        provider: result.provider,
        conversationId: result.conversationId,
        routingMode: result.routingMode,
      },
    });
  } catch (error) {
    if (!isAbortError(error)) {
      const message = error instanceof Error ? error.message : 'Stream failed';
      console.error('Chat stream error:', error);
      send({ type: 'error', error: message });
    }
  } finally {
    req.off('aborted', abortRequest);
    res.off('close', abortRequest);
    if (!res.writableEnded) res.end();
  }
});

export default router;
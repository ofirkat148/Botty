import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  callLLM,
  getAvailableProviders,
  getDefaultLocalModel,
  getProviderApiKey,
  getProviderModelCatalog,
  getProviderStatuses,
  getSuggestedModel,
  isAbortError,
  getRuntimeSettings,
  streamCallLLM,
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

// POST /api/chat/compact — Summarize older messages into a compact context summary.
// Responds as a Server-Sent Events stream so the LLM output is piped back as
// it is generated rather than holding the connection open until the model finishes.
// Events: data: {"type":"chunk","delta":"..."} and data: {"type":"done","summary":"..."}
router.post('/compact', async (req: Request, res: Response) => {
  const uid = req.userId!;
  const rawMessages: Array<{ role: string; content: string; isCompact?: boolean }> = Array.isArray(req.body?.messages) ? req.body.messages : [];

  // Only summarize real (non-compact) messages; need at least 4 to be worth it
  const realMessages = rawMessages.filter(m => !m.isCompact && (m.role === 'user' || m.role === 'assistant'));
  if (realMessages.length < 4) {
    return res.json({ summary: '' });
  }

  // Cap at the most-recent 20 messages and 300 chars per message to bound LLM latency
  const cappedMessages = realMessages.slice(-20);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event: Record<string, unknown>) {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30_000);
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());

  try {
    const runtimeSettings = await getRuntimeSettings(uid);
    const availableProviders = await getAvailableProviders(uid);

    // Pick the first available provider (prefer fast cloud models for summarization)
    const preferredOrder = ['anthropic', 'google', 'openai', 'local'] as const;
    const summaryProvider = preferredOrder.find(p => availableProviders.includes(p)) ?? null;
    if (!summaryProvider) {
      send({ type: 'done', summary: '' });
      return res.end();
    }

    const defaultLocalModel = summaryProvider === 'local'
      ? await getDefaultLocalModel(runtimeSettings.localUrl)
      : null;

    const summaryModel = getSuggestedModel(summaryProvider as 'anthropic' | 'google' | 'openai' | 'local', '', { defaultLocalModel, preferFast: true });
    const apiKey = summaryProvider === 'local' ? '' : await getProviderApiKey(uid, summaryProvider);

    const conversationText = cappedMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 300)}`)
      .join('\n\n');

    let fullSummary = '';
    await streamCallLLM({
      prompt: `Summarize the following conversation in 3-5 sentences, capturing the key topics, decisions, and context needed to continue:\n\n${conversationText}`,
      provider: summaryProvider,
      model: summaryModel,
      apiKey,
      systemPrompt: 'You are a concise conversation summarizer. Output only the summary, no preamble or labels.',
      messages: [],
      localUrl: runtimeSettings.localUrl,
      signal: abortController.signal,
      onChunk: (delta) => {
        fullSummary += delta;
        send({ type: 'chunk', delta });
      },
    });

    send({ type: 'done', summary: fullSummary.trim() });
  } catch (error) {
    if (!isAbortError(error)) {
      console.error('Compact error:', error);
      send({ type: 'error', error: 'Summarization failed' });
    } else {
      send({ type: 'error', error: 'Summarization timed out' });
    }
    send({ type: 'done', summary: '' });
  } finally {
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }
});

export default router;
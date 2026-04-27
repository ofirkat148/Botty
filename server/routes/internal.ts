import { Router, Request, Response } from 'express';
import { runChatForUser } from '../services/chat.js';
import { isAbortError } from '../utils/llm.js';

const router = Router();

const SERVICE_UID = process.env.BOTTY_SERVICE_UID || 'local:kofir2007@gmail.com';

function checkSecret(req: Request, res: Response): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'INTERNAL_API_SECRET not configured' });
    return false;
  }
  const provided = req.headers['x-internal-secret'];
  if (!provided || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/internal/chat
// Called by local agents (Telegram bots, background services) that need
// Botty's LLM stack without a browser session.
// Auth: X-Internal-Secret header matching INTERNAL_API_SECRET env var.
// Body: { prompt, messages?, sessionSystemPrompt?, provider?, model? }
// Response: { responseText, model, tokensUsed }
router.post('/chat', async (req: Request, res: Response) => {
  if (!checkSecret(req, res)) return;

  const abortController = new AbortController();
  req.once('aborted', () => abortController.abort());
  res.once('close', () => abortController.abort());

  try {
    const result = await runChatForUser({
      uid: SERVICE_UID,
      prompt: String(req.body?.prompt || '').trim(),
      requestedProvider: String(req.body?.provider || '').trim().toLowerCase(),
      routingMode: String(req.body?.routingMode || '').trim().toLowerCase(),
      requestedModel: String(req.body?.model || '').trim(),
      messages: Array.isArray(req.body?.messages) ? req.body.messages : [],
      incomingConversationId: '',
      activeAgentId: '',
      attachments: [],
      webSearch: false,
      sessionSystemPrompt: typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.trim() : '',
      signal: abortController.signal,
    });

    res.json(result);
  } catch (error) {
    if (isAbortError(error)) {
      if (!res.headersSent) res.status(499).json({ error: 'Request cancelled' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Internal chat request failed';
    console.error('Internal chat error:', error);
    res.status(500).json({ error: message });
  }
});

export default router;

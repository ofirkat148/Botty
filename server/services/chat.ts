import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { history } from '../db/schema.js';
import {
  BotMemoryMode,
  buildChatSystemPrompt,
  callLLM,
  getAvailableProviders,
  getAutoRouteCandidates,
  getDefaultModel,
  getMemoryContext,
  getProviderApiKey,
  getRuntimeSettings,
  incrementDailyUsage,
  learnFactsFromConversation,
  shouldRetryWithAnotherProvider,
} from '../utils/llm.js';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ActiveBotConfig = {
  id: string;
  provider?: string | null;
  model?: string | null;
  memoryMode?: BotMemoryMode;
};

export type RunChatForUserInput = {
  uid: string;
  prompt: string;
  requestedProvider?: string;
  requestedModel?: string;
  messages?: ChatMessage[];
  incomingConversationId?: string | null;
  activeBot?: ActiveBotConfig | null;
};

export type RunChatForUserResult = {
  id: string;
  text: string;
  tokensUsed: number;
  provider: string;
  model: string;
  conversationId: string;
};

export async function runChatForUser(input: RunChatForUserInput): Promise<RunChatForUserResult> {
  const uid = input.uid;
  const prompt = String(input.prompt || '').trim();
  const requestedProvider = String(input.requestedProvider || '').trim().toLowerCase();
  const requestedModel = String(input.requestedModel || '').trim();
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const incomingConversationId = String(input.incomingConversationId || '').trim();
  const activeBot = input.activeBot && typeof input.activeBot.id === 'string'
    ? {
        id: input.activeBot.id.trim(),
        provider: typeof input.activeBot.provider === 'string' ? input.activeBot.provider.trim().toLowerCase() : '',
        model: typeof input.activeBot.model === 'string' ? input.activeBot.model.trim() : '',
        memoryMode: (input.activeBot.memoryMode === 'isolated' || input.activeBot.memoryMode === 'none')
          ? input.activeBot.memoryMode
          : 'shared' as BotMemoryMode,
      }
    : null;

  if (!prompt) {
    throw new Error('Prompt is required');
  }

  const runtimeSettings = await getRuntimeSettings(uid);
  const availableProviders = await getAvailableProviders(uid);
  const effectiveProvider = activeBot?.provider || requestedProvider;
  const effectiveModel = activeBot?.model || requestedModel;
  const shouldAutoRoute = effectiveProvider === 'auto' || !effectiveProvider;
  const routes = shouldAutoRoute
    ? getAutoRouteCandidates(prompt, availableProviders)
    : [{
        provider: effectiveProvider,
        model: effectiveModel || getDefaultModel(effectiveProvider),
      }];
  const memoryMode = activeBot?.memoryMode || 'shared';

  const memoryContext = runtimeSettings.useMemory || runtimeSettings.sandboxMode || memoryMode === 'isolated'
    ? await getMemoryContext(uid, {
        sandboxMode: runtimeSettings.sandboxMode,
        botId: memoryMode === 'isolated' ? activeBot?.id || null : null,
        memoryMode,
      })
    : '';
  const systemPrompt = buildChatSystemPrompt({
    systemPrompt: runtimeSettings.systemPrompt,
    memoryContext,
    sandboxMode: runtimeSettings.sandboxMode,
  });
  const attemptErrors: string[] = [];
  let responseText = '';
  let tokensUsed = 0;
  let provider = '';
  let model = '';
  let apiKey = '';

  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    const nextApiKey = route.provider === 'local' ? '' : await getProviderApiKey(uid, route.provider);

    if (route.provider !== 'local' && !nextApiKey) {
      if (shouldAutoRoute) {
        attemptErrors.push(`${route.provider}: not configured`);
        continue;
      }

      throw new Error(`No API key configured for ${route.provider}.`);
    }

    try {
      const result = await callLLM({
        prompt,
        provider: route.provider,
        model: route.model,
        apiKey: nextApiKey,
        systemPrompt,
        messages,
        localUrl: runtimeSettings.localUrl,
      });

      responseText = result.responseText;
      tokensUsed = result.tokensUsed;
      provider = route.provider;
      model = route.model;
      apiKey = nextApiKey;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown provider failure';
      attemptErrors.push(`${route.provider}: ${message}`);

      const hasFallback = index < routes.length - 1;
      if (!shouldAutoRoute || !hasFallback || !shouldRetryWithAnotherProvider(error)) {
        if (shouldAutoRoute && attemptErrors.length > 1) {
          throw new Error(`Auto route failed across configured providers. ${attemptErrors.join(' | ')}`);
        }

        throw error;
      }

      console.warn(`Auto route fallback: ${route.provider} failed, trying next provider.`, error);
    }
  }

  if (!responseText || !provider || !model) {
    throw new Error(`Auto route failed across configured providers. ${attemptErrors.join(' | ')}`);
  }

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

  if (runtimeSettings.autoMemory && memoryMode !== 'none') {
    try {
      await learnFactsFromConversation({
        uid,
        prompt,
        responseText,
        provider,
        model,
        apiKey,
        localUrl: runtimeSettings.localUrl,
        botId: memoryMode === 'isolated' ? activeBot?.id || null : null,
      });
    } catch (memoryError) {
      console.error('Automatic memory learning failed:', memoryError);
    }
  }

  return {
    id,
    text: responseText,
    tokensUsed,
    provider,
    model,
    conversationId,
  };
}
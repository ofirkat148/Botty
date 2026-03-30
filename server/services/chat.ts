import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { history } from '../db/schema.js';
import {
  BotMemoryMode,
  buildChatSystemPrompt,
  callLLM,
  getDefaultLocalModel,
  getAvailableProviders,
  getRouteCandidatesForMode,
  getDefaultModel,
  getSuggestedModel,
  isAbortError,
  isRoutingModeValue,
  getMemoryContext,
  normalizeRoutingMode,
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

type ChatAttachment = {
  name: string;
  content: string;
  type?: string;
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
  routingMode?: string;
  requestedModel?: string;
  messages?: ChatMessage[];
  incomingConversationId?: string | null;
  activeBot?: ActiveBotConfig | null;
  attachments?: ChatAttachment[];
  signal?: AbortSignal;
};

export type RunChatForUserResult = {
  id: string;
  text: string;
  tokensUsed: number;
  provider: string;
  model: string;
  conversationId: string;
  routingMode: string | null;
};

function normalizeChatAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as ChatAttachment[];
  }

  return value
    .map(item => ({
      name: String((item as ChatAttachment)?.name || '').trim(),
      content: String((item as ChatAttachment)?.content || '').trim(),
      type: typeof (item as ChatAttachment)?.type === 'string' ? (item as ChatAttachment).type : undefined,
    }))
    .filter(item => item.name && item.content)
    .slice(0, 6);
}

function buildPromptWithAttachments(prompt: string, attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return prompt;
  }

  const basePrompt = prompt.trim() || 'Please analyze the attached files.';
  const attachmentBlock = attachments
    .map((attachment, index) => {
      const typeLine = attachment.type ? `Type: ${attachment.type}` : 'Type: unknown';
      return [`[ATTACHMENT ${index + 1}] ${attachment.name}`, typeLine, attachment.content].join('\n');
    })
    .join('\n\n');

  return `${basePrompt}\n\n[ATTACHMENTS]\n${attachmentBlock}`;
}

export async function runChatForUser(input: RunChatForUserInput): Promise<RunChatForUserResult> {
  if (input.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

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
  const attachments = normalizeChatAttachments(input.attachments);

  if (!prompt && attachments.length === 0) {
    throw new Error('Prompt is required');
  }

  const promptForModel = buildPromptWithAttachments(prompt, attachments);

  const runtimeSettings = await getRuntimeSettings(uid);
  const availableProviders = await getAvailableProviders(uid);
  const defaultLocalModel = availableProviders.includes('local')
    ? await getDefaultLocalModel(runtimeSettings.localUrl)
    : null;
  const effectiveProvider = activeBot?.provider || requestedProvider;
  const routingMode = normalizeRoutingMode(input.routingMode || effectiveProvider);
  const effectiveModel = activeBot?.model || requestedModel;
  const shouldAutoRoute = isRoutingModeValue(effectiveProvider) || routingMode !== 'auto' || !effectiveProvider;
  const routes = shouldAutoRoute
    ? getRouteCandidatesForMode(routingMode, prompt, availableProviders, { defaultLocalModel })
    : [{
        provider: effectiveProvider,
        model: effectiveModel || getSuggestedModel(effectiveProvider, prompt, { defaultLocalModel }),
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
        prompt: promptForModel,
        provider: route.provider,
        model: route.model,
        apiKey: nextApiKey,
        systemPrompt,
        messages,
        localUrl: runtimeSettings.localUrl,
        signal: input.signal,
      });

      responseText = result.responseText;
      tokensUsed = result.tokensUsed;
      provider = route.provider;
      model = route.model;
      apiKey = nextApiKey;
      break;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

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

  if (input.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
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

  await incrementDailyUsage(uid, provider, model, tokensUsed);

  if (runtimeSettings.autoMemory && memoryMode !== 'none') {
    try {
      await learnFactsFromConversation({
        uid,
        prompt: promptForModel,
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
    routingMode: shouldAutoRoute ? routingMode : null,
  };
}
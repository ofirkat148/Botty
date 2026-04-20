import { randomUUID } from 'crypto';
import { eq, count } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { history } from '../db/schema.js';
import {
  BotMemoryMode,
  buildChatSystemPrompt,
  callLLM,
  streamCallLLM,
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
import { webSearch, formatSearchContext } from '../utils/search.js';
import type { AgentDefinition, ToolDefinition } from '../../shared/agentDefinitions.js';

function buildToolCatalogSection(tools: ToolDefinition[]): string {
  if (tools.length === 0) return '';
  const lines = ['[AVAILABLE TOOLS]', 'The following tools are available to you. Describe tool usage in your response when appropriate.'];
  tools.forEach((tool, i) => {
    lines.push(`\n${i + 1}. ${tool.name}: ${tool.description}`);
    if (tool.parametersSchema) {
      lines.push(`   Parameters: ${tool.parametersSchema}`);
    }
  });
  return lines.join('\n');
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatAttachment = {
  name: string;
  content: string;
  type?: string;
};

export type RunChatForUserInput = {
  uid: string;
  prompt: string;
  requestedProvider?: string;
  routingMode?: string;
  requestedModel?: string;
  messages?: ChatMessage[];
  incomingConversationId?: string | null;
  activeAgentId?: string | null;
  attachments?: ChatAttachment[];
  webSearch?: boolean;
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

async function runRemoteHttpAgent(params: {
  agent: AgentDefinition;
  prompt: string;
  systemPrompt: string;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  signal?: AbortSignal;
}) {
  const { agent, prompt, systemPrompt, messages, attachments, signal } = params;
  const endpoint = agent.endpoint?.trim();

  if (!endpoint) {
    throw new Error('Remote agent endpoint is not configured');
  }

  // Validate that the endpoint is a safe HTTP/HTTPS URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    throw new Error('Remote agent endpoint is not a valid URL');
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Remote agent endpoint must use http or https');
  }
  // Block SSRF via private/loopback IP ranges
  const hostname = parsedUrl.hostname;
  const privateRangePattern = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|\[::1\]$|localhost$)/i;
  if (privateRangePattern.test(hostname)) {
    throw new Error('Remote agent endpoint must not target a private or loopback address');
  }

  // Apply a hard 15-second timeout for remote agents
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 15_000);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: combinedSignal,
      body: JSON.stringify({
        agent: {
          id: agent.id,
          title: agent.title,
          command: agent.command,
          description: agent.description,
          useWhen: agent.useWhen,
          boundaries: agent.boundaries,
        },
        prompt,
        systemPrompt,
        messages,
        attachments,
        tools: agent.tools?.length ? agent.tools : null,
        config: agent.config || null,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body.trim() || `Remote agent request failed with ${response.status}`);
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const responseText = typeof payload.responseText === 'string'
      ? payload.responseText.trim()
      : typeof payload.text === 'string'
        ? payload.text.trim()
        : typeof payload.message === 'string'
          ? payload.message.trim()
          : '';

    if (!responseText) {
      throw new Error('Remote agent returned an empty response');
    }

    const tokensUsed = typeof payload.tokensUsed === 'number' && Number.isFinite(payload.tokensUsed)
      ? Math.max(0, payload.tokensUsed)
      : Math.ceil((systemPrompt.length + prompt.length + responseText.length) / 4);
    const model = typeof payload.model === 'string' && payload.model.trim()
      ? payload.model.trim()
      : agent.model?.trim() || 'external-agent';

    return {
      responseText,
      tokensUsed,
      provider: 'remote-http',
      model,
      apiKey: '',
    };
  } finally {
    clearTimeout(timeoutId);
  }
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
  const activeAgentId = String(input.activeAgentId || '').trim();
  const attachments = normalizeChatAttachments(input.attachments);
  const useWebSearch = input.webSearch === true;

  if (!prompt && attachments.length === 0) {
    throw new Error('Prompt is required');
  }

  // Inject web search context if requested
  let searchContext = '';
  if (useWebSearch && prompt) {
    try {
      const tavilyKey = process.env.TAVILY_API_KEY?.trim();
      if (tavilyKey) {
        const searchResult = await webSearch(prompt, tavilyKey, { maxResults: 5, signal: input.signal });
        searchContext = formatSearchContext(searchResult);
      }
    } catch (err) {
      console.warn('Web search failed:', err instanceof Error ? err.message : err);
    }
  }

  const promptForModel = buildPromptWithAttachments(
    searchContext ? `${searchContext}\n\nUser question: ${prompt}` : prompt,
    attachments
  );
  const activeAgent = activeAgentId ? await resolveAgentForUser(uid, activeAgentId) : null;

  if (activeAgentId && !activeAgent) {
    throw new Error('Active agent not found');
  }

  const runtimeSettings = await getRuntimeSettings(uid);
  const availableProviders = await getAvailableProviders(uid);
  const defaultLocalModel = availableProviders.includes('local')
    ? await getDefaultLocalModel(runtimeSettings.localUrl)
    : null;
  const effectiveProvider = activeAgent?.provider || requestedProvider;
  const routingMode = normalizeRoutingMode(input.routingMode || effectiveProvider);
  const effectiveModel = activeAgent?.model || requestedModel;
  const shouldAutoRoute = isRoutingModeValue(effectiveProvider) || routingMode !== 'auto' || !effectiveProvider;
  const routes = shouldAutoRoute
    ? getRouteCandidatesForMode(routingMode, prompt, availableProviders, { defaultLocalModel })
    : [{
        provider: effectiveProvider,
        model: effectiveModel || getSuggestedModel(effectiveProvider, prompt, { defaultLocalModel }),
      }];
  const memoryMode = (activeAgent?.memoryMode || 'shared') as BotMemoryMode;

  const memoryContext = memoryMode !== 'none' && (runtimeSettings.useMemory || runtimeSettings.sandboxMode || memoryMode === 'isolated')
    ? await getMemoryContext(uid, {
        sandboxMode: runtimeSettings.sandboxMode,
        botId: memoryMode === 'isolated' ? activeAgent?.id || null : null,
        memoryMode,
      })
    : '';
  const toolCatalogSection = activeAgent?.tools?.length
    ? buildToolCatalogSection(activeAgent.tools)
    : '';
  const systemPrompt = buildChatSystemPrompt({
    systemPrompt: [activeAgent?.systemPrompt || runtimeSettings.systemPrompt, toolCatalogSection].filter(Boolean).join('\n\n'),
    memoryContext,
    sandboxMode: runtimeSettings.sandboxMode,
  });

  // maxTurns: count existing turns in this conversation and emit a completion signal if the limit is reached
  let maxTurnsReached = false;
  if (activeAgent?.maxTurns && incomingConversationId) {
    const db = getDatabase();
    const [{ value: turnCount }] = await db
      .select({ value: count() })
      .from(history)
      .where(eq(history.conversationId, incomingConversationId));
    if (turnCount >= activeAgent.maxTurns) {
      maxTurnsReached = true;
    }
  }

  const attemptErrors: string[] = [];
  let responseText = '';
  let tokensUsed = 0;
  let provider = '';
  let model = '';
  let apiKey = '';

  if (maxTurnsReached) {
    responseText = `[Agent task complete — ${activeAgent!.title} has reached its ${activeAgent!.maxTurns}-turn limit for this conversation. Start a new chat to continue with this agent.]`;
    tokensUsed = 0;
    provider = 'system';
    model = 'completion-signal';
  } else if (activeAgent?.executorType === 'remote-http') {
    const remoteResult = await runRemoteHttpAgent({
      agent: activeAgent,
      prompt: promptForModel,
      systemPrompt,
      messages,
      attachments,
      signal: input.signal,
    });

    responseText = remoteResult.responseText;
    tokensUsed = remoteResult.tokensUsed;
    provider = remoteResult.provider;
    model = remoteResult.model;
    apiKey = remoteResult.apiKey;
  } else {

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
  }

  if (!maxTurnsReached && (!responseText || !provider || !model)) {
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
    timestamp: new Date().toISOString(),
  });

  if (!maxTurnsReached) {
    await incrementDailyUsage(uid, provider, model, tokensUsed);
  }

  if (runtimeSettings.autoMemory && memoryMode !== 'none' && !maxTurnsReached) {
    try {
      await learnFactsFromConversation({
        uid,
        prompt: promptForModel,
        responseText,
        provider,
        model,
        apiKey,
        localUrl: runtimeSettings.localUrl,
        botId: memoryMode === 'isolated' ? activeAgent?.id || null : null,
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

export type StreamChatForUserInput = RunChatForUserInput & {
  onChunk: (delta: string) => void;
};

/**
 * Streaming variant of runChatForUser.
 * Calls onChunk for each text delta. Returns the same shape as runChatForUser
 * so callers can persist history and return metadata via SSE done event.
 */
export async function streamChatForUser(input: StreamChatForUserInput): Promise<RunChatForUserResult> {
  if (input.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const uid = input.uid;
  const prompt = String(input.prompt || '').trim();
  const requestedProvider = String(input.requestedProvider || '').trim().toLowerCase();
  const requestedModel = String(input.requestedModel || '').trim();
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const incomingConversationId = String(input.incomingConversationId || '').trim();
  const activeAgentId = String(input.activeAgentId || '').trim();
  const attachments = normalizeChatAttachments(input.attachments);
  const useWebSearch = input.webSearch === true;

  if (!prompt && attachments.length === 0) {
    throw new Error('Prompt is required');
  }

  // Inject web search context if requested
  let searchContext = '';
  if (useWebSearch && prompt) {
    try {
      const tavilyKey = process.env.TAVILY_API_KEY?.trim();
      if (tavilyKey) {
        const searchResult = await webSearch(prompt, tavilyKey, { maxResults: 5, signal: input.signal });
        searchContext = formatSearchContext(searchResult);
      }
    } catch (err) {
      console.warn('Web search failed (stream):', err instanceof Error ? err.message : err);
    }
  }

  const promptForModel = buildPromptWithAttachments(
    searchContext ? `${searchContext}\n\nUser question: ${prompt}` : prompt,
    attachments
  );
  const activeAgent = activeAgentId ? await resolveAgentForUser(uid, activeAgentId) : null;

  if (activeAgentId && !activeAgent) {
    throw new Error('Active agent not found');
  }

  const runtimeSettings = await getRuntimeSettings(uid);
  const availableProviders = await getAvailableProviders(uid);
  const defaultLocalModel = availableProviders.includes('local')
    ? await getDefaultLocalModel(runtimeSettings.localUrl)
    : null;
  const effectiveProvider = activeAgent?.provider || requestedProvider;
  const routingMode = normalizeRoutingMode(input.routingMode || effectiveProvider);
  const effectiveModel = activeAgent?.model || requestedModel;
  const shouldAutoRoute = isRoutingModeValue(effectiveProvider) || routingMode !== 'auto' || !effectiveProvider;
  const routes = shouldAutoRoute
    ? getRouteCandidatesForMode(routingMode, prompt, availableProviders, { defaultLocalModel })
    : [{ provider: effectiveProvider, model: effectiveModel || getDefaultModel(effectiveProvider) }];

  const memoryMode: BotMemoryMode = (activeAgent?.memoryMode || 'shared') as BotMemoryMode;

  const memoryContext = runtimeSettings.useMemory || runtimeSettings.sandboxMode || memoryMode === 'isolated'
    ? await getMemoryContext(uid, {
        sandboxMode: runtimeSettings.sandboxMode,
        botId: memoryMode === 'isolated' ? activeAgent?.id || null : null,
        memoryMode,
      })
    : '';
  const systemPrompt = buildChatSystemPrompt({
    systemPrompt: activeAgent?.systemPrompt || runtimeSettings.systemPrompt,
    memoryContext,
    sandboxMode: runtimeSettings.sandboxMode,
  });

  const attemptErrors: string[] = [];
  let responseText = '';
  let tokensUsed = 0;
  let provider = '';
  let model = '';
  let apiKey = '';

  if (activeAgent?.executorType === 'remote-http') {
    // Remote HTTP agents don't support streaming — run normally and deliver as single chunk
    const remoteResult = await runRemoteHttpAgent({
      agent: activeAgent,
      prompt: promptForModel,
      systemPrompt,
      messages,
      attachments,
      signal: input.signal,
    });
    responseText = remoteResult.responseText;
    tokensUsed = remoteResult.tokensUsed;
    provider = remoteResult.provider;
    model = remoteResult.model;
    apiKey = remoteResult.apiKey;
    input.onChunk(responseText);
  } else {
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
        let accumulated = '';
        const result = await streamCallLLM({
          prompt: promptForModel,
          provider: route.provider,
          model: route.model,
          apiKey: nextApiKey,
          systemPrompt,
          messages,
          localUrl: runtimeSettings.localUrl,
          signal: input.signal,
          onChunk: (delta) => {
            accumulated += delta;
            input.onChunk(delta);
          },
        });

        responseText = accumulated;
        tokensUsed = result.tokensUsed;
        provider = route.provider;
        model = route.model;
        apiKey = nextApiKey;
        break;
      } catch (error) {
        if (isAbortError(error)) throw error;

        const message = error instanceof Error ? error.message : 'Unknown provider failure';
        attemptErrors.push(`${route.provider}: ${message}`);

        const hasFallback = index < routes.length - 1;
        if (!shouldAutoRoute || !hasFallback || !shouldRetryWithAnotherProvider(error)) {
          if (shouldAutoRoute && attemptErrors.length > 1) {
            throw new Error(`Auto route failed across configured providers. ${attemptErrors.join(' | ')}`);
          }
          throw error;
        }

        console.warn(`Auto route fallback (stream): ${route.provider} failed, trying next.`, error);
      }
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
    timestamp: new Date().toISOString(),
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
        botId: memoryMode === 'isolated' ? activeAgent?.id || null : null,
      });
    } catch (memoryError) {
      console.error('Automatic memory learning failed (stream):', memoryError);
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
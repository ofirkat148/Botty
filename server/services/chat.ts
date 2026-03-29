import { randomUUID } from 'crypto';
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
  learnFactsFromConversation,
} from '../utils/llm.js';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type RunChatForUserInput = {
  uid: string;
  prompt: string;
  requestedProvider?: string;
  requestedModel?: string;
  messages?: ChatMessage[];
  incomingConversationId?: string | null;
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

  if (!prompt) {
    throw new Error('Prompt is required');
  }

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
    throw new Error(`No API key configured for ${provider}.`);
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

  if (runtimeSettings.autoMemory) {
    try {
      await learnFactsFromConversation({
        uid,
        prompt,
        responseText,
        provider,
        model,
        apiKey,
        localUrl: runtimeSettings.localUrl,
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
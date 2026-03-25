import { randomUUID } from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { apiKeys, dailyUsage, facts, memoryFiles, memoryUrls, settings, userSettings } from '../db/schema.js';

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GEMINI_API_KEY', 'API_KEY', 'GOOGLE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  xai: ['XAI_API_KEY'],
};

const DEFAULT_MODELS = {
  anthropic: 'claude-3-7-sonnet-latest',
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  local: 'llama3.2',
};

function decodeKey(encryptedKey: string): string {
  return Buffer.from(encryptedKey, 'base64').toString();
}

export function getDefaultModel(provider: string) {
  return DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS] || DEFAULT_MODELS.anthropic;
}

export async function getAvailableProviders(uid: string) {
  const providers = new Set<string>();
  const db = getDatabase();

  Object.entries(PROVIDER_ENV_KEYS).forEach(([provider, envVars]) => {
    if (envVars.some(envVar => process.env[envVar]?.trim())) {
      providers.add(provider);
    }
  });

  const storedKeys = await db.select().from(apiKeys).where(eq(apiKeys.uid, uid));
  storedKeys.forEach(row => providers.add(row.provider));

  const savedSettings = await db.select().from(settings).where(eq(settings.uid, uid)).limit(1);
  if (savedSettings[0]?.localUrl || process.env.LOCAL_LLM_URL) {
    providers.add('local');
  }

  return Array.from(providers);
}

export async function getProviderApiKey(uid: string, provider: string) {
  const db = getDatabase();
  const stored = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider)))
    .limit(1);

  if (stored[0]?.encryptedKey) {
    return decodeKey(stored[0].encryptedKey);
  }

  const envVars = PROVIDER_ENV_KEYS[provider] || [];
  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) {
      return value;
    }
  }

  return '';
}

export async function getRuntimeSettings(uid: string) {
  const db = getDatabase();
  const savedSettings = await db.select().from(settings).where(eq(settings.uid, uid)).limit(1);
  const savedUserSettings = await db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1);

  return {
    localUrl: savedSettings[0]?.localUrl || process.env.LOCAL_LLM_URL || 'http://localhost:11434',
    useMemory: savedSettings[0]?.useMemory !== false,
    systemPrompt: savedUserSettings[0]?.systemPrompt || '',
  };
}

export async function getMemoryContext(uid: string) {
  const db = getDatabase();
  const [userFacts, userFiles, userUrls] = await Promise.all([
    db.select().from(facts).where(eq(facts.uid, uid)).limit(20),
    db.select().from(memoryFiles).where(eq(memoryFiles.uid, uid)).limit(5),
    db.select().from(memoryUrls).where(eq(memoryUrls.uid, uid)).limit(5),
  ]);

  const sections: string[] = [];

  if (userFacts.length > 0) {
    sections.push(`[FACTS]\n${userFacts.map(item => `- ${item.content}`).join('\n')}`);
  }

  if (userFiles.length > 0) {
    sections.push(`[FILES]\n${userFiles.map(item => `- ${item.name}\n${item.content.slice(0, 1200)}`).join('\n\n')}`);
  }

  if (userUrls.length > 0) {
    sections.push(`[URLS]\n${userUrls.map(item => `- ${item.title || item.url}\n${item.url}`).join('\n\n')}`);
  }

  return sections.join('\n\n');
}

export function getSmartRoute(prompt: string, availableProviders: string[]) {
  const lower = prompt.toLowerCase();
  const prefersReasoning = /code|debug|refactor|architecture|analyze|compare|explain|reason|typescript|react|sql/.test(lower);

  if (availableProviders.includes('anthropic')) {
    return {
      provider: 'anthropic',
      model: prefersReasoning ? 'claude-3-7-sonnet-latest' : 'claude-3-5-haiku-latest',
    };
  }

  if (availableProviders.includes('google')) {
    return { provider: 'google', model: getDefaultModel('google') };
  }

  if (availableProviders.includes('openai')) {
    return { provider: 'openai', model: getDefaultModel('openai') };
  }

  if (availableProviders.includes('local')) {
    return { provider: 'local', model: getDefaultModel('local') };
  }

  throw new Error('No configured providers found. Add an API key in Settings or set ANTHROPIC_API_KEY in your environment.');
}

export async function incrementDailyUsage(uid: string, model: string, tokensUsed: number) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.uid, uid), sql`DATE(${dailyUsage.date}) = CURRENT_DATE`))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(dailyUsage).values({
      id: randomUUID(),
      uid,
      date: new Date(),
      tokens: tokensUsed,
      modelUsage: { [model]: tokensUsed },
      createdAt: new Date(),
    });
    return;
  }

  const row = rows[0];
  const modelUsage = (row.modelUsage as Record<string, number> | null) || {};
  await db
    .update(dailyUsage)
    .set({
      tokens: (row.tokens || 0) + tokensUsed,
      modelUsage: {
        ...modelUsage,
        [model]: (modelUsage[model] || 0) + tokensUsed,
      },
    })
    .where(eq(dailyUsage.id, row.id));
}

export async function callLLM(params: {
  prompt: string;
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  localUrl?: string;
}) {
  const { prompt, provider, model, apiKey, systemPrompt, messages = [], localUrl } = params;
  let responseText = '';
  let tokensUsed = 0;

  if (provider === 'anthropic') {
    const payloadMessages = messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
    payloadMessages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt || 'You are a helpful assistant.',
        messages: payloadMessages,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Anthropic request failed with ${response.status}`);
    }

    const data = await response.json() as any;
    responseText = data.content?.map((item: any) => item.text || '').join('\n').trim();
    tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
  } else if (provider === 'google') {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey });
    const contents = messages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

    contents.push({
      role: 'user',
      parts: [{ text: prompt }],
    });

    const result = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt || 'You are a helpful assistant.',
      },
    });

    responseText = result.text || '';
    tokensUsed = result.usageMetadata?.totalTokenCount || 0;
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          ...messages,
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `OpenAI request failed with ${response.status}`);
    }

    const data = await response.json() as any;
    responseText = data.choices?.[0]?.message?.content || '';
    tokensUsed = data.usage?.total_tokens || 0;
  } else if (provider === 'local') {
    const endpoint = `${(localUrl || 'http://localhost:11434').replace(/\/$/, '')}/v1/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          ...messages,
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Local LLM request failed with ${response.status}`);
    }

    const data = await response.json() as any;
    responseText = data.choices?.[0]?.message?.content || '';
    tokensUsed = data.usage?.total_tokens || Math.ceil((prompt.length + responseText.length) / 4);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (!responseText) {
    throw new Error('The provider returned an empty response.');
  }

  if (!tokensUsed) {
    tokensUsed = Math.ceil((systemPrompt.length + prompt.length + responseText.length) / 4);
  }

  return { responseText, tokensUsed };
}

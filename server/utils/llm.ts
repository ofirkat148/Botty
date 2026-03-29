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
  local: 'qwen2.5:1.5b',
};

const PREFERRED_LOCAL_MODELS = [
  'qwen2.5:1.5b',
  'llama3.2:1b',
  'gemma3:1b',
  'smollm2:135m',
];

const COMBINABLE_FACT_PREFIXES = ['Prefers', 'Uses', 'Works on'] as const;

type FactRow = {
  id: string;
  uid: string;
  content: string;
  isSkill: boolean | null;
  timestamp: Date;
};

function isConfiguredSecret(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return false;
  }

  const normalized = trimmed.toLowerCase();
  const obviousPlaceholders = [
    'your_claude_key',
    'your_gemini_key',
    'your_openai_key',
    'replace-this',
    'replace-me',
    'change-this',
    'changeme',
    'example',
    'test',
  ];

  if (obviousPlaceholders.includes(normalized)) {
    return false;
  }

  if (normalized.startsWith('your_') || normalized.startsWith('your-')) {
    return false;
  }

  if (normalized.startsWith('my_') && normalized.endsWith('_api_key')) {
    return false;
  }

  return true;
}

function decodeKey(encryptedKey: string): string {
  return Buffer.from(encryptedKey, 'base64').toString();
}

export function getDefaultModel(provider: string) {
  return DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS] || DEFAULT_MODELS.anthropic;
}

export async function getDefaultLocalModel(localUrl?: string) {
  const fallbackModel = getDefaultModel('local');
  const endpoint = `${(localUrl || process.env.LOCAL_LLM_URL || 'http://localhost:11434').replace(/\/$/, '')}/api/tags`;

  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      return fallbackModel;
    }

    const data = await response.json() as { models?: Array<{ name?: string }> };
    const installedModels = data.models
      ?.map(model => model.name?.trim())
      .filter((modelName): modelName is string => Boolean(modelName)) || [];

    const preferredInstalledModel = PREFERRED_LOCAL_MODELS.find(modelName => installedModels.includes(modelName));
    return preferredInstalledModel || installedModels[0] || fallbackModel;
  } catch {
    return fallbackModel;
  }
}

export async function getAvailableProviders(uid: string) {
  const providers = new Set<string>();
  const db = getDatabase();

  Object.entries(PROVIDER_ENV_KEYS).forEach(([provider, envVars]) => {
    if (envVars.some(envVar => isConfiguredSecret(process.env[envVar]))) {
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
    if (isConfiguredSecret(value)) {
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
    autoMemory: savedSettings[0]?.autoMemory !== false,
    systemPrompt: savedUserSettings[0]?.systemPrompt || '',
  };
}

export function normalizeFactContent(value: string) {
  return value.trim().replace(/^[-*\d.)\s]+/, '').replace(/\s+/g, ' ').toLowerCase();
}

export function cleanFactContent(value: string) {
  return value
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^['"`]+/, '')
    .replace(/['"`,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFactClauses(value: string) {
  return cleanFactContent(value)
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map(clause => cleanFactContent(clause))
    .filter(Boolean);
}

function joinFactClauses(clauses: string[]) {
  if (clauses.length <= 1) {
    return clauses[0] || '';
  }

  if (clauses.length === 2) {
    return `${clauses[0]} and ${clauses[1]}`;
  }

  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

function parseFactPrefix(value: string) {
  const cleaned = cleanFactContent(value);

  for (const prefix of COMBINABLE_FACT_PREFIXES) {
    if (cleaned.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
      return {
        prefix,
        remainder: cleaned.slice(prefix.length).trim(),
      };
    }
  }

  return null;
}

function combineFactContents(left: string, right: string) {
  const cleanedLeft = cleanFactContent(left);
  const cleanedRight = cleanFactContent(right);
  const normalizedLeft = normalizeFactContent(cleanedLeft);
  const normalizedRight = normalizeFactContent(cleanedRight);

  if (!normalizedLeft || !normalizedRight) {
    return cleanedLeft || cleanedRight;
  }

  if (normalizedLeft === normalizedRight) {
    return cleanedLeft.length >= cleanedRight.length ? cleanedLeft : cleanedRight;
  }

  if (normalizedLeft.includes(normalizedRight)) {
    return cleanedLeft;
  }

  if (normalizedRight.includes(normalizedLeft)) {
    return cleanedRight;
  }

  const leftParsed = parseFactPrefix(cleanedLeft);
  const rightParsed = parseFactPrefix(cleanedRight);

  if (!leftParsed || !rightParsed || leftParsed.prefix !== rightParsed.prefix) {
    return null;
  }

  const clauseMap = new Map<string, string>();

  [...splitFactClauses(leftParsed.remainder), ...splitFactClauses(rightParsed.remainder)].forEach(clause => {
    const normalizedClause = normalizeFactContent(clause);
    if (!normalizedClause || clauseMap.has(normalizedClause)) {
      return;
    }

    clauseMap.set(normalizedClause, clause);
  });

  const mergedClauses = Array.from(clauseMap.values());
  if (mergedClauses.length === 0) {
    return null;
  }

  return `${leftParsed.prefix} ${joinFactClauses(mergedClauses)}`;
}

export function consolidateFactRows(rows: FactRow[]) {
  const consolidated: FactRow[] = [];

  for (const row of rows) {
    const cleanedContent = cleanFactContent(row.content);
    if (!cleanedContent) {
      continue;
    }

    const candidate: FactRow = {
      ...row,
      content: cleanedContent,
      isSkill: Boolean(row.isSkill),
      timestamp: row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp),
    };

    let merged = false;

    for (const existing of consolidated) {
      const nextContent = combineFactContents(existing.content, candidate.content);
      if (!nextContent) {
        continue;
      }

      existing.content = nextContent;
      existing.isSkill = Boolean(existing.isSkill || candidate.isSkill);
      existing.timestamp = existing.timestamp >= candidate.timestamp ? existing.timestamp : candidate.timestamp;
      merged = true;
      break;
    }

    if (!merged) {
      consolidated.push(candidate);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (let index = 0; index < consolidated.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < consolidated.length; compareIndex += 1) {
        const mergedContent = combineFactContents(consolidated[index].content, consolidated[compareIndex].content);
        if (!mergedContent) {
          continue;
        }

        consolidated[index].content = mergedContent;
        consolidated[index].isSkill = Boolean(consolidated[index].isSkill || consolidated[compareIndex].isSkill);
        consolidated[index].timestamp = consolidated[index].timestamp >= consolidated[compareIndex].timestamp
          ? consolidated[index].timestamp
          : consolidated[compareIndex].timestamp;
        consolidated.splice(compareIndex, 1);
        changed = true;
        break;
      }

      if (changed) {
        break;
      }
    }
  }

  return consolidated;
}

export async function saveFactsWithConsolidation(
  uid: string,
  incomingFacts: Array<{ content: string; isSkill?: boolean; timestamp?: Date }>,
  options?: { replaceExisting?: boolean },
) {
  const db = getDatabase();
  const existingFacts = options?.replaceExisting
    ? []
    : await db.select().from(facts).where(eq(facts.uid, uid));

  const candidateRows: FactRow[] = incomingFacts.map(item => ({
    id: randomUUID(),
    uid,
    content: item.content,
    isSkill: Boolean(item.isSkill),
    timestamp: item.timestamp || new Date(),
  }));

  const consolidatedRows = consolidateFactRows([
    ...existingFacts.map(item => ({
      id: item.id,
      uid: item.uid,
      content: item.content,
      isSkill: item.isSkill,
      timestamp: item.timestamp,
    })),
    ...candidateRows,
  ]);

  await db.transaction(async tx => {
    await tx.delete(facts).where(eq(facts.uid, uid));

    if (consolidatedRows.length > 0) {
      await tx.insert(facts).values(consolidatedRows);
    }
  });

  return consolidatedRows.map(item => item.content);
}

function parseLearnedFacts(responseText: string) {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Fall back to line parsing below.
  }

  return trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

function humanizeExtractedFact(prefix: string, value: string) {
  const cleanedValue = cleanFactContent(value).replace(/[.]+$/, '');
  if (!cleanedValue) {
    return '';
  }

  const firstChar = cleanedValue.charAt(0).toLowerCase();
  const rest = cleanedValue.slice(1);
  return `${prefix} ${firstChar}${rest}`.trim();
}

function extractPromptFacts(prompt: string) {
  const matches: string[] = [];
  const normalizedPrompt = ` ${prompt.trim()} `;
  const patterns: Array<[RegExp, string]> = [
    [/(?:^|\W)i prefer\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Prefers'],
    [/(?:^|\W)i (?:mostly\s+)?use\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Uses'],
    [/(?:^|\W)i work (?:mostly\s+)?on\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Works on'],
    [/(?:^|\W)i[' ]?m\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Is'],
    [/(?:^|\W)i am\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Is'],
    [/(?:^|\W)my name is\s+(.+?)(?=\s+and\s+i\s+|[.?!]|$)/gi, 'Name is'],
  ];

  for (const [pattern, prefix] of patterns) {
    for (const match of normalizedPrompt.matchAll(pattern)) {
      const fact = humanizeExtractedFact(prefix, match[1] || '');
      if (fact) {
        matches.push(fact);
      }
    }
  }

  return matches;
}

export async function learnFactsFromConversation(params: {
  uid: string;
  prompt: string;
  responseText: string;
  provider: string;
  model: string;
  apiKey: string;
  localUrl?: string;
}) {
  const { uid, prompt, responseText, provider, model, apiKey, localUrl } = params;
  const db = getDatabase();
  const existingFacts = await db.select().from(facts).where(eq(facts.uid, uid)).limit(50);
  const existingFactSet = new Set(existingFacts.map(item => normalizeFactContent(item.content)));

  const heuristicFacts = extractPromptFacts(prompt);

  let candidateFacts = heuristicFacts;

  if (candidateFacts.length === 0) {
    const extractionPrompt = [
      'Extract only durable user facts from this conversation.',
      'Return a JSON array of short strings.',
      'Rules:',
      '- Include only stable preferences, identity details, recurring habits, long-term goals, or environment facts about the user.',
      '- Do not include temporary requests, one-off tasks, secrets, API keys, passwords, tokens, or anything sensitive.',
      '- Do not include facts already known.',
      '- Return at most 3 facts.',
      '',
      `[KNOWN_FACTS]`,
      existingFacts.map(item => `- ${item.content}`).join('\n') || '(none)',
      '',
      `[USER_MESSAGE]`,
      prompt,
      '',
      `[ASSISTANT_REPLY]`,
      responseText,
    ].join('\n');

    const { responseText: learnedText } = await callLLM({
      prompt: extractionPrompt,
      provider,
      model,
      apiKey,
      systemPrompt: 'You extract durable, non-sensitive user facts. Output only a JSON array of strings.',
      localUrl,
      messages: [],
    });

    candidateFacts = parseLearnedFacts(learnedText)
      .map(cleanFactContent)
      .filter(item => item.length >= 8 && item.length <= 180);
  }

  const seen = new Set<string>();
  const newFacts = candidateFacts.filter(item => {
    const normalized = normalizeFactContent(item);
    if (!normalized || existingFactSet.has(normalized) || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });

  if (newFacts.length === 0) {
    return [] as string[];
  }

  await saveFactsWithConsolidation(
    uid,
    newFacts.map(content => ({
      content,
      isSkill: false,
      timestamp: new Date(),
    })),
  );

  return newFacts;
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

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
  local: 'qwen2.5:3b',
};

const PROVIDER_MODEL_OPTIONS: Record<string, string[]> = {
  anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
};

const PREFERRED_LOCAL_MODELS = [
  'qwen2.5:3b',
  'qwen2.5:1.5b',
  'llama3.2:1b',
  'gemma3:1b',
  'smollm2:135m',
];

const DEFAULT_LOCAL_LLM_URL = 'http://localhost:11434';
const SUPPORTED_CHAT_PROVIDERS = ['anthropic', 'google', 'openai', 'local'] as const;

const COMBINABLE_FACT_PREFIXES = ['Prefers', 'Uses', 'Works on'] as const;

export type ProviderRoute = {
  provider: string;
  model: string;
};

export type RoutingMode = 'auto' | 'fastest' | 'cheapest' | 'best-quality' | 'local-first';

export type ProviderStatus = {
  provider: string;
  readiness: 'ready' | 'missing' | 'unreachable';
  configured: boolean;
  available: boolean;
  source: 'saved-key' | 'environment' | 'runtime-url' | 'default-local' | 'not-configured';
  detail: string;
  localUrl?: string | null;
  defaultModel?: string | null;
  modelCount?: number;
};

export type ModelUsageEntry = {
  key: string;
  provider: string | null;
  model: string;
  tokens: number;
};

type FactRow = {
  id: string;
  uid: string;
  botId?: string | null;
  content: string;
  isSkill: boolean | null;
  timestamp: Date;
};

export type BotMemoryMode = 'shared' | 'isolated' | 'none';

function buildFactScopeFilter(uid: string, botId?: string | null) {
  return and(
    eq(facts.uid, uid),
    botId ? eq(facts.botId, botId) : sql`${facts.botId} IS NULL`,
  );
}

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

function normalizeLocalLlmUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return DEFAULT_LOCAL_LLM_URL;
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const normalizedPath = url.pathname
      .replace(/\/(v1\/chat\/completions|api\/generate|api\/chat|v1|api)\/?$/i, '')
      .replace(/\/$/, '');

    return `${url.origin}${normalizedPath}`;
  } catch {
    return DEFAULT_LOCAL_LLM_URL;
  }
}

function getCandidateLocalLlmUrls(preferredUrl?: string | null) {
  const candidates = [
    preferredUrl,
    process.env.LOCAL_LLM_URL,
    process.env.LOCAL_LLM_URL_CONTAINER,
    'http://ollama:11434',
    'http://127.0.0.1:11435',
    'http://localhost:11435',
    'http://127.0.0.1:11434',
    'http://localhost:11434',
  ]
    .map(value => normalizeLocalLlmUrl(value))
    .filter(Boolean);

  return Array.from(new Set(candidates));
}

export function getDefaultModel(provider: string) {
  return DEFAULT_MODELS[provider as keyof typeof DEFAULT_MODELS] || DEFAULT_MODELS.anthropic;
}

export function normalizeRoutingMode(value?: string | null): RoutingMode {
  const normalized = value?.trim().toLowerCase() || 'auto';

  if (normalized === 'fastest' || normalized === 'cheapest' || normalized === 'best-quality' || normalized === 'local-first') {
    return normalized;
  }

  return 'auto';
}

export function isRoutingModeValue(value?: string | null) {
  const normalized = value?.trim().toLowerCase() || '';
  return normalized === 'auto'
    || normalized === 'fastest'
    || normalized === 'cheapest'
    || normalized === 'best-quality'
    || normalized === 'local-first';
}

function classifyPrompt(prompt: string) {
  const lower = prompt.trim().toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const isCodeHeavy = /code|debug|refactor|typescript|javascript|react|sql|query|stack trace|traceback|bug|architecture|implement|fix/.test(lower);
  const isAnalysisHeavy = /analyze|analysis|compare|reason|tradeoff|explain|design|plan/.test(lower);
  const isLightweight = wordCount > 0 && wordCount <= 18 && /summarize|rewrite|translate|title|tagline|grammar|short|brief/.test(lower);

  return {
    wordCount,
    prefersReasoning: isCodeHeavy || isAnalysisHeavy || wordCount > 120,
    isLightweight,
  };
}

export function getSuggestedModel(provider: string, prompt: string, options?: { defaultLocalModel?: string | null }) {
  if (provider === 'local') {
    return options?.defaultLocalModel?.trim() || getDefaultModel('local');
  }

  if (provider === 'anthropic') {
    return classifyPrompt(prompt).prefersReasoning
      ? 'claude-3-7-sonnet-latest'
      : 'claude-3-5-haiku-latest';
  }

  return getDefaultModel(provider);
}

function isSupportedChatProvider(provider: string): provider is (typeof SUPPORTED_CHAT_PROVIDERS)[number] {
  return SUPPORTED_CHAT_PROVIDERS.includes(provider as (typeof SUPPORTED_CHAT_PROVIDERS)[number]);
}

export async function getDefaultLocalModel(localUrl?: string) {
  const fallbackModel = getDefaultModel('local');
  const localModels = await getLocalModelOptions(localUrl || process.env.LOCAL_LLM_URL);

  return localModels[0] || fallbackModel;
}

export async function getLocalModelOptions(localUrl?: string) {
  const fallbackModel = getDefaultModel('local');
  const candidateUrls = getCandidateLocalLlmUrls(localUrl || process.env.LOCAL_LLM_URL);

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(`${candidateUrl.replace(/\/$/, '')}/api/tags`);
      if (!response.ok) {
        continue;
      }

      const data = await response.json() as { models?: Array<{ name?: string }> };
      const installedModels = data.models
        ?.map(model => model.name?.trim())
        .filter((modelName): modelName is string => Boolean(modelName)) || [];

      const orderedInstalledModels = [
        ...PREFERRED_LOCAL_MODELS.filter(modelName => installedModels.includes(modelName)),
        ...installedModels.filter(modelName => !PREFERRED_LOCAL_MODELS.includes(modelName as (typeof PREFERRED_LOCAL_MODELS)[number])),
      ];

      return orderedInstalledModels.length > 0 ? orderedInstalledModels : [fallbackModel];
    } catch {
      continue;
    }
  }

  return [fallbackModel];
}

export async function getProviderModelCatalog(localUrl?: string) {
  return {
    ...PROVIDER_MODEL_OPTIONS,
    local: await getLocalModelOptions(localUrl),
  };
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

  return Array.from(providers).filter(isSupportedChatProvider);
}

function getConfiguredProviderSource(provider: string, storedProviders: Set<string>): ProviderStatus['source'] {
  if (storedProviders.has(provider)) {
    return 'saved-key';
  }

  const envVars = PROVIDER_ENV_KEYS[provider] || [];
  if (envVars.some(envVar => isConfiguredSecret(process.env[envVar]))) {
    return 'environment';
  }

  return 'not-configured';
}

export async function getLocalProviderStatus(localUrl?: string | null): Promise<ProviderStatus> {
  const fallbackModel = getDefaultModel('local');
  const candidateUrls = getCandidateLocalLlmUrls(localUrl || process.env.LOCAL_LLM_URL);
  const explicitLocalUrl = Boolean(localUrl?.trim() || process.env.LOCAL_LLM_URL || process.env.LOCAL_LLM_URL_CONTAINER);

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(`${candidateUrl.replace(/\/$/, '')}/api/tags`);
      if (!response.ok) {
        continue;
      }

      const data = await response.json() as { models?: Array<{ name?: string }> };
      const installedModels = data.models
        ?.map(model => model.name?.trim())
        .filter((modelName): modelName is string => Boolean(modelName)) || [];

      const orderedInstalledModels = [
        ...PREFERRED_LOCAL_MODELS.filter(modelName => installedModels.includes(modelName)),
        ...installedModels.filter(modelName => !PREFERRED_LOCAL_MODELS.includes(modelName as (typeof PREFERRED_LOCAL_MODELS)[number])),
      ];

      return {
        provider: 'local',
        readiness: 'ready',
        configured: true,
        available: true,
        source: explicitLocalUrl ? 'runtime-url' : 'default-local',
        detail: `Reachable at ${candidateUrl}`,
        localUrl: candidateUrl,
        defaultModel: orderedInstalledModels[0] || fallbackModel,
        modelCount: orderedInstalledModels.length,
      };
    } catch {
      continue;
    }
  }

  return {
    provider: 'local',
    readiness: 'unreachable',
    configured: explicitLocalUrl,
    available: false,
    source: explicitLocalUrl ? 'runtime-url' : 'default-local',
    detail: `Could not reach local model endpoint${candidateUrls[0] ? ` at ${candidateUrls[0]}` : ''}`,
    localUrl: candidateUrls[0] || normalizeLocalLlmUrl(localUrl),
    defaultModel: fallbackModel,
    modelCount: 0,
  };
}

export async function getProviderStatuses(uid: string, localUrl?: string | null): Promise<ProviderStatus[]> {
  const db = getDatabase();
  const storedKeyRows = await db.select({ provider: apiKeys.provider }).from(apiKeys).where(eq(apiKeys.uid, uid));
  const storedProviders = new Set(storedKeyRows.map(row => row.provider));

  const remoteProviders = SUPPORTED_CHAT_PROVIDERS
    .filter(provider => provider !== 'local')
    .map(provider => {
      const source = getConfiguredProviderSource(provider, storedProviders);
      const configured = source !== 'not-configured';

      return {
        provider,
        readiness: configured ? 'ready' : 'missing',
        configured,
        available: configured,
        source,
        detail: configured
          ? (source === 'saved-key' ? 'API key saved in Botty settings' : 'API key loaded from environment')
          : 'No API key configured',
        defaultModel: getDefaultModel(provider),
      } satisfies ProviderStatus;
    });

  const localStatus = await getLocalProviderStatus(localUrl);

  return [...remoteProviders, localStatus];
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
    localUrl: normalizeLocalLlmUrl(savedSettings[0]?.localUrl || process.env.LOCAL_LLM_URL),
    useMemory: savedSettings[0]?.useMemory !== false,
    autoMemory: savedSettings[0]?.autoMemory !== false,
    sandboxMode: savedSettings[0]?.sandboxMode === true,
    systemPrompt: savedUserSettings[0]?.systemPrompt || '',
  };
}

export function cleanFactContent(value: string) {
  return value
    .trim()
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^['"`]+/, '')
    .replace(/['"`,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTrailingFactPunctuation(value: string) {
  return value.replace(/[.,;:!?]+$/, '').trim();
}

function isFactNoise(value: string) {
  const normalized = cleanFactContent(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized.startsWith('this json array')
    || normalized.startsWith('the json array')
    || normalized.startsWith('[')
    || normalized.startsWith('{')
    || normalized.includes('json array')
    || normalized.includes('["')
    || normalized.includes("['");
}

function standardizeFactContent(value: string) {
  const cleaned = stripTrailingFactPunctuation(cleanFactContent(value));
  if (!cleaned) {
    return '';
  }

  if (isFactNoise(cleaned)) {
    return '';
  }

  const patterns: Array<[RegExp, string]> = [
    [/^i prefer\s+(.+)$/i, 'Prefers'],
    [/^prefer(?:s)?\s+(.+)$/i, 'Prefers'],
    [/^user prefer(?:s)?\s+(.+)$/i, 'Prefers'],
    [/^i (?:mostly\s+)?use\s+(.+)$/i, 'Uses'],
    [/^use(?:s)?\s+(.+)$/i, 'Uses'],
    [/^user use(?:s)?\s+(.+)$/i, 'Uses'],
    [/^i work (?:mostly\s+)?on\s+(.+)$/i, 'Works on'],
    [/^work(?:s)? on\s+(.+)$/i, 'Works on'],
    [/^user work(?:s)? on\s+(.+)$/i, 'Works on'],
    [/^i[' ]?m\s+(.+)$/i, 'Is'],
    [/^i am\s+(.+)$/i, 'Is'],
    [/^currently\s+(.+)$/i, 'Is'],
    [/^user currently\s+(.+)$/i, 'Is'],
    [/^user is\s+(.+)$/i, 'Is'],
    [/^my name is\s+(.+)$/i, 'Name is'],
    [/^user(?:'s)? name is\s+(.+)$/i, 'Name is'],
    [/^name is\s+(.+)$/i, 'Name is'],
  ];

  for (const [pattern, prefix] of patterns) {
    const match = cleaned.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const remainder = stripTrailingFactPunctuation(cleanFactContent(match[1]));
    return remainder ? `${prefix} ${remainder}` : '';
  }

  return cleaned;
}

export function normalizeFactContent(value: string) {
  return standardizeFactContent(value).replace(/\s+/g, ' ').toLowerCase();
}

function splitFactClauses(value: string) {
  return standardizeFactContent(value)
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
  const cleaned = standardizeFactContent(value);

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
  const cleanedLeft = standardizeFactContent(left);
  const cleanedRight = standardizeFactContent(right);
  const normalizedLeft = normalizeFactContent(cleanedLeft);
  const normalizedRight = normalizeFactContent(cleanedRight);

  if (!normalizedLeft || !normalizedRight) {
    return cleanedLeft || cleanedRight;
  }

  if (normalizedLeft === normalizedRight) {
    const leftParsed = parseFactPrefix(cleanedLeft);
    const rightParsed = parseFactPrefix(cleanedRight);
    if (leftParsed && !rightParsed) {
      return cleanedLeft;
    }
    if (rightParsed && !leftParsed) {
      return cleanedRight;
    }
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
    const standardizedContent = standardizeFactContent(cleanedContent);
    if (!standardizedContent) {
      continue;
    }

    const candidate: FactRow = {
      ...row,
      content: standardizedContent,
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

function sameFactSet(left: FactRow[], right: FactRow[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortKey = (row: FactRow) => `${normalizeFactContent(row.content)}::${row.content}::${Boolean(row.isSkill)}::${row.timestamp.toISOString()}`;
  const leftSorted = [...left].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const rightSorted = [...right].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return leftSorted.every((row, index) => {
    const compare = rightSorted[index];
    return row.content === compare.content
      && Boolean(row.isSkill) === Boolean(compare.isSkill)
      && row.timestamp.toISOString() === compare.timestamp.toISOString();
  });
}

export async function reconcileFactsForUser(uid: string) {
  const db = getDatabase();
  const existingFacts = await db.select().from(facts).where(buildFactScopeFilter(uid, null));
  const factRows: FactRow[] = existingFacts.map(item => ({
    id: item.id,
    uid: item.uid,
    botId: item.botId,
    content: item.content,
    isSkill: item.isSkill,
    timestamp: item.timestamp,
  }));

  const consolidatedRows = consolidateFactRows(factRows);

  if (!sameFactSet(factRows, consolidatedRows)) {
    await db.transaction(async tx => {
      await tx.delete(facts).where(buildFactScopeFilter(uid, null));

      if (consolidatedRows.length > 0) {
        await tx.insert(facts).values(consolidatedRows);
      }
    });
  }

  return consolidatedRows;
}

export async function reconcileAllFacts() {
  const db = getDatabase();
  const rows = await db.selectDistinct({ uid: facts.uid, botId: facts.botId }).from(facts);

  for (const row of rows) {
    if (row.botId) {
      await reconcileFactsForUserScoped(row.uid, row.botId);
    } else {
      await reconcileFactsForUser(row.uid);
    }
  }
}

export async function reconcileFactsForUserScoped(uid: string, botId: string) {
  const db = getDatabase();
  const existingFacts = await db.select().from(facts).where(buildFactScopeFilter(uid, botId));
  const factRows: FactRow[] = existingFacts.map(item => ({
    id: item.id,
    uid: item.uid,
    botId: item.botId,
    content: item.content,
    isSkill: item.isSkill,
    timestamp: item.timestamp,
  }));

  const consolidatedRows = consolidateFactRows(factRows);

  if (!sameFactSet(factRows, consolidatedRows)) {
    await db.transaction(async tx => {
      await tx.delete(facts).where(buildFactScopeFilter(uid, botId));

      if (consolidatedRows.length > 0) {
        await tx.insert(facts).values(consolidatedRows);
      }
    });
  }

  return consolidatedRows;
}

export async function saveFactsWithConsolidation(
  uid: string,
  incomingFacts: Array<{ content: string; isSkill?: boolean; timestamp?: Date }>,
  options?: { replaceExisting?: boolean; botId?: string | null },
) {
  const db = getDatabase();
  const botId = options?.botId || null;
  const existingFacts = options?.replaceExisting
    ? []
    : botId
      ? await reconcileFactsForUserScoped(uid, botId)
      : await reconcileFactsForUser(uid);

  const candidateRows: FactRow[] = incomingFacts.map(item => ({
    id: randomUUID(),
    uid,
    botId,
    content: item.content,
    isSkill: Boolean(item.isSkill),
    timestamp: item.timestamp || new Date(),
  }));

  const consolidatedRows = consolidateFactRows([
    ...existingFacts.map(item => ({
      id: item.id,
      uid: item.uid,
      botId: item.botId,
      content: item.content,
      isSkill: item.isSkill,
      timestamp: item.timestamp,
    })),
    ...candidateRows,
  ]);

  await db.transaction(async tx => {
    await tx.delete(facts).where(buildFactScopeFilter(uid, botId));

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
  botId?: string | null;
}) {
  const { uid, prompt, responseText, provider, model, apiKey, localUrl, botId } = params;
  const db = getDatabase();
  const existingFacts = (botId ? await reconcileFactsForUserScoped(uid, botId) : await reconcileFactsForUser(uid)).slice(0, 50);
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
    { botId },
  );

  return newFacts;
}

export async function getMemoryContext(uid: string, options?: { sandboxMode?: boolean; botId?: string | null; memoryMode?: BotMemoryMode }) {
  const db = getDatabase();
  const sandboxMode = options?.sandboxMode === true;
  const botId = options?.botId || null;
  const memoryMode = options?.memoryMode || 'shared';

  if (memoryMode === 'none') {
    return '';
  }

  const factPromise = memoryMode === 'isolated' && botId
    ? reconcileFactsForUserScoped(uid, botId).then(rows => rows.slice(0, 20))
    : reconcileFactsForUser(uid).then(rows => rows.slice(0, 20));
  const [userFacts, userFiles, userUrls] = await Promise.all([
    factPromise,
    sandboxMode || memoryMode === 'isolated'
      ? Promise.resolve([])
      : db.select().from(memoryFiles).where(eq(memoryFiles.uid, uid)).limit(5),
    memoryMode === 'isolated'
      ? Promise.resolve([])
      : db.select().from(memoryUrls).where(eq(memoryUrls.uid, uid)).limit(5),
  ]);

  const sections: string[] = [];

  if (userFacts.length > 0) {
    sections.push(`[${sandboxMode ? 'KNOWN FACTS' : 'FACTS'}]\n${userFacts.map(item => `- ${item.content}`).join('\n')}`);
  }

  if (!sandboxMode && userFiles.length > 0) {
    sections.push(`[FILES]\n${userFiles.map(item => `- ${item.name}\n${item.content.slice(0, 1200)}`).join('\n\n')}`);
  }

  if (userUrls.length > 0) {
    sections.push(`[${sandboxMode ? 'KNOWN SITES' : 'URLS'}]\n${userUrls.map(item => `- ${item.title || item.url}\n${item.url}`).join('\n\n')}`);
  }

  return sections.join('\n\n');
}

export function buildChatSystemPrompt(params: {
  systemPrompt?: string;
  memoryContext?: string;
  sandboxMode?: boolean;
}) {
  const { systemPrompt = '', memoryContext = '', sandboxMode = false } = params;
  const parts: string[] = [];

  if (sandboxMode) {
    parts.push([
      'You are operating in sandboxed mode.',
      'The only external context available is the provided [KNOWN FACTS] and [KNOWN SITES] sections.',
      'Do not use any file memory or any knowledge beyond those sources and the current conversation.',
      'If the answer is not supported by those sources, say that you do not know in sandboxed mode.',
    ].join(' '));
  }

  if (systemPrompt.trim()) {
    parts.push(systemPrompt.trim());
  }

  if (memoryContext.trim()) {
    parts.push(memoryContext.trim());
  }

  return parts.join('\n\n');
}

function getSmartRoute(prompt: string, availableProviders: string[], options?: { defaultLocalModel?: string | null }): ProviderRoute {
  const { prefersReasoning, isLightweight } = classifyPrompt(prompt);
  const hasAnthropic = availableProviders.includes('anthropic');
  const hasGoogle = availableProviders.includes('google');
  const hasOpenai = availableProviders.includes('openai');
  const hasLocal = availableProviders.includes('local');

  if (hasLocal && isLightweight && !prefersReasoning) {
    return { provider: 'local', model: getSuggestedModel('local', prompt, options) };
  }

  if (hasAnthropic && prefersReasoning) {
    return { provider: 'anthropic', model: getSuggestedModel('anthropic', prompt, options) };
  }

  if (hasGoogle && !prefersReasoning) {
    return { provider: 'google', model: getSuggestedModel('google', prompt, options) };
  }

  if (hasOpenai && !prefersReasoning) {
    return { provider: 'openai', model: getSuggestedModel('openai', prompt, options) };
  }

  if (hasAnthropic) {
    return { provider: 'anthropic', model: getSuggestedModel('anthropic', prompt, options) };
  }

  if (hasLocal) {
    return { provider: 'local', model: getSuggestedModel('local', prompt, options) };
  }

  if (hasGoogle) {
    return { provider: 'google', model: getSuggestedModel('google', prompt, options) };
  }

  if (hasOpenai) {
    return { provider: 'openai', model: getSuggestedModel('openai', prompt, options) };
  }

  throw new Error('No configured providers found. Add an API key in Settings or set ANTHROPIC_API_KEY in your environment.');
}

export function getAutoRouteCandidates(prompt: string, availableProviders: string[], options?: { defaultLocalModel?: string | null }): ProviderRoute[] {
  return getRouteCandidatesForMode('auto', prompt, availableProviders, options);
}

function orderProvidersForMode(mode: RoutingMode, prompt: string, availableProviders: string[], options?: { defaultLocalModel?: string | null }) {
  const smartPrimary = getSmartRoute(prompt, availableProviders, options).provider;
  const uniqueProviders = Array.from(new Set(availableProviders));
  const preferredOrder: Record<RoutingMode, string[]> = {
    auto: [smartPrimary, 'local', 'google', 'openai', 'anthropic'],
    fastest: ['local', 'google', 'openai', 'anthropic'],
    cheapest: ['local', 'google', 'openai', 'anthropic'],
    'best-quality': ['anthropic', 'openai', 'google', 'local'],
    'local-first': ['local', smartPrimary, 'google', 'openai', 'anthropic'],
  };

  const ranked = preferredOrder[mode].filter(provider => uniqueProviders.includes(provider));
  const remainder = uniqueProviders.filter(provider => !ranked.includes(provider));

  return [...ranked, ...remainder];
}

export function getRouteCandidatesForMode(
  mode: RoutingMode,
  prompt: string,
  availableProviders: string[],
  options?: { defaultLocalModel?: string | null },
): ProviderRoute[] {
  return orderProvidersForMode(mode, prompt, availableProviders, options).map(provider => ({
    provider,
    model: getSuggestedModel(provider, prompt, options),
  }));
}

function buildModelUsageKey(provider: string | null | undefined, model: string) {
  return `${provider || 'unknown'}::${model}`;
}

export function normalizeModelUsage(value: unknown): ModelUsageEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, entryValue]) => {
      if (typeof entryValue === 'number') {
        const [providerPart, modelPart] = key.includes('::') ? key.split('::', 2) : [null, key];
        return {
          key,
          provider: providerPart,
          model: modelPart || key,
          tokens: entryValue,
        } satisfies ModelUsageEntry;
      }

      if (!entryValue || typeof entryValue !== 'object') {
        return null;
      }

      const candidate = entryValue as { provider?: unknown; model?: unknown; tokens?: unknown };
      const model = typeof candidate.model === 'string' && candidate.model.trim() ? candidate.model.trim() : (key.split('::', 2)[1] || key);
      const provider = typeof candidate.provider === 'string' && candidate.provider.trim() ? candidate.provider.trim() : (key.includes('::') ? key.split('::', 2)[0] : null);
      const tokens = typeof candidate.tokens === 'number' ? candidate.tokens : 0;

      return {
        key,
        provider,
        model,
        tokens,
      } satisfies ModelUsageEntry;
    })
    .filter((entry): entry is ModelUsageEntry => Boolean(entry && entry.model))
    .sort((left, right) => right.tokens - left.tokens || left.model.localeCompare(right.model));
}

export async function incrementDailyUsage(uid: string, provider: string, model: string, tokensUsed: number) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(dailyUsage)
    .where(and(eq(dailyUsage.uid, uid), sql`DATE(${dailyUsage.date}) = CURRENT_DATE`))
    .limit(1);

  const key = buildModelUsageKey(provider, model);

  if (rows.length === 0) {
    await db.insert(dailyUsage).values({
      id: randomUUID(),
      uid,
      date: new Date(),
      tokens: tokensUsed,
      modelUsage: {
        [key]: {
          provider,
          model,
          tokens: tokensUsed,
        },
      },
      createdAt: new Date(),
    });
    return;
  }

  const row = rows[0];
  const normalizedUsage = normalizeModelUsage(row.modelUsage);
  const nextModelUsage = Object.fromEntries(normalizedUsage.map(entry => [entry.key, {
    provider: entry.provider,
    model: entry.model,
    tokens: entry.tokens,
  }]));
  const currentTokens = normalizedUsage.find(entry => entry.key === key)?.tokens || 0;
  await db
    .update(dailyUsage)
    .set({
      tokens: (row.tokens || 0) + tokensUsed,
      modelUsage: {
        ...nextModelUsage,
        [key]: {
          provider,
          model,
          tokens: currentTokens + tokensUsed,
        },
      },
    })
    .where(eq(dailyUsage.id, row.id));
}

export class LLMProviderError extends Error {
  provider: string;
  statusCode?: number;
  retryable: boolean;

  constructor(provider: string, message: string, options?: { statusCode?: number; retryable?: boolean }) {
    super(message);
    this.name = 'LLMProviderError';
    this.provider = provider;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable === true;
  }
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
}

function summarizeProviderErrorBody(body: string, fallbackMessage: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    return fallbackMessage;
  }

  return trimmed.length > 400 ? `${trimmed.slice(0, 397)}...` : trimmed;
}

function isRetryableStatus(statusCode?: number) {
  if (!statusCode) {
    return false;
  }

  return statusCode === 408 || statusCode === 409 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function normalizeProviderError(provider: string, error: unknown, fallbackMessage: string) {
  if (error instanceof LLMProviderError) {
    return error;
  }

  const candidate = error as { message?: string; status?: number; code?: number | string } | undefined;
  const rawMessage = candidate?.message?.trim() || fallbackMessage;
  const lowerMessage = rawMessage.toLowerCase();
  const statusCode = typeof candidate?.status === 'number'
    ? candidate.status
    : typeof candidate?.code === 'number'
      ? candidate.code
      : undefined;
  const retryable = isRetryableStatus(statusCode)
    || /429|rate limit|resource exhausted|too many requests|overloaded|temporar|timeout|timed out|fetch failed|econnreset|enotfound|eai_again|socket hang up/.test(lowerMessage);

  return new LLMProviderError(provider, rawMessage, { statusCode, retryable });
}

export function shouldRetryWithAnotherProvider(error: unknown) {
  return error instanceof LLMProviderError && error.retryable;
}

export async function callLLM(params: {
  prompt: string;
  provider: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  localUrl?: string;
  signal?: AbortSignal;
}) {
  const { prompt, provider, model, apiKey, systemPrompt, messages = [], localUrl, signal } = params;
  let responseText = '';
  let tokensUsed = 0;

  throwIfAborted(signal);

  if (provider === 'anthropic') {
    try {
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
        signal,
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt || 'You are a helpful assistant.',
          messages: payloadMessages,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new LLMProviderError(
          provider,
          summarizeProviderErrorBody(body, `Anthropic request failed with ${response.status}`),
          { statusCode: response.status, retryable: isRetryableStatus(response.status) },
        );
      }

      const data = await response.json() as any;
      responseText = data.content?.map((item: any) => item.text || '').join('\n').trim();
      tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    } catch (error) {
      throw normalizeProviderError(provider, error, 'Anthropic request failed');
    }
  } else if (provider === 'google') {
    try {
      throwIfAborted(signal);
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

      throwIfAborted(signal);

      responseText = result.text || '';
      tokensUsed = result.usageMetadata?.totalTokenCount || 0;
    } catch (error) {
      throw normalizeProviderError(provider, error, 'Google request failed');
    }
  } else if (provider === 'openai') {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal,
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
        throw new LLMProviderError(
          provider,
          summarizeProviderErrorBody(body, `OpenAI request failed with ${response.status}`),
          { statusCode: response.status, retryable: isRetryableStatus(response.status) },
        );
      }

      const data = await response.json() as any;
      responseText = data.choices?.[0]?.message?.content || '';
      tokensUsed = data.usage?.total_tokens || 0;
    } catch (error) {
      throw normalizeProviderError(provider, error, 'OpenAI request failed');
    }
  } else if (provider === 'local') {
    const candidateUrls = getCandidateLocalLlmUrls(localUrl);
    const attemptedEndpoints: string[] = [];
    let lastError: unknown = null;

    for (const candidateUrl of candidateUrls) {
      throwIfAborted(signal);
      const openAiEndpoint = `${candidateUrl.replace(/\/$/, '')}/v1/chat/completions`;
      attemptedEndpoints.push(openAiEndpoint);

      try {
        const response = await fetch(openAiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
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
          throw new LLMProviderError(
            provider,
            summarizeProviderErrorBody(body, `Local LLM request failed with ${response.status}`),
            { statusCode: response.status, retryable: isRetryableStatus(response.status) },
          );
        }

        const data = await response.json() as any;
        responseText = data.choices?.[0]?.message?.content || '';
        tokensUsed = data.usage?.total_tokens || Math.ceil((prompt.length + responseText.length) / 4);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;

        const normalizedError = normalizeProviderError(provider, error, 'Local LLM request failed');
        if (!normalizedError.retryable) {
          throw normalizedError;
        }
      }
    }

    if (!responseText) {
      const normalizedError = normalizeProviderError(provider, lastError, 'Local LLM request failed');
      const attemptSummary = attemptedEndpoints.length > 0
        ? ` Attempted: ${attemptedEndpoints.join(', ')}`
        : '';

      throw new LLMProviderError(
        provider,
        `${normalizedError.message}.${attemptSummary}`.trim(),
        { statusCode: normalizedError.statusCode, retryable: normalizedError.retryable },
      );
    }
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (!responseText) {
    throw new Error('The provider returned an empty response.');
  }

  throwIfAborted(signal);

  if (!tokensUsed) {
    tokensUsed = Math.ceil((systemPrompt.length + prompt.length + responseText.length) / 4);
  }

  return { responseText, tokensUsed };
}

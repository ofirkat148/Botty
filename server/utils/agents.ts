import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { agentDefinitions, userSettings } from '../db/schema.js';
import { BUILT_IN_AGENT_DEFINITIONS, isAgentExecutorType, type AgentDefinition, type AgentExecutorType, type ToolDefinition } from '../../shared/agentDefinitions.js';
import { normalizeSlashCommand } from '../../shared/functionPresets.js';

type AgentCandidate = Partial<AgentDefinition> | null;

function defaultUseWhen(title: string) {
  return `Use ${title || 'this agent'} when a specialist should own a multi-turn task from start to finish.`;
}

function defaultBoundaries() {
  return 'Can steer provider, model, and memory for the session. Best for specialist ownership, not quick one-off overlays.';
}

export function normalizeAgentDefinition(value: AgentCandidate): AgentDefinition | null {
  const candidate = value as AgentCandidate;
  const title = String(candidate?.title || '').trim();
  const description = String(candidate?.description || '').trim();
  const command = normalizeSlashCommand(String(candidate?.command || '').trim() || title);
  const useWhen = String(candidate?.useWhen || '').trim() || defaultUseWhen(title);
  const boundaries = String(candidate?.boundaries || '').trim() || defaultBoundaries();
  const systemPrompt = String(candidate?.systemPrompt || '').trim();
  const starterPrompt = String(candidate?.starterPrompt || '').trim();
  const provider = typeof candidate?.provider === 'string' && candidate.provider.trim()
    ? candidate.provider.trim().toLowerCase()
    : null;
  const model = typeof candidate?.model === 'string' && candidate.model.trim()
    ? candidate.model.trim()
    : null;
  const memoryMode = candidate?.memoryMode === 'isolated' || candidate?.memoryMode === 'none'
    ? candidate.memoryMode
    : 'shared';
  const executorType: AgentExecutorType = isAgentExecutorType(candidate?.executorType)
    ? candidate.executorType
    : 'internal-llm';
  const endpoint = typeof candidate?.endpoint === 'string' && candidate.endpoint.trim()
    ? candidate.endpoint.trim()
    : null;
  const rawConfig = candidate?.config && typeof candidate.config === 'object' && !Array.isArray(candidate.config)
    ? candidate.config as Record<string, unknown>
    : null;
  const tools = extractTools(rawConfig?.tools ?? (candidate as any)?.tools);
  const rawMaxTurns = (rawConfig?.maxTurns ?? (candidate as any)?.maxTurns);
  const maxTurns = typeof rawMaxTurns === 'number' && rawMaxTurns > 0 ? rawMaxTurns : null;
  const config = rawConfig ? { ...rawConfig, tools: tools.length > 0 ? tools : undefined, maxTurns: maxTurns ?? undefined } : (tools.length > 0 || maxTurns ? { tools: tools.length > 0 ? tools : undefined, maxTurns: maxTurns ?? undefined } : null);
  const enabled = candidate?.enabled !== false;

  if (!title || !description || !command || !systemPrompt) {
    return null;
  }

  if (executorType === 'remote-http' && !endpoint) {
    return null;
  }

  return {
    id: String(candidate?.id || randomUUID()),
    kind: 'agent',
    title,
    description,
    command,
    useWhen,
    boundaries,
    systemPrompt,
    starterPrompt,
    provider,
    model,
    memoryMode,
    executorType,
    endpoint,
    config,
    tools: tools.length > 0 ? tools : null,
    maxTurns,
    enabled,
    builtIn: candidate?.builtIn === true,
  };
}

function extractTools(value: unknown): ToolDefinition[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map(item => ({
      name: String(item.name || '').trim().replace(/[^a-z0-9_]/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'tool',
      description: String(item.description || '').trim(),
      parametersSchema: typeof item.parametersSchema === 'string' && item.parametersSchema.trim() ? item.parametersSchema.trim() : null,
    }))
    .filter(item => item.name && item.description);
}

function normalizeLegacyAgents(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as AgentDefinition[];
  }

  const uniqueByCommand = new Map<string, AgentDefinition>();

  value.forEach((item) => {
    const normalized = normalizeAgentDefinition(item as AgentCandidate);
    if (!normalized || uniqueByCommand.has(normalized.command)) {
      return;
    }

    uniqueByCommand.set(normalized.command, normalized);
  });

  return Array.from(uniqueByCommand.values());
}

function rowToAgentDefinition(row: typeof agentDefinitions.$inferSelect): AgentDefinition {
  const config = row.config ? JSON.parse(row.config) as Record<string, unknown> : null;
  const tools = extractTools(config?.tools);
  const rawMaxTurns = config?.maxTurns;
  const maxTurns = typeof rawMaxTurns === 'number' && rawMaxTurns > 0 ? rawMaxTurns : null;
  return {
    id: row.id,
    kind: 'agent',
    title: row.title,
    description: row.description,
    command: row.command,
    useWhen: row.useWhen,
    boundaries: row.boundaries,
    systemPrompt: row.systemPrompt,
    starterPrompt: row.starterPrompt,
    provider: row.provider,
    model: row.model,
    memoryMode: row.memoryMode === 'isolated' || row.memoryMode === 'none' ? row.memoryMode : 'shared',
    executorType: isAgentExecutorType(row.executorType) ? row.executorType : 'internal-llm',
    endpoint: row.endpoint,
    config,
    tools: tools.length > 0 ? tools : null,
    maxTurns,
    enabled: row.enabled !== false,
  };
}

function agentToRow(uid: string, agent: AgentDefinition): typeof agentDefinitions.$inferInsert {
  const baseConfig = agent.config || {};
  const mergedConfig = {
    ...baseConfig,
    ...(agent.tools?.length ? { tools: agent.tools } : {}),
    ...(agent.maxTurns != null ? { maxTurns: agent.maxTurns } : {}),
  };
  return {
    id: agent.id,
    uid,
    title: agent.title,
    description: agent.description,
    command: agent.command,
    useWhen: agent.useWhen,
    boundaries: agent.boundaries,
    systemPrompt: agent.systemPrompt,
    starterPrompt: agent.starterPrompt,
    provider: agent.provider || null,
    model: agent.model || null,
    memoryMode: agent.memoryMode || 'shared',
    executorType: agent.executorType,
    endpoint: agent.endpoint || null,
    config: Object.keys(mergedConfig).length > 0 ? JSON.stringify(mergedConfig) : null,
    enabled: agent.enabled !== false,
    updatedAt: new Date().toISOString(),
  };
}

export async function listCustomAgentsForUser(uid: string) {
  const db = getDatabase();
  const [storedRows, legacyRows] = await Promise.all([
    db.select().from(agentDefinitions).where(eq(agentDefinitions.uid, uid)),
    db.select({ customBots: userSettings.customBots }).from(userSettings).where(eq(userSettings.uid, uid)).limit(1),
  ]);

  // Dedup by stable id (not command — command can be renamed)
  const merged = new Map<string, AgentDefinition>();

  storedRows
    .map(rowToAgentDefinition)
    .filter((agent) => agent.enabled !== false)
    .forEach((agent) => {
      merged.set(agent.id, agent);
    });

  normalizeLegacyAgents(legacyRows[0]?.customBots)
    .filter((agent) => agent.enabled !== false)
    .forEach((agent) => {
    if (!merged.has(agent.id)) {
      merged.set(agent.id, agent);
    }
  });

  return Array.from(merged.values());
}

export async function resolveAgentForUser(uid: string, agentId: string) {
  const builtIn = BUILT_IN_AGENT_DEFINITIONS.find((agent) => agent.id === agentId);
  if (builtIn) {
    return builtIn;
  }

  const customAgents = await listCustomAgentsForUser(uid);
  return customAgents.find((agent) => agent.id === agentId) || null;
}

export async function getCustomAgentForUser(uid: string, agentId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(agentDefinitions)
    .where(eq(agentDefinitions.uid, uid));

  const match = rows.find((row) => row.id === agentId);
  return match ? rowToAgentDefinition(match) : null;
}

export async function replaceCustomAgentsForUser(uid: string, items: unknown) {
  const db = getDatabase();
  const normalizedAgents = Array.isArray(items)
    ? items
        .map((item) => normalizeAgentDefinition(item as AgentCandidate))
        .filter((item): item is AgentDefinition => Boolean(item))
    : [];

  await db.delete(agentDefinitions).where(eq(agentDefinitions.uid, uid));

  if (normalizedAgents.length > 0) {
    await db.insert(agentDefinitions).values(normalizedAgents.map((agent) => agentToRow(uid, agent))).onConflictDoNothing();
  }

  return normalizedAgents;
}

export async function createCustomAgentForUser(uid: string, input: AgentCandidate) {
  const normalized = normalizeAgentDefinition(input);
  if (!normalized) {
    return null;
  }

  const db = getDatabase();
  await db.insert(agentDefinitions).values(agentToRow(uid, normalized)).onConflictDoUpdate({
    target: agentDefinitions.id,
    set: {
      title: normalized.title,
      description: normalized.description,
      command: normalized.command,
      useWhen: normalized.useWhen,
      boundaries: normalized.boundaries,
      systemPrompt: normalized.systemPrompt,
      starterPrompt: normalized.starterPrompt,
      provider: normalized.provider || null,
      model: normalized.model || null,
      memoryMode: normalized.memoryMode || 'shared',
      executorType: normalized.executorType,
      endpoint: normalized.endpoint || null,
      config: normalized.config ? JSON.stringify(normalized.config) : null,
      enabled: normalized.enabled !== false,
      updatedAt: new Date().toISOString(),
    },
  });

  return normalized;
}

export async function deleteCustomAgentForUser(uid: string, agentId: string) {
  const existingAgent = await getCustomAgentForUser(uid, agentId);
  if (!existingAgent) {
    return null;
  }

  const db = getDatabase();
  await db.delete(agentDefinitions).where(eq(agentDefinitions.id, agentId));
  return existingAgent;
}
import { BOT_PRESETS, type FunctionPreset } from './functionPresets.js';

export type AgentExecutorType = 'internal-llm' | 'remote-http';

export type AgentDefinition = Omit<FunctionPreset, 'kind'> & {
  kind: 'agent';
  executorType: AgentExecutorType;
  endpoint?: string | null;
  config?: Record<string, unknown> | null;
  enabled?: boolean;
};

export const BUILT_IN_AGENT_DEFINITIONS: AgentDefinition[] = BOT_PRESETS.map((preset) => ({
  ...preset,
  kind: 'agent',
  executorType: 'internal-llm',
  endpoint: null,
  config: null,
  enabled: true,
}));

export function isAgentExecutorType(value: unknown): value is AgentExecutorType {
  return value === 'internal-llm' || value === 'remote-http';
}

export function isAgentDefinition(value: FunctionPreset | AgentDefinition): value is AgentDefinition {
  return value.kind === 'agent';
}
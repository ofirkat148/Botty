import { BOT_PRESETS, type FunctionPreset } from './functionPresets.js';

export type AgentExecutorType = 'internal-llm' | 'remote-http' | 'local-agent';

/** A callable tool an agent can advertise to the LLM or a remote endpoint. */
export type ToolDefinition = {
  /** Identifier the LLM uses when calling the tool (snake_case recommended). */
  name: string;
  /** Human-readable description of what the tool does and when to use it. */
  description: string;
  /** Optional JSON Schema string for the tool's input parameters. */
  parametersSchema?: string | null;
};

export type AgentDefinition = Omit<FunctionPreset, 'kind'> & {
  kind: 'agent';
  executorType: AgentExecutorType;
  endpoint?: string | null;
  /** Tools this agent can call. Stored in config.tools. */
  tools?: ToolDefinition[] | null;
  /** Maximum conversation turns before a completion signal is emitted. null = unlimited. */
  maxTurns?: number | null;
  /** When true (default), Botty feeds agent data through its LLM for synthesis. Set false to return raw agent data immediately. */
  llmSynthesize?: boolean | null;
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
  return value === 'internal-llm' || value === 'remote-http' || value === 'local-agent';
}

export function isAgentDefinition(value: FunctionPreset | AgentDefinition): value is AgentDefinition {
  return value.kind === 'agent';
}
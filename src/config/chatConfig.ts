export type FunctionPreset = {
  id: string;
  kind: 'skill' | 'agent';
  title: string;
  description: string;
  command: string;
  useWhen: string;
  boundaries: string;
  systemPrompt: string;
  starterPrompt: string;
  provider?: string | null;
  model?: string | null;
  memoryMode?: 'shared' | 'isolated' | 'none';
  builtIn?: boolean;
};

export const AUTO_ROUTE_OPTIONS = [
  { value: 'auto', label: 'Smart default' },
  { value: 'fastest', label: 'Fastest' },
  { value: 'cheapest', label: 'Cheapest' },
  { value: 'best-quality', label: 'Best quality' },
  { value: 'local-first', label: 'Local first' },
] as const;

export const PROVIDERS = [
  { value: 'auto', label: 'Auto route' },
  { value: 'anthropic', label: 'Anthropic / Claude' },
  { value: 'google', label: 'Google / Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'local', label: 'Local OpenAI-compatible' },
];

export const AUTO_ROUTE_MODES = new Set(['auto', 'fastest', 'cheapest', 'best-quality', 'local-first']);

export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-3-7-sonnet-latest',
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  local: 'qwen2.5:3b',
};

export const MODEL_TOKEN_LIMIT_RULES: Array<{ provider?: string; pattern: RegExp; limit: number }> = [
  { provider: 'anthropic', pattern: /claude-3-(7|5)/i, limit: 200000 },
  { provider: 'google', pattern: /gemini-(1\.5|2\.5)/i, limit: 1048576 },
  { provider: 'openai', pattern: /gpt-4o(-mini)?|gpt-4\.1/i, limit: 128000 },
  { provider: 'local', pattern: /qwen2\.5/i, limit: 32768 },
  { provider: 'local', pattern: /gemma3/i, limit: 32768 },
  { provider: 'local', pattern: /llama3\.2/i, limit: 8192 },
  { provider: 'local', pattern: /smollm2/i, limit: 8192 },
];

export const DEFAULT_MODEL_CATALOG: Record<string, string[]> = {
  anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  local: [DEFAULT_MODELS.local],
};

export const MODEL_LABELS: Record<string, { label: string; hint?: string }> = {
  'claude-3-7-sonnet-latest': { label: 'Claude 3.7 Sonnet', hint: 'strong reasoning' },
  'claude-3-5-haiku-latest': { label: 'Claude 3.5 Haiku', hint: 'fast and lightweight' },
  'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', hint: 'fast general use' },
  'gemini-2.5-pro': { label: 'Gemini 2.5 Pro', hint: 'deeper reasoning' },
  'gpt-4o-mini': { label: 'GPT-4o Mini', hint: 'fast and cheap' },
  'gpt-4o': { label: 'GPT-4o', hint: 'balanced quality' },
  'gpt-4.1-mini': { label: 'GPT-4.1 Mini', hint: 'strong coding' },
  'qwen2.5:3b': { label: 'Qwen 2.5 3B', hint: 'balanced local' },
  'qwen2.5:1.5b': { label: 'Qwen 2.5 1.5B', hint: 'faster local' },
  'llama3.2:1b': { label: 'Llama 3.2 1B', hint: 'small local' },
  'gemma3:1b': { label: 'Gemma 3 1B', hint: 'small local' },
  'smollm2:135m': { label: 'SmolLM2 135M', hint: 'tiny and fastest' },
};

export const FUNCTION_PRESETS: FunctionPreset[] = [
  {
    id: 'skill-botty-development',
    kind: 'skill',
    builtIn: true,
    title: 'Botty Development',
    description: 'Full-stack product work across React, Express, memory, local LLM, settings, and Telegram.',
    command: 'development',
    useWhen: 'Use for focused implementation work, architecture changes, or debugging that should stay within the current chat session.',
    boundaries: 'Acts as a capability overlay. It should inherit the current chat provider, memory, and session context rather than taking over the whole workflow.',
    systemPrompt: 'You are Botty’s full-stack development mode. Make focused, production-minded changes across the React frontend, Express backend, PostgreSQL persistence, memory features, local LLM integration, and Telegram support. Prefer shared-layer fixes over route-specific patches. Keep changes minimal, validate after edits, and explain tradeoffs concretely.',
    starterPrompt: 'Help me implement a Botty feature end to end.',
  },
  {
    id: 'skill-botty-runtime-debug',
    kind: 'skill',
    builtIn: true,
    title: 'Runtime Debug',
    description: 'Diagnose fetch failures, localhost issues, service problems, Telegram startup, CORS, and Ollama connectivity.',
    command: 'debug',
    useWhen: 'Use for targeted runtime investigations where you want Botty to stay in your current thread and debug a concrete issue.',
    boundaries: 'Acts as a diagnostic overlay. It should keep the current chat context and avoid behaving like a long-running autonomous specialist.',
    systemPrompt: 'You are Botty’s runtime debugging mode. Diagnose issues methodically across systemd, localhost access, API behavior, CORS, Telegram startup, Ollama connectivity, and saved settings. Confirm whether the service is healthy before assuming an outage. Separate local application errors from upstream network failures, and prefer root-cause fixes over surface workarounds.',
    starterPrompt: 'Debug the current Botty runtime issue and find the root cause.',
  },
  {
    id: 'skill-botty-ops',
    kind: 'skill',
    builtIn: true,
    title: 'Botty Ops',
    description: 'Operational mode for Docker, systemd, PostgreSQL, ports, persistence, and reverse proxy work.',
    command: 'ops',
    useWhen: 'Use for focused operational tasks such as startup, deployment, persistence, ports, or reverse proxy changes inside the current chat.',
    boundaries: 'Acts as an ops overlay. It should inherit the current session rather than becoming a persistent specialist with its own routing rules.',
    systemPrompt: 'You are Botty’s operations mode. Focus on runtime configuration, Docker, PostgreSQL, systemd startup, reverse proxy setup, and production-style local serving. Use the smallest operational fix that restores service, avoid destructive resets, and verify outcomes with health checks and logs.',
    starterPrompt: 'Help me operate or deploy Botty safely.',
  },
  {
    id: 'agent-botty-builder',
    kind: 'agent',
    builtIn: true,
    title: 'Botty Builder',
    description: 'Implementation-focused mode for feature work and bug fixes in this repository.',
    command: 'builder',
    useWhen: 'Use when you want a dedicated specialist to own implementation work across multiple turns, files, and follow-up refinements.',
    boundaries: 'Behaves like a specialist agent. It can own the session workflow and may use its own provider, model, or memory strategy when configured.',
    systemPrompt: 'You are Botty Builder. Implement requested features or fixes directly and precisely. Read the relevant route, service, utility, and UI code first. Do not stop at analysis when a concrete change is needed. Avoid unrelated refactors, keep persistence and UI contracts aligned, and validate the final result.',
    starterPrompt: 'Implement this change in Botty.',
  },
  {
    id: 'agent-botty-reviewer',
    kind: 'agent',
    builtIn: true,
    title: 'Botty Reviewer',
    description: 'Review-focused mode for bugs, regressions, runtime risk, and missing tests.',
    command: 'reviewer',
    useWhen: 'Use when you want a dedicated review specialist to inspect changes, surface risks, and stay in review mode across the session.',
    boundaries: 'Behaves like a review agent. It should own the review workflow rather than acting as a lightweight slash-command overlay.',
    systemPrompt: 'You are Botty Reviewer. Review changes for defects, regressions, runtime risk, broken settings flows, memory issues, local LLM failures, Telegram issues, and deployment mistakes. Findings come first. Focus on correctness and behavior, not style. Use concise, severity-ordered review output with concrete file-level reasoning.',
    starterPrompt: 'Review this Botty change for bugs and regressions.',
  },
  {
    id: 'agent-botty-ops',
    kind: 'agent',
    builtIn: true,
    title: 'Botty Ops',
    description: 'Operations-focused mode for service health, environment settings, and startup failures.',
    command: 'ops-bot',
    useWhen: 'Use when an operations specialist should own a multi-step runtime or deployment task across several checks and fixes.',
    boundaries: 'Behaves like an ops agent. It can steer the session and use dedicated provider or memory behavior, unlike a transient skill overlay.',
    systemPrompt: 'You are Botty Ops. Handle runtime operations for the Botty app: systemd, Docker, PostgreSQL, localhost health, reverse proxy setup, external exposure, and startup failures. Do not assume the service is down before checking health and logs. Distinguish local application faults from upstream network problems.',
    starterPrompt: 'Diagnose and fix this Botty runtime or deployment issue.',
  },
];

export const SKILL_PRESETS = FUNCTION_PRESETS.filter(item => item.kind === 'skill');
export const BOT_PRESETS = FUNCTION_PRESETS.filter(item => item.kind === 'agent');

export function getFunctionPresetForPrompt(value: string | null | undefined, presets: FunctionPreset[]) {
  const trimmed = value?.trim() || '';
  if (!trimmed) {
    return null;
  }

  return presets.find(preset => preset.systemPrompt === trimmed) || null;
}
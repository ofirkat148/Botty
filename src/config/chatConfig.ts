export {
  BOT_PRESETS,
  FUNCTION_PRESETS,
  getFunctionPresetForPrompt,
  normalizeSlashCommand,
  RESERVED_SLASH_COMMANDS,
  SKILL_PRESETS,
  type FunctionPreset,
} from '../../shared/functionPresets';

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

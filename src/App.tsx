import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createWorker, PSM } from 'tesseract.js';
import {
  Bot,
  Download,
  History,
  KeyRound,
  LogOut,
  Maximize2,
  Menu,
  MemoryStick,
  Mic,
  Minimize2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  Square,
  SunMedium,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_CHAT_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_CHAT_ATTACHMENT_CHARS = 12000;
const MAX_CHAT_ATTACHMENT_PAGES = 20;
const MAX_RECENT_SLASH_ITEMS = 4;

let imageOcrWorkerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

type User = {
  id: string;
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  tokensUsed?: number | null;
};

type PendingAttachment = {
  id: string;
  name: string;
  content: string;
  type?: string;
  size: number;
  source: 'text' | 'pdf' | 'image';
};

type HistoryEntry = {
  id: string;
  prompt: string;
  response: string;
  model: string;
  tokensUsed?: number | null;
  conversationId?: string | null;
  timestamp: string;
};

type Fact = {
  id: string;
  content: string;
  timestamp: string;
};

type MemoryUrl = {
  id: string;
  url: string;
  title?: string | null;
  timestamp: string;
};

type MemoryFile = {
  id: string;
  name: string;
  content: string;
  type?: string | null;
  size?: number | null;
  timestamp: string;
};

type ApiKey = {
  provider: string;
  key: string;
};

type SettingsResponse = {
  localUrl: string | null;
  useMemory: boolean;
  autoMemory: boolean;
  sandboxMode: boolean;
  telegramBotToken?: string | null;
  telegramBotEnabled?: boolean;
  telegramAllowedChatIds?: string | null;
  telegramProvider?: string | null;
  telegramModel?: string | null;
};

type TelegramStatusResponse = {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  username?: string | null;
  error?: string | null;
};

type ProvidersResponse = {
  providers: string[];
  defaultLocalModel?: string | null;
  modelCatalog?: Record<string, string[]>;
};

type ModelUsageEntry = {
  key: string;
  provider?: string | null;
  model: string;
  tokens: number;
};

type UsageResponse = {
  tokens: number;
  modelUsage: ModelUsageEntry[];
  providerUsage: Array<{ provider: string; tokens: number }>;
  trend: Array<{ date: string; tokens: number }>;
  date: string;
};

type MemoryBackupPayload = {
  version?: number;
  exportedAt?: string;
  memory?: {
    facts?: Array<unknown>;
    files?: Array<unknown>;
    urls?: Array<unknown>;
  };
  settings?: {
    localUrl?: string | null;
    useMemory?: boolean;
    autoMemory?: boolean;
    sandboxMode?: boolean;
  };
  userSettings?: {
    systemPrompt?: string | null;
  };
  history?: Array<unknown>;
};

type MemoryRestorePreview = {
  fileName: string;
  exportedAt: string | null;
  facts: number;
  files: number;
  urls: number;
  history: number;
  includesSettings: boolean;
  includesSystemPrompt: boolean;
};

type FunctionPreset = {
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

type FunctionCatalogResponse = {
  skills: FunctionPreset[];
  bots: FunctionPreset[];
};

type SlashCommand = {
  id: string;
  command: string;
  title: string;
  description: string;
  detail?: string;
  badge: string;
  keywords?: string[];
  category: 'command';
};

type SlashMenuItem = {
  id: string;
  command: string;
  title: string;
  description: string;
  detail?: string;
  badge: string;
  keywords?: string[];
  category: 'command' | 'skill' | 'bot';
  preset?: FunctionPreset;
};

const PROVIDERS = [
  { value: 'auto', label: 'Auto route' },
  { value: 'anthropic', label: 'Anthropic / Claude' },
  { value: 'google', label: 'Google / Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'local', label: 'Local OpenAI-compatible' },
];

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-3-7-sonnet-latest',
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  local: 'qwen2.5:3b',
};

const MODEL_TOKEN_LIMIT_RULES: Array<{ provider?: string; pattern: RegExp; limit: number }> = [
  { provider: 'anthropic', pattern: /claude-3-(7|5)/i, limit: 200000 },
  { provider: 'google', pattern: /gemini-(1\.5|2\.5)/i, limit: 1048576 },
  { provider: 'openai', pattern: /gpt-4o(-mini)?|gpt-4\.1/i, limit: 128000 },
  { provider: 'local', pattern: /qwen2\.5/i, limit: 32768 },
  { provider: 'local', pattern: /gemma3/i, limit: 32768 },
  { provider: 'local', pattern: /llama3\.2/i, limit: 8192 },
  { provider: 'local', pattern: /smollm2/i, limit: 8192 },
];

const DEFAULT_MODEL_CATALOG: Record<string, string[]> = {
  anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  local: [DEFAULT_MODELS.local],
};

const MODEL_LABELS: Record<string, { label: string; hint?: string }> = {
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

const FUNCTION_PRESETS: FunctionPreset[] = [
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
    boundaries: 'Behaves like a specialist bot. It can own the session workflow and may use its own provider, model, or memory strategy when configured.',
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
    boundaries: 'Behaves like a review bot. It should own the review workflow rather than acting as a lightweight slash-command overlay.',
    systemPrompt: 'You are Botty Reviewer. Review changes for defects, regressions, runtime risk, broken settings flows, memory issues, local LLM failures, Telegram issues, and deployment mistakes. Findings come first. Focus on correctness and behavior, not style. Use concise, severity-ordered review output with concrete file-level reasoning.',
    starterPrompt: 'Review this Botty change for bugs and regressions.',
  },
  {
    id: 'agent-botty-ops',
    kind: 'agent',
    builtIn: true,
    title: 'Botty Ops Agent',
    description: 'Operations-focused mode for service health, environment settings, and startup failures.',
    command: 'ops-bot',
    useWhen: 'Use when an operations specialist should own a multi-step runtime or deployment task across several checks and fixes.',
    boundaries: 'Behaves like an ops bot. It can steer the session and use dedicated provider or memory behavior, unlike a transient skill overlay.',
    systemPrompt: 'You are Botty Ops. Handle runtime operations for the Botty app: systemd, Docker, PostgreSQL, localhost health, reverse proxy setup, external exposure, and startup failures. Do not assume the service is down before checking health and logs. Distinguish local application faults from upstream network problems.',
    starterPrompt: 'Diagnose and fix this Botty runtime or deployment issue.',
  },
];

const SKILL_PRESETS = FUNCTION_PRESETS.filter(item => item.kind === 'skill');
const BOT_PRESETS = FUNCTION_PRESETS.filter(item => item.kind === 'agent');

function getFunctionPresetForPrompt(value: string | null | undefined, presets: FunctionPreset[]) {
  const trimmed = value?.trim() || '';
  if (!trimmed) {
    return null;
  }

  return presets.find(preset => preset.systemPrompt === trimmed) || null;
}

const TABS = [
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'skills', label: 'Skills', Icon: Sparkles },
  { value: 'bots', label: 'Bots', Icon: Bot },
  { value: 'history', label: 'History', Icon: History },
  { value: 'memory', label: 'Memory', Icon: MemoryStick },
  { value: 'settings', label: 'Settings', Icon: Settings },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function AppShell() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    const savedTheme = window.localStorage.getItem('botty.theme');
    if (savedTheme === 'dark') {
      return true;
    }

    if (savedTheme === 'light') {
      return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [token, setToken] = useState(() => localStorage.getItem('botty.authToken') || '');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');

  const [activeTab, setActiveTab] = useState<TabValue>('chat');
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatError, setChatError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [defaultLocalModel, setDefaultLocalModel] = useState(DEFAULT_MODELS.local);
  const [modelCatalog, setModelCatalog] = useState<Record<string, string[]>>(DEFAULT_MODEL_CATALOG);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [memoryUrls, setMemoryUrls] = useState<MemoryUrl[]>([]);
  const [customSkills, setCustomSkills] = useState<FunctionPreset[]>([]);
  const [customBots, setCustomBots] = useState<FunctionPreset[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [dailyTokens, setDailyTokens] = useState(0);
  const [dailyModelUsage, setDailyModelUsage] = useState<ModelUsageEntry[]>([]);
  const [dailyProviderUsage, setDailyProviderUsage] = useState<Array<{ provider: string; tokens: number }>>([]);
  const [usageTrend, setUsageTrend] = useState<Array<{ date: string; tokens: number }>>([]);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [localUrl, setLocalUrl] = useState('http://127.0.0.1:11435');
  const [useMemory, setUseMemory] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotEnabled, setTelegramBotEnabled] = useState(true);
  const [telegramAllowedChatIds, setTelegramAllowedChatIds] = useState('');
  const [telegramProvider, setTelegramProvider] = useState('auto');
  const [telegramModel, setTelegramModel] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [loadingTelegramStatus, setLoadingTelegramStatus] = useState(false);
  const [activeFunctionId, setActiveFunctionId] = useState('');
  const [applyingFunctionId, setApplyingFunctionId] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [hasSidebarPreference, setHasSidebarPreference] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem('botty.sidebarExpanded') !== null;
  });
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    const savedValue = window.localStorage.getItem('botty.sidebarExpanded');
    if (savedValue === null) {
      return !window.matchMedia('(max-width: 1023px)').matches;
    }

    return savedValue !== 'false';
  });
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return !window.matchMedia('(max-width: 1279px)').matches;
  });
  const [recentSlashItemIds, setRecentSlashItemIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const rawValue = window.localStorage.getItem('botty.recentSlashItems');
      if (!rawValue) {
        return [];
      }

      const parsedValue = JSON.parse(rawValue);
      return Array.isArray(parsedValue) ? parsedValue.filter(value => typeof value === 'string').slice(0, MAX_RECENT_SLASH_ITEMS) : [];
    } catch {
      return [];
    }
  });
  const [newFact, setNewFact] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const factFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [newSkillTitle, setNewSkillTitle] = useState('');
  const [newSkillDescription, setNewSkillDescription] = useState('');
  const [newSkillCommand, setNewSkillCommand] = useState('');
  const [newSkillUseWhen, setNewSkillUseWhen] = useState('');
  const [newSkillBoundaries, setNewSkillBoundaries] = useState('');
  const [newSkillSystemPrompt, setNewSkillSystemPrompt] = useState('');
  const [newSkillStarterPrompt, setNewSkillStarterPrompt] = useState('');
  const [newBotTitle, setNewBotTitle] = useState('');
  const [newBotDescription, setNewBotDescription] = useState('');
  const [newBotUseWhen, setNewBotUseWhen] = useState('');
  const [newBotBoundaries, setNewBotBoundaries] = useState('');
  const [newBotProvider, setNewBotProvider] = useState('');
  const [newBotModel, setNewBotModel] = useState('');
  const [newBotMemoryMode, setNewBotMemoryMode] = useState<'shared' | 'isolated' | 'none'>('shared');
  const [newBotSystemPrompt, setNewBotSystemPrompt] = useState('');
  const [newBotStarterPrompt, setNewBotStarterPrompt] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({
    anthropic: '',
    google: '',
    openai: '',
  });
  const [savingKey, setSavingKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingFunction, setCreatingFunction] = useState<'skill' | 'agent' | ''>('');
  const [isExportingMemory, setIsExportingMemory] = useState(false);
  const [isImportingMemory, setIsImportingMemory] = useState(false);
  const [pendingMemoryRestore, setPendingMemoryRestore] = useState<MemoryBackupPayload | null>(null);
  const [memoryRestorePreview, setMemoryRestorePreview] = useState<MemoryRestorePreview | null>(null);
  const [notice, setNotice] = useState('');
  const importMemoryInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const composerDropRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const allFunctionPresets = useMemo(() => [...FUNCTION_PRESETS, ...customSkills, ...customBots], [customSkills, customBots]);
  const skillPresets = useMemo(() => [...SKILL_PRESETS, ...customSkills], [customSkills]);
  const botPresets = useMemo(() => [...BOT_PRESETS, ...customBots], [customBots]);
  const activePresetTitle = allFunctionPresets.find(item => item.id === activeFunctionId)?.title || '';
  const slashCommands = useMemo<SlashCommand[]>(() => [
    {
      id: 'command-new-chat',
      command: 'new-chat',
      title: 'New Chat',
      description: messages.length > 0 ? `Clear ${messages.length} messages and start a fresh chat.` : 'Start a fresh chat in the composer.',
      detail: activeTab === 'chat' ? 'You are already in chat.' : 'Switches back to chat after resetting the thread.',
      badge: messages.length > 0 ? `${messages.length} msgs` : 'Chat',
      keywords: ['reset', 'clear conversation', 'fresh start', 'chat'],
      category: 'command',
    },
    {
      id: 'command-clear-mode',
      command: 'clear-mode',
      title: 'Clear Mode',
      description: activePresetTitle ? `Turn off ${activePresetTitle} and return to default chat mode.` : 'Stay in default chat mode with no active skill or bot overlay.',
      detail: activePresetTitle ? 'Useful when a specialized mode is changing the assistant behavior.' : 'No skill or bot is active right now.',
      badge: activePresetTitle ? 'Active mode' : 'Default',
      keywords: ['mode', 'skill', 'bot', 'default chat', 'reset mode'],
      category: 'command',
    },
    {
      id: 'command-refresh',
      command: 'refresh',
      title: 'Refresh Data',
      description: 'Reload history, memory, settings, and provider metadata.',
      detail: `Sync ${history.length} history rows, ${facts.length} facts, and ${memoryFiles.length} files with the server.`,
      badge: 'Sync',
      keywords: ['reload', 'sync', 'refetch', 'update data'],
      category: 'command',
    },
    {
      id: 'command-sandbox',
      command: 'sandbox',
      title: sandboxMode ? 'Turn Sandbox Off' : 'Turn Sandbox On',
      description: sandboxMode ? 'Disable sandbox mode and restore regular chat access.' : 'Enable sandbox mode so prompts only rely on saved facts and known sites.',
      detail: sandboxMode ? 'Current state: sandbox is on.' : 'Current state: sandbox is off.',
      badge: sandboxMode ? 'On' : 'Off',
      keywords: ['safe mode', 'toggle sandbox', 'memory only', 'restricted'],
      category: 'command',
    },
    ...TABS.filter(tab => tab.value !== 'chat').map(tab => ({
      id: `command-open-${tab.value}`,
      command: tab.value,
      title: `Open ${tab.label}`,
      description: activeTab === tab.value ? `${tab.label} is already open.` : `Switch to the ${tab.label.toLowerCase()} tab.`,
      detail: `Jump directly to ${tab.label.toLowerCase()} from the composer.`,
      badge: activeTab === tab.value ? 'Current' : 'Tab',
      keywords: ['open tab', 'navigate', tab.label.toLowerCase()],
      category: 'command' as const,
    })),
  ], [activePresetTitle, activeTab, facts.length, history.length, memoryFiles.length, messages.length, sandboxMode]);
  const activeBotPreset = useMemo(() => {
    const activePreset = allFunctionPresets.find(item => item.id === activeFunctionId) || null;
    return activePreset?.kind === 'agent' ? activePreset : null;
  }, [activeFunctionId, allFunctionPresets]);

  function formatProviderLabel(value?: string) {
    if (!value) {
      return '';
    }

    if (value === 'openai') {
      return 'OpenAI';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function humanizeFallbackModelName(modelValue: string) {
    return modelValue
      .replace(/[-_:]+/g, ' ')
      .replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase())
      .replace(/\b(\d+)b\b/gi, '$1B')
      .trim();
  }

  function formatModelOptionLabel(modelValue: string, providerValue?: string) {
    if (!modelValue) {
      return providerValue && providerValue !== 'auto' ? 'Provider default' : 'Chosen automatically';
    }

    const known = MODEL_LABELS[modelValue];
    const label = known?.label || humanizeFallbackModelName(modelValue);
    const hint = known?.hint;

    return hint ? `${label} - ${hint}` : label;
  }

  function formatModelDisplay(modelValue?: string | null, providerValue?: string) {
    if (!modelValue) {
      return providerValue === 'auto' ? 'auto-selected' : 'provider default';
    }

    return formatModelOptionLabel(modelValue, providerValue);
  }

  function getPresetActivationLabel(preset: FunctionPreset) {
    return preset.kind === 'skill' ? 'Activation: slash command or quick menu apply' : 'Activation: dedicated bot session';
  }

  function getPresetAutonomyLabel(preset: FunctionPreset) {
    return preset.kind === 'skill' ? 'Autonomy: low, task-scoped overlay' : 'Autonomy: higher, specialist session owner';
  }

  function getPresetRoutingLabel(preset: FunctionPreset) {
    if (preset.kind === 'skill') {
      return 'Routing: inherits current chat provider and model';
    }

    if (!preset.provider || preset.provider === 'auto') {
      return 'Routing: inherits current chat or auto route';
    }

    return `Routing: prefers ${formatProviderLabel(preset.provider)}${preset.model ? ` · ${preset.model}` : ''}`;
  }

  function getPresetMemoryLabel(preset: FunctionPreset) {
    if (preset.kind === 'skill') {
      return 'Memory: uses the current chat and memory settings';
    }

    if (preset.memoryMode === 'isolated') {
      return 'Memory: isolated bot memory';
    }

    if (preset.memoryMode === 'none') {
      return 'Memory: disabled';
    }

    return 'Memory: shared with the main Botty context';
  }

  function getSlashItemPanelClass(isSelected: boolean) {
    if (isSelected) {
      return isDarkMode ? 'bg-white/10 text-stone-100' : 'bg-white text-stone-900 border border-stone-200';
    }

    return isDarkMode ? 'text-stone-300 hover:bg-white/5' : 'text-stone-700 hover:bg-white';
  }

  function getSlashItemBadgeClass(item: SlashMenuItem) {
    if (item.category === 'command') {
      return isDarkMode ? 'bg-sky-500/15 text-sky-100 border border-sky-400/20' : 'bg-sky-50 text-sky-700 border border-sky-200';
    }

    if (item.preset && activeFunctionId === item.preset.id) {
      return isDarkMode ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }

    return isDarkMode ? 'bg-amber-500/15 text-amber-100 border border-amber-400/20' : 'bg-amber-50 text-amber-700 border border-amber-200';
  }

  function inferProviderFromModel(modelValue?: string | null) {
    const normalized = modelValue?.trim().toLowerCase() || '';

    if (!normalized) {
      return '';
    }

    if (normalized.includes('claude')) {
      return 'anthropic';
    }

    if (normalized.includes('gemini')) {
      return 'google';
    }

    if (normalized.includes('gpt') || normalized.startsWith('o1') || normalized.startsWith('o3')) {
      return 'openai';
    }

    if (/(qwen|llama|gemma|smollm)/.test(normalized)) {
      return 'local';
    }

    return '';
  }

  function getEstimatedModelTokenLimit(providerValue?: string | null, modelValue?: string | null) {
    const normalizedModel = modelValue?.trim() || '';
    const normalizedProvider = (providerValue?.trim().toLowerCase() || inferProviderFromModel(normalizedModel));

    if (!normalizedModel) {
      return null;
    }

    const matchingRule = MODEL_TOKEN_LIMIT_RULES.find(rule => {
      if (rule.provider && rule.provider !== normalizedProvider) {
        return false;
      }

      return rule.pattern.test(normalizedModel);
    });

    return matchingRule?.limit || null;
  }

  function formatTokenUsage(tokensUsed?: number | null, providerValue?: string | null, modelValue?: string | null) {
    const used = typeof tokensUsed === 'number' && Number.isFinite(tokensUsed) ? Math.max(0, tokensUsed) : 0;
    const limit = getEstimatedModelTokenLimit(providerValue, modelValue);

    if (!used && !limit) {
      return '';
    }

    if (!limit) {
      return `Tokens: ${used.toLocaleString()} used`;
    }

    const percentage = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
    return `Tokens: ${used.toLocaleString()} / ${limit.toLocaleString()} est. (${percentage}%)`;
  }

  function getSuggestedChatModel(providerValue: string, promptValue: string) {
    if (providerValue === 'local') {
      return defaultLocalModel;
    }

    if (providerValue === 'anthropic') {
      const lower = promptValue.trim().toLowerCase();
      const prefersReasoning = /code|debug|refactor|typescript|javascript|react|sql|query|bug|architecture|implement|fix|analyze|analysis|compare|reason|tradeoff|explain|design|plan/.test(lower)
        || lower.split(/\s+/).filter(Boolean).length > 120;

      return prefersReasoning ? 'claude-3-7-sonnet-latest' : 'claude-3-5-haiku-latest';
    }

    return DEFAULT_MODELS[providerValue] || '';
  }

  function getSelectableModels(providerValue: string, currentValue?: string | null, includeBlankOption = false, catalog?: Record<string, string[]>) {
    if (!providerValue || providerValue === 'auto') {
      return includeBlankOption ? [''] : [];
    }

    const configuredOptions = (catalog || modelCatalog)[providerValue] || DEFAULT_MODEL_CATALOG[providerValue] || [];
    const options = [...configuredOptions];

    if (currentValue?.trim() && !options.includes(currentValue.trim())) {
      options.unshift(currentValue.trim());
    }

    if (includeBlankOption && !options.includes('')) {
      options.unshift('');
    }

    return options;
  }

  function getPreferredSelectableModel(providerValue: string, promptValue: string, currentValue?: string | null, catalog?: Record<string, string[]>) {
    const options = getSelectableModels(providerValue, currentValue, false, catalog);
    const suggested = getSuggestedChatModel(providerValue, promptValue);

    if (suggested && options.includes(suggested)) {
      return suggested;
    }

    if (currentValue?.trim() && options.includes(currentValue.trim())) {
      return currentValue.trim();
    }

    return options[0] || '';
  }

  function supportsSpeechRecognition() {
    if (typeof window === 'undefined') {
      return false;
    }

    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  function hasDraggedFiles(dataTransfer: DataTransfer | null) {
    if (!dataTransfer) {
      return false;
    }

    return Array.from(dataTransfer.types || []).some(type => type === 'Files' || type === 'application/x-moz-file');
  }

  function isPointInsideComposer(clientX: number, clientY: number) {
    const rect = composerDropRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }

    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function isReadableTextFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const textExtensions = ['.txt', '.md', '.markdown', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.xml', '.yml', '.yaml', '.py', '.java', '.c', '.cpp', '.rs', '.go', '.sh', '.sql', '.log'];

    return file.type.startsWith('text/')
      || file.type === 'application/json'
      || file.type === 'application/xml'
      || textExtensions.some(extension => lowerName.endsWith(extension));
  }

  function isPdfFile(file: File) {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }

  function isImageFile(file: File) {
    const lowerName = file.name.toLowerCase();
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

    return file.type.startsWith('image/') || imageExtensions.some(extension => lowerName.endsWith(extension));
  }

  async function readFileAsDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function extractPdfText(file: File) {
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_CHAT_ATTACHMENT_PAGES);
    const chunks: string[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) {
        chunks.push(`Page ${pageNumber}: ${pageText}`);
      }
    }

    return chunks.join('\n\n').trim();
  }

  async function getImageOcrWorker() {
    if (!imageOcrWorkerPromise) {
      imageOcrWorkerPromise = createWorker('eng', 1, {
        logger: message => {
          if (message.status === 'recognizing text') {
            setNotice(`Running OCR: ${Math.round(message.progress * 100)}%`);
          }
        },
      });
    }

    const worker = await imageOcrWorkerPromise;
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
    });
    return worker;
  }

  async function extractImageText(file: File) {
    const worker = await getImageOcrWorker();
    const imageUrl = await readFileAsDataUrl(file);
    const { data } = await worker.recognize(imageUrl);
    return data.text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function parseAttachmentFile(file: File) {
    if (isReadableTextFile(file)) {
      const content = (await file.text()).trim();
      return {
        content,
        source: 'text' as const,
        type: file.type || 'text/plain',
      };
    }

    if (isPdfFile(file)) {
      const content = await extractPdfText(file);
      return {
        content,
        source: 'pdf' as const,
        type: 'application/pdf',
      };
    }

    if (isImageFile(file)) {
      const content = await extractImageText(file);
      return {
        content,
        source: 'image' as const,
        type: file.type || 'image/*',
      };
    }

    return null;
  }

  function formatAttachmentSize(size: number) {
    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    window.localStorage.setItem('botty.theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    window.localStorage.setItem('botty.recentSlashItems', JSON.stringify(recentSlashItemIds));
  }, [recentSlashItemIds]);

  useEffect(() => {
    window.localStorage.setItem('botty.sidebarExpanded', isSidebarExpanded ? 'true' : 'false');
  }, [isSidebarExpanded]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');

    function handleViewportChange(event: MediaQueryListEvent | MediaQueryList) {
      if (hasSidebarPreference) {
        return;
      }

      setIsSidebarExpanded(!event.matches);
    }

    handleViewportChange(mediaQuery);
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, [hasSidebarPreference]);

  useEffect(() => {
    if (isSidebarExpanded) {
      setIsSidebarDrawerOpen(false);
    }
  }, [isSidebarExpanded]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1279px)');

    function handleChatViewportChange(event: MediaQueryListEvent | MediaQueryList) {
      if (document.fullscreenElement) {
        setIsChatSidebarOpen(true);
        return;
      }

      setIsChatSidebarOpen(!event.matches);
    }

    handleChatViewportChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChatViewportChange);
    return () => mediaQuery.removeEventListener('change', handleChatViewportChange);
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const nextIsFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(nextIsFullscreen);

      if (nextIsFullscreen) {
        setIsChatSidebarOpen(true);
        return;
      }

      setIsChatSidebarOpen(!window.matchMedia('(max-width: 1279px)').matches);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || Boolean(target?.isContentEditable);

      if (event.ctrlKey && event.key === '\\') {
        event.preventDefault();
        setHasSidebarPreference(true);
        setIsSidebarExpanded(currentValue => !currentValue);
        return;
      }

      if (event.altKey && event.key === 'Enter' && !isEditableTarget) {
        event.preventDefault();
        void toggleFullscreenMode();
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, []);

  useEffect(() => () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
  }, []);

  const handleWindowFileDrag = useEffectEvent((event: DragEvent) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    if (activeTab !== 'chat') {
      setIsDragOverComposer(false);
      return;
    }

    setIsDragOverComposer(isPointInsideComposer(event.clientX, event.clientY));
  });

  const handleWindowFileDrop = useEffectEvent((event: DragEvent) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    const shouldAttachToComposer = activeTab === 'chat' && isPointInsideComposer(event.clientX, event.clientY);
    setIsDragOverComposer(false);

    if (!shouldAttachToComposer) {
      return;
    }

    void addChatFiles(event.dataTransfer.files);
  });

  const handleWindowDragExit = useEffectEvent((event: DragEvent) => {
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    if (event.clientX <= 0 && event.clientY <= 0) {
      setIsDragOverComposer(false);
    }
  });

  useEffect(() => {
    function onWindowDragOver(event: DragEvent) {
      handleWindowFileDrag(event);
    }

    function onWindowDrop(event: DragEvent) {
      handleWindowFileDrop(event);
    }

    function onWindowDragLeave(event: DragEvent) {
      handleWindowDragExit(event);
    }

    window.addEventListener('dragover', onWindowDragOver, true);
    window.addEventListener('drop', onWindowDrop, true);
    window.addEventListener('dragleave', onWindowDragLeave, true);

    return () => {
      window.removeEventListener('dragover', onWindowDragOver, true);
      window.removeEventListener('drop', onWindowDrop, true);
      window.removeEventListener('dragleave', onWindowDragLeave, true);
    };
  }, [handleWindowDragExit, handleWindowFileDrag, handleWindowFileDrop]);

  useEffect(() => {
    async function loadSession() {
      if (!token) {
        setAuthLoading(false);
        setUser(null);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (!data.user) {
          localStorage.removeItem('botty.authToken');
          localStorage.removeItem('botty.user');
          setToken('');
          setUser(null);
        } else {
          setUser(data.user);
          localStorage.setItem('botty.user', JSON.stringify(data.user));
        }
      } catch {
        setAuthError('Failed to restore the local session.');
      } finally {
        setAuthLoading(false);
      }
    }

    loadSession();
  }, [token]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void refreshAll();
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== 'settings') {
      return;
    }

    void refreshTelegramStatus();
  }, [user, activeTab]);

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [prompt]);

  async function apiGet<T>(path: string) {
    const response = await fetch(path, { headers: authHeaders });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async function apiSend<T>(path: string, method: 'POST' | 'DELETE', body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: authHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return response.headers.get('content-type')?.includes('application/json')
      ? (response.json() as Promise<T>)
      : (undefined as T);
  }

  async function refreshAll() {
    const [historyRows, factRows, fileRows, urlRows, functionsData, keyRows, usageData, settingsData, userSettingsData, providersData] = await Promise.all([
      apiGet<HistoryEntry[]>('/api/history'),
      apiGet<Fact[]>('/api/memory/facts'),
      apiGet<MemoryFile[]>('/api/memory/files'),
      apiGet<MemoryUrl[]>('/api/memory/urls'),
      apiGet<FunctionCatalogResponse>('/api/settings/functions'),
      apiGet<ApiKey[]>('/api/keys'),
      apiGet<UsageResponse>('/api/usage'),
      apiGet<SettingsResponse>('/api/settings'),
      apiGet<{ systemPrompt?: string | null; customSkills?: FunctionPreset[]; customBots?: FunctionPreset[] }>('/api/settings/user-settings'),
      apiGet<ProvidersResponse>('/api/chat/providers'),
    ]);

    setHistory(historyRows);
    setFacts(factRows);
    setMemoryFiles(fileRows);
    setMemoryUrls(urlRows);
    setCustomSkills(functionsData.skills || []);
    setCustomBots(functionsData.bots || []);
    setApiKeys(keyRows);
    setDailyTokens(usageData.tokens || 0);
    setDailyModelUsage(Array.isArray(usageData.modelUsage) ? usageData.modelUsage : []);
    setDailyProviderUsage(Array.isArray(usageData.providerUsage) ? usageData.providerUsage : []);
    setUsageTrend(Array.isArray(usageData.trend) ? usageData.trend : []);
    setLocalUrl(settingsData.localUrl || 'http://127.0.0.1:11435');
    setUseMemory(settingsData.useMemory !== false);
    setAutoMemory(settingsData.autoMemory !== false);
    setSandboxMode(settingsData.sandboxMode === true);
    setTelegramBotToken(settingsData.telegramBotToken || '');
    setTelegramBotEnabled(settingsData.telegramBotEnabled !== false);
    setTelegramAllowedChatIds(settingsData.telegramAllowedChatIds || '');
    setSystemPrompt(userSettingsData.systemPrompt || '');
    setActiveFunctionId(getFunctionPresetForPrompt(userSettingsData.systemPrompt, [...FUNCTION_PRESETS, ...(functionsData.skills || []), ...(functionsData.bots || [])])?.id || '');
    const nextProviders = providersData.providers || [];
    const nextLocalModel = providersData.defaultLocalModel?.trim() || DEFAULT_MODELS.local;
    const nextModelCatalog = {
      ...DEFAULT_MODEL_CATALOG,
      ...(providersData.modelCatalog || {}),
      local: providersData.modelCatalog?.local?.length ? providersData.modelCatalog.local : [nextLocalModel],
    };
    setAvailableProviders(nextProviders);
    setDefaultLocalModel(nextLocalModel);
    setModelCatalog(nextModelCatalog);
    const nextTelegramProvider = settingsData.telegramProvider || 'auto';
    setTelegramProvider(nextTelegramProvider);
    setTelegramModel(
      nextTelegramProvider !== 'auto'
        ? (getSelectableModels(nextTelegramProvider, settingsData.telegramModel || '', true, nextModelCatalog).includes(settingsData.telegramModel || '')
          ? (settingsData.telegramModel || '')
          : '')
        : '',
    );
    setKeyInputs({
      anthropic: keyRows.find(item => item.provider === 'anthropic')?.key || '',
      google: keyRows.find(item => item.provider === 'google')?.key || '',
      openai: keyRows.find(item => item.provider === 'openai')?.key || '',
    });

    if (nextProviders.length === 1 && nextProviders[0] === 'local') {
      setProvider('local');
      setModel(nextLocalModel);
      return;
    }

    if (provider !== 'auto' && nextProviders.includes(provider)) {
      setModel(currentModel => getPreferredSelectableModel(provider, prompt, currentModel, nextModelCatalog));
    }

    if (provider !== 'auto' && !nextProviders.includes(provider)) {
      setProvider('auto');
      setModel('');
    }
  }

  async function refreshTelegramStatus() {
    setLoadingTelegramStatus(true);
    try {
      const status = await apiGet<TelegramStatusResponse>('/api/settings/telegram-status');
      setTelegramStatus(status);
    } catch (error) {
      setTelegramStatus({
        configured: false,
        enabled: false,
        running: false,
        username: null,
        error: error instanceof Error ? error.message : 'Failed to fetch Telegram status',
      });
    } finally {
      setLoadingTelegramStatus(false);
    }
  }

  async function handleLocalLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError('');

    try {
      const response = await fetch('/api/auth/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, displayName: loginName }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('botty.authToken', data.token);
      localStorage.setItem('botty.user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      setLoginEmail('');
      setLoginName('');
      setNotice('Signed in locally.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login failed');
    }
  }

  function handleLogout() {
    localStorage.removeItem('botty.authToken');
    localStorage.removeItem('botty.user');
    setToken('');
    setUser(null);
    setMessages([]);
    setConversationId(null);
    setHistory([]);
    setAvailableProviders([]);
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if ((!text && pendingAttachments.length === 0) || isSending) {
      return;
    }

    const displayPrompt = text || `Attached ${pendingAttachments.length} file${pendingAttachments.length === 1 ? '' : 's'}`;
    const nextMessages = [...messages, { role: 'user' as const, content: displayPrompt }];
    setMessages(nextMessages);
    setPrompt('');
    setChatError('');
    setIsSending(true);

    try {
      const response = await apiSend<{
        text: string;
        tokensUsed: number;
        model: string;
        provider: string;
        conversationId: string;
      }>('/api/chat', 'POST', {
        prompt: text,
        provider,
        model: provider === 'auto' ? undefined : model,
        conversationId,
        messages: messages.slice(-10),
        attachments: pendingAttachments.map(item => ({
          name: item.name,
          content: item.content,
          type: item.type,
        })),
        activeBot: activeBotPreset
          ? {
              id: activeBotPreset.id,
              provider: activeBotPreset.provider || '',
              model: activeBotPreset.model || '',
              memoryMode: activeBotPreset.memoryMode || 'shared',
            }
          : null,
      });

      setConversationId(response.conversationId);
      setPendingAttachments([]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.text,
        model: response.model,
        provider: response.provider,
        tokensUsed: response.tokensUsed,
      }]);
      setDailyTokens(prev => prev + response.tokensUsed);
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chat request failed';
      setChatError(message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  }

  async function addChatFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    const nextAttachments: PendingAttachment[] = [];

    for (const file of files) {
      if (!isReadableTextFile(file) && !isPdfFile(file) && !isImageFile(file)) {
        setNotice(`Skipping ${file.name}: supported chat files are text, PDF, and images.`);
        continue;
      }

      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        setNotice(`Skipping ${file.name}: file is larger than 6 MB.`);
        continue;
      }

      if (isPdfFile(file)) {
        setNotice(`Extracting text from ${file.name}...`);
      } else if (isImageFile(file)) {
        setNotice(`Running OCR for ${file.name}...`);
      }

      let parsedAttachment: Awaited<ReturnType<typeof parseAttachmentFile>>;
      try {
        parsedAttachment = await parseAttachmentFile(file);
      } catch (error) {
        setNotice(`Skipping ${file.name}: ${error instanceof Error ? error.message : 'could not parse file'}.`);
        continue;
      }

      const content = parsedAttachment?.content.trim() || '';
      if (!parsedAttachment || !content) {
        setNotice(`Skipping ${file.name}: no readable text was found.`);
        continue;
      }

      nextAttachments.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        content: content.slice(0, MAX_CHAT_ATTACHMENT_CHARS),
        type: parsedAttachment.type,
        size: file.size,
        source: parsedAttachment.source,
      });
    }

    if (nextAttachments.length === 0) {
      return;
    }

    setPendingAttachments(current => {
      const combined = [...current];
      nextAttachments.forEach(item => {
        if (!combined.some(existing => existing.id === item.id)) {
          combined.push(item);
        }
      });
      return combined.slice(0, 6);
    });
    setNotice(`${nextAttachments.length} file${nextAttachments.length === 1 ? '' : 's'} attached to chat.`);
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments(current => current.filter(item => item.id !== id));
  }

  function toggleVoiceInput() {
    if (!supportsSpeechRecognition()) {
      setNotice('Voice input is not supported in this browser.');
      return;
    }

    if (isListening && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();

      if (transcript) {
        setPrompt(current => current.trim() ? `${current.trim()} ${transcript}` : transcript);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      speechRecognitionRef.current = null;
    };

    speechRecognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (prompt.startsWith('/')) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissSlashMode();
        return;
      }

      if (event.key === 'ArrowDown' && slashMenuItems.length > 0) {
        event.preventDefault();
        setSelectedSlashIndex(index => (index + 1) % slashMenuItems.length);
        return;
      }

      if (event.key === 'ArrowUp' && slashMenuItems.length > 0) {
        event.preventDefault();
        setSelectedSlashIndex(index => (index - 1 + slashMenuItems.length) % slashMenuItems.length);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        const item = slashMenuItems[selectedSlashIndex] || slashMenuItems[0];
        if (item) {
          event.preventDefault();
          void activateSlashItem(item);
          return;
        }
      }
    }

    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void sendPrompt();
  }

  function handleSystemPromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void saveSettings();
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setChatError('');
    setActiveTab('chat');
    setIsSidebarDrawerOpen(false);
  }

  function loadConversation(selectedConversationId: string | null | undefined) {
    if (!selectedConversationId) {
      return;
    }

    const conversationRows = history
      .filter(item => item.conversationId === selectedConversationId)
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

    const nextMessages: Message[] = [];
    conversationRows.forEach(item => {
      nextMessages.push({ role: 'user', content: item.prompt });
      nextMessages.push({ role: 'assistant', content: item.response, model: item.model, tokensUsed: item.tokensUsed || 0 });
    });

    setConversationId(selectedConversationId);
    setMessages(nextMessages);
    setActiveTab('chat');
  }

  function openTab(tab: TabValue) {
    setActiveTab(tab);
  }

  async function saveSystemPromptOnly(nextSystemPrompt: string) {
    await apiSend('/api/settings/user-settings', 'POST', { systemPrompt: nextSystemPrompt || null });
    setSystemPrompt(nextSystemPrompt);
    setActiveFunctionId(getFunctionPresetForPrompt(nextSystemPrompt, allFunctionPresets)?.id || '');
  }

  async function activateFunctionPreset(preset: FunctionPreset) {
    setApplyingFunctionId(preset.id);
    try {
      await saveSystemPromptOnly(preset.systemPrompt);
      setPrompt(currentPrompt => currentPrompt.trim() && !currentPrompt.trim().startsWith('/') ? currentPrompt : preset.starterPrompt);
      setActiveTab('chat');
      setNotice(`${preset.title} is active in chat.`);
    } finally {
      setApplyingFunctionId('');
    }
  }

  function dismissSlashMode() {
    if (!prompt.startsWith('/')) {
      return;
    }

    setPrompt(prompt.slice(1));
    setSelectedSlashIndex(0);
  }

  function rememberSlashItem(itemId: string) {
    setRecentSlashItemIds(currentIds => [itemId, ...currentIds.filter(value => value !== itemId)].slice(0, MAX_RECENT_SLASH_ITEMS));
  }

  async function toggleFullscreenMode() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        return;
      }

      await document.exitFullscreen();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to toggle fullscreen mode.');
    }
  }

  function toggleSidebarPreference() {
    setHasSidebarPreference(true);
    setIsSidebarExpanded(value => !value);
  }

  function closeMobileSidebar() {
    setIsSidebarDrawerOpen(false);
  }

  async function clearFunctionPreset() {
    setApplyingFunctionId('clear');
    try {
      await saveSystemPromptOnly('');
      setActiveTab('chat');
      setNotice('Function mode cleared.');
    } finally {
      setApplyingFunctionId('');
    }
  }

  async function executeSlashCommand(command: SlashCommand) {
    setPrompt('');

    if (command.command === 'new-chat') {
      startNewChat();
      setNotice('Started a new chat.');
      return;
    }

    if (command.command === 'clear-mode') {
      await clearFunctionPreset();
      return;
    }

    if (command.command === 'refresh') {
      await refreshAll();
      setNotice('App data refreshed.');
      return;
    }

    if (command.command === 'sandbox') {
      await toggleSandboxModeFromMenu();
      return;
    }

    const targetTab = TABS.find(tab => tab.value === command.command)?.value;
    if (targetTab) {
      openTab(targetTab);
      setNotice(`Opened ${command.title.replace(/^Open\s+/, '')}.`);
    }
  }

  async function activateSlashItem(item: SlashMenuItem) {
    rememberSlashItem(item.id);

    if (item.category === 'command') {
      await executeSlashCommand(item as SlashCommand);
      return;
    }

    if (item.preset) {
      await activateFunctionPreset(item.preset);
    }
  }

  const slashQuery = prompt.startsWith('/') ? prompt.slice(1).trim().toLowerCase() : '';
  const slashMenuItems = useMemo(() => {
    if (!prompt.startsWith('/')) {
      return [] as SlashMenuItem[];
    }

    const items: SlashMenuItem[] = [
      ...slashCommands,
      ...skillPresets.map(item => ({
          id: item.id,
          command: item.command,
          title: item.title,
          description: item.description,
          detail: item.useWhen || getPresetAutonomyLabel(item),
          badge: activeFunctionId === item.id ? 'Active' : item.builtIn ? 'Built-in' : 'Custom',
          keywords: [
            item.useWhen,
            item.boundaries,
            item.kind,
            item.provider || '',
            item.model || '',
            item.memoryMode || '',
          ].filter(Boolean),
          category: 'skill' as const,
          preset: item,
        })),
      ...botPresets.map(item => ({
        id: item.id,
        command: item.command,
        title: item.title,
        description: item.description,
        detail: item.useWhen || `${getPresetRoutingLabel(item)}. ${getPresetMemoryLabel(item)}`,
        badge: activeFunctionId === item.id ? 'Active' : item.builtIn ? 'Built-in bot' : 'Custom bot',
        keywords: [
          item.useWhen,
          item.boundaries,
          item.kind,
          item.provider || '',
          item.model || '',
          item.memoryMode || '',
          'bot',
          'specialist',
        ].filter(Boolean),
        category: 'bot' as const,
        preset: item,
      })),
    ];

    return items.filter(item => {
      if (!slashQuery) {
        return true;
      }

      return item.command.includes(slashQuery)
        || item.title.toLowerCase().includes(slashQuery)
        || item.description.toLowerCase().includes(slashQuery)
        || item.detail?.toLowerCase().includes(slashQuery)
        || item.keywords?.some(keyword => keyword.toLowerCase().includes(slashQuery));
    });
  }, [activeFunctionId, botPresets, botPresets.length, prompt, skillPresets, slashCommands, slashQuery]);
  const groupedSlashItems = useMemo(() => {
    const recentItems = !slashQuery
      ? recentSlashItemIds
          .map(itemId => slashMenuItems.find(item => item.id === itemId) || null)
          .filter((item): item is SlashMenuItem => Boolean(item))
      : [];
    const recentItemIds = new Set(recentItems.map(item => item.id));
    const nonRecentItems = slashMenuItems.filter(item => !recentItemIds.has(item.id));

    return {
      recent: recentItems,
      commands: nonRecentItems.filter(item => item.category === 'command'),
      skills: nonRecentItems.filter(item => item.category === 'skill'),
      bots: nonRecentItems.filter(item => item.category === 'bot'),
    };
  }, [recentSlashItemIds, slashMenuItems, slashQuery]);

  async function createCustomSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newSkillTitle.trim();
    const description = newSkillDescription.trim();
    const command = newSkillCommand.trim().toLowerCase();
    const useWhenValue = newSkillUseWhen.trim();
    const boundariesValue = newSkillBoundaries.trim();
    const systemPromptValue = newSkillSystemPrompt.trim();
    const starterPromptValue = newSkillStarterPrompt.trim();

    if (!title || !description || !command || !systemPromptValue || !starterPromptValue) {
      setNotice('Fill in all skill fields before saving.');
      return;
    }

    if (skillPresets.some(item => item.command.toLowerCase() === command)) {
      setNotice('That skill slash command already exists.');
      return;
    }

    setCreatingFunction('skill');
    try {
      await apiSend('/api/settings/functions', 'POST', {
        kind: 'skill',
        title,
        description,
        command,
        useWhen: useWhenValue || null,
        boundaries: boundariesValue || null,
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
      });
      setNewSkillTitle('');
      setNewSkillDescription('');
      setNewSkillCommand('');
      setNewSkillUseWhen('');
      setNewSkillBoundaries('');
      setNewSkillSystemPrompt('');
      setNewSkillStarterPrompt('');
      await refreshAll();
      setNotice('Custom skill added.');
    } finally {
      setCreatingFunction('');
    }
  }

  async function createCustomBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newBotTitle.trim();
    const description = newBotDescription.trim();
    const useWhenValue = newBotUseWhen.trim();
    const boundariesValue = newBotBoundaries.trim();
    const providerValue = newBotProvider.trim().toLowerCase();
    const modelValue = newBotModel.trim();
    const systemPromptValue = newBotSystemPrompt.trim();
    const starterPromptValue = newBotStarterPrompt.trim();

    if (!title || !description || !systemPromptValue || !starterPromptValue) {
      setNotice('Fill in all bot fields before saving.');
      return;
    }

    setCreatingFunction('agent');
    try {
      await apiSend('/api/settings/functions', 'POST', {
        kind: 'agent',
        title,
        description,
        command: title,
        useWhen: useWhenValue || null,
        boundaries: boundariesValue || null,
        provider: providerValue || null,
        model: modelValue || null,
        memoryMode: newBotMemoryMode,
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
      });
      setNewBotTitle('');
      setNewBotDescription('');
      setNewBotUseWhen('');
      setNewBotBoundaries('');
      setNewBotProvider('');
      setNewBotModel('');
      setNewBotMemoryMode('shared');
      setNewBotSystemPrompt('');
      setNewBotStarterPrompt('');
      await refreshAll();
      setNotice('Custom bot added.');
    } finally {
      setCreatingFunction('');
    }
  }

  async function activateSlashSkill(preset: FunctionPreset) {
    await activateFunctionPreset(preset);
  }

  async function deleteConversation(selectedConversationId: string | null | undefined) {
    if (!selectedConversationId) {
      return;
    }

    await apiSend(`/api/history/group/${selectedConversationId}`, 'DELETE');
    if (conversationId === selectedConversationId) {
      startNewChat();
    }
    await refreshAll();
  }

  async function addFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newFact.trim()) {
      return;
    }

    await apiSend('/api/memory/facts', 'POST', { content: newFact.trim() });
    setNewFact('');
    await refreshAll();
  }

  async function deleteFact(id: string) {
    await apiSend(`/api/memory/facts/${id}`, 'DELETE');
    await refreshAll();
  }

  async function addFactFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    for (const file of files) {
      if (!isReadableTextFile(file) && !isPdfFile(file) && !isImageFile(file)) {
        setNotice(`Skipping ${file.name}: supported fact files are text, PDF, and images.`);
        continue;
      }

      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        setNotice(`Skipping ${file.name}: files must be under ${formatAttachmentSize(MAX_CHAT_ATTACHMENT_BYTES)}.`);
        continue;
      }

      if (isPdfFile(file)) {
        setNotice(`Extracting text from ${file.name}...`);
      } else if (isImageFile(file)) {
        setNotice(`Running OCR for ${file.name}...`);
      }

      const parsed = await parseAttachmentFile(file);
      if (!parsed?.content) {
        setNotice(`Skipping ${file.name}: no usable text found.`);
        continue;
      }

      await apiSend('/api/memory/files', 'POST', {
        name: file.name,
        content: parsed.content.slice(0, MAX_CHAT_ATTACHMENT_CHARS * 4),
        type: parsed.type,
      });
    }

    if (factFileInputRef.current) {
      factFileInputRef.current.value = '';
    }

    setNotice('Memory files added. They will be included in prompt context.');
    await refreshAll();
  }

  async function deleteMemoryFile(id: string) {
    await apiSend(`/api/memory/files/${id}`, 'DELETE');
    await refreshAll();
  }

  async function addUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newUrl.trim()) {
      return;
    }

    await apiSend('/api/memory/urls', 'POST', { url: newUrl.trim() });
    setNewUrl('');
    await refreshAll();
  }

  async function deleteUrl(id: string) {
    await apiSend(`/api/memory/urls/${id}`, 'DELETE');
    await refreshAll();
  }

  async function saveKey(providerName: string) {
    setSavingKey(providerName);
    try {
      const key = keyInputs[providerName]?.trim();
      if (!key) {
        await apiSend(`/api/keys/${providerName}`, 'DELETE');
      } else {
        await apiSend('/api/keys', 'POST', { provider: providerName, key });
      }
      await refreshAll();
      setNotice(`${providerName} key saved.`);
    } finally {
      setSavingKey('');
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const [settingsResult] = await Promise.all([
        apiSend<{ success: boolean; telegramError?: string | null }>('/api/settings', 'POST', {
          localUrl,
          useMemory,
          autoMemory,
          sandboxMode,
          telegramBotToken,
          telegramBotEnabled,
          telegramAllowedChatIds,
          telegramProvider,
          telegramModel,
        }),
        apiSend('/api/settings/user-settings', 'POST', { systemPrompt }),
      ]);
      await refreshAll();
      await refreshTelegramStatus();
      if (settingsResult?.telegramError) {
        setNotice(`Settings saved. Telegram error: ${settingsResult.telegramError}`);
      } else {
        setNotice(telegramBotEnabled && telegramBotToken.trim() ? 'Settings updated. Telegram bot reloaded.' : 'Settings updated.');
      }
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleSandboxModeFromMenu() {
    const nextSandboxMode = !sandboxMode;
    setSandboxMode(nextSandboxMode);
    setSavingSettings(true);

    try {
      const settingsResult = await apiSend<{ success: boolean; telegramError?: string | null }>('/api/settings', 'POST', {
        localUrl,
        useMemory,
        autoMemory,
        sandboxMode: nextSandboxMode,
        telegramBotToken,
        telegramBotEnabled,
        telegramAllowedChatIds,
        telegramProvider,
        telegramModel,
      });

      await refreshAll();

      if (activeTab === 'settings') {
        await refreshTelegramStatus();
      }

      if (settingsResult?.telegramError) {
        setNotice(`Sandbox ${nextSandboxMode ? 'enabled' : 'disabled'}. Telegram error: ${settingsResult.telegramError}`);
      } else {
        setNotice(`Sandbox ${nextSandboxMode ? 'enabled' : 'disabled'}.`);
      }
    } catch (error) {
      setSandboxMode(!nextSandboxMode);
      setNotice(error instanceof Error ? error.message : 'Failed to update sandbox mode.');
    } finally {
      setSavingSettings(false);
    }
  }

  async function exportMemoryBackup() {
    setIsExportingMemory(true);

    try {
      const response = await fetch('/api/memory/export', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const contentDisposition = response.headers.get('content-disposition');
      const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      anchor.href = url;
      anchor.download = fileNameMatch?.[1] || `botty-memory-backup-${new Date().toISOString()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setNotice('Memory backup downloaded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to download memory backup.');
    } finally {
      setIsExportingMemory(false);
    }
  }

  function resetMemoryRestoreSelection() {
    setPendingMemoryRestore(null);
    setMemoryRestorePreview(null);
    if (importMemoryInputRef.current) {
      importMemoryInputRef.current.value = '';
    }
  }

  async function prepareMemoryRestore(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as MemoryBackupPayload;
      const preview: MemoryRestorePreview = {
        fileName: file.name,
        exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : null,
        facts: Array.isArray(payload.memory?.facts) ? payload.memory?.facts.length : 0,
        files: Array.isArray(payload.memory?.files) ? payload.memory?.files.length : 0,
        urls: Array.isArray(payload.memory?.urls) ? payload.memory?.urls.length : 0,
        history: Array.isArray(payload.history) ? payload.history.length : 0,
        includesSettings: Boolean(payload.settings),
        includesSystemPrompt: Boolean(payload.userSettings),
      };

      setPendingMemoryRestore(payload);
      setMemoryRestorePreview(preview);
    } catch (error) {
      resetMemoryRestoreSelection();
      setNotice(error instanceof Error ? error.message : 'Failed to read memory backup.');
    }
  }

  async function importMemoryBackup() {
    if (!pendingMemoryRestore) {
      return;
    }

    setIsImportingMemory(true);

    try {
      const response = await fetch('/api/memory/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pendingMemoryRestore),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Restore failed: ${response.status}`);
      }

      await refreshAll();
      setNotice('Memory backup restored.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Failed to restore memory backup.');
    } finally {
      setIsImportingMemory(false);
      resetMemoryRestoreSelection();
    }
  }

  const conversations = useMemo(() => {
    const grouped = new Map<string, HistoryEntry[]>();

    history.forEach(item => {
      const key = item.conversationId || item.id;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries())
      .map(([id, items]) => ({
        id,
        items: items.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
      }))
      .sort((left, right) => new Date(right.items[0].timestamp).getTime() - new Date(left.items[0].timestamp).getTime());
  }, [history]);

  const sortedModelUsage = useMemo(
    () => [...dailyModelUsage].sort((left, right) => right.tokens - left.tokens || left.model.localeCompare(right.model)),
    [dailyModelUsage],
  );
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant') || null,
    [messages],
  );
  const currentRuntimeProvider = provider === 'auto' ? latestAssistantMessage?.provider || 'auto' : provider;
  const currentRuntimeModel = provider === 'auto'
    ? latestAssistantMessage?.model || 'auto-selected'
    : model || getSuggestedChatModel(provider, prompt);
  const currentRuntimeTokenUsage = provider === 'auto'
    ? formatTokenUsage(latestAssistantMessage?.tokensUsed, latestAssistantMessage?.provider, latestAssistantMessage?.model)
    : formatTokenUsage(latestAssistantMessage?.tokensUsed, currentRuntimeProvider, currentRuntimeModel);
  const trendPeak = useMemo(() => Math.max(...usageTrend.map(entry => entry.tokens), 1), [usageTrend]);
  const providerPeak = useMemo(() => Math.max(...dailyProviderUsage.map(entry => entry.tokens), 1), [dailyProviderUsage]);
  const modelPeak = useMemo(() => Math.max(...sortedModelUsage.map(entry => entry.tokens), 1), [sortedModelUsage]);

  const appBackgroundClass = isDarkMode
    ? 'min-h-dvh w-full overflow-x-hidden bg-[#101214] text-stone-100'
    : 'min-h-dvh w-full overflow-x-hidden bg-[#f3f0ea] text-stone-900';
  const workspaceShellClass = `grid min-h-dvh w-full gap-3 md:gap-4 ${isSidebarExpanded ? 'lg:grid-cols-[264px_minmax(0,1fr)]' : 'lg:grid-cols-[84px_minmax(0,1fr)]'} lg:gap-4 lg:transition-[grid-template-columns] lg:duration-200`;
  const sidebarPanelClass = isDarkMode
    ? `fixed inset-y-3 left-3 z-40 flex w-[280px] flex-col gap-3 rounded-[1.35rem] border border-white/6 bg-[#15171a] p-4 text-stone-100 shadow-[0_8px_18px_rgba(0,0,0,0.12)] transition-transform duration-200 ${isSidebarDrawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'} lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-auto lg:translate-x-0 lg:transition-[width,padding,transform] ${isSidebarExpanded ? 'lg:px-3.5 lg:py-3.5' : 'lg:px-2.5 lg:py-3.5'}`
    : `fixed inset-y-3 left-3 z-40 flex w-[280px] flex-col gap-3 rounded-[1.35rem] border border-stone-200 bg-[#f7f4ee] p-4 text-stone-900 shadow-[0_6px_16px_rgba(36,29,18,0.05)] transition-transform duration-200 ${isSidebarDrawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'} lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-auto lg:translate-x-0 lg:transition-[width,padding,transform] ${isSidebarExpanded ? 'lg:px-3.5 lg:py-3.5' : 'lg:px-2.5 lg:py-3.5'}`;
  const shellPanelClass = isDarkMode
    ? `w-full rounded-[1.5rem] bg-[#15181b] p-4 md:p-5 lg:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.22)] border border-white/8 ${isFullscreen ? 'min-h-dvh rounded-none border-x-0 border-y-0 p-3 sm:p-4 lg:min-h-[calc(100dvh-2rem)] lg:rounded-[1.5rem] lg:border lg:p-6' : ''}`
    : `w-full rounded-[1.5rem] bg-[#fcfbf8] p-4 md:p-5 lg:p-6 shadow-[0_18px_42px_rgba(36,29,18,0.08)] border border-stone-200 ${isFullscreen ? 'min-h-dvh rounded-none border-x-0 border-y-0 p-3 sm:p-4 lg:min-h-[calc(100dvh-2rem)] lg:rounded-[1.5rem] lg:border lg:p-6' : ''}`;
  const sectionCardClass = isDarkMode
    ? 'rounded-[1.25rem] border border-white/8 bg-[#111417] p-4'
    : 'rounded-[1.25rem] border border-stone-200 bg-white p-4';
  const elevatedCardClass = isDarkMode
    ? 'rounded-[1.15rem] border border-white/8 bg-[#1a1d20] px-3 py-3'
    : 'rounded-[1.15rem] bg-[#f7f4ee] border border-stone-200 px-3 py-3';
  const inputClass = isDarkMode
    ? 'rounded-[1rem] border border-white/10 px-3 py-2 bg-[#0f1113] text-stone-100 placeholder:text-stone-500 focus:border-stone-400 outline-none'
    : 'rounded-[1rem] border border-stone-200 px-3 py-2 bg-white focus:border-stone-400 outline-none';
  const textInputClass = isDarkMode
    ? 'w-full rounded-[1rem] border border-white/10 px-3 py-2 text-sm bg-[#0f1113] text-stone-100 placeholder:text-stone-500 focus:border-stone-400 outline-none'
    : 'w-full rounded-[1rem] border border-stone-200 px-3 py-2 text-sm bg-white focus:border-stone-400 outline-none';
  const textareaClass = isDarkMode
    ? 'w-full resize-none rounded-[1.1rem] border border-white/10 px-4 py-3 outline-none bg-[#0f1113] text-stone-100 placeholder:text-stone-500 focus:border-stone-400'
    : 'w-full resize-none rounded-[1.1rem] border border-stone-200 px-4 py-3 outline-none bg-white focus:border-stone-400';
  const subtleTextClass = isDarkMode ? 'text-stone-400' : 'text-stone-500';
  const mutedTextClass = isDarkMode ? 'text-stone-300' : 'text-stone-600';
  const sectionLabelClass = isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-600 mb-2';
  const navButtonClass = (tabValue: TabValue) => isDarkMode
    ? `w-full rounded-[0.95rem] px-3.5 py-2.5 flex items-center ${isSidebarExpanded ? 'justify-start' : 'justify-center'} gap-3 text-sm transition-colors ${activeTab === tabValue ? 'bg-white/8 text-stone-100' : 'text-stone-300 hover:bg-white/6'} ${isSidebarExpanded ? '' : 'px-2.5'}`
    : `w-full rounded-[0.95rem] px-3.5 py-2.5 flex items-center ${isSidebarExpanded ? 'justify-start' : 'justify-center'} gap-3 text-sm transition-colors ${activeTab === tabValue ? 'bg-stone-200 text-stone-900' : 'text-stone-700 hover:bg-stone-100'} ${isSidebarExpanded ? '' : 'px-2.5'}`;
  const sidebarPrimaryButtonClass = isDarkMode
    ? `rounded-[0.95rem] border border-white/10 bg-white/4 text-stone-100 px-3.5 py-2.5 font-medium flex items-center gap-2 hover:bg-white/8 transition-colors ${isSidebarExpanded ? 'justify-start' : 'justify-center'}`
    : `rounded-[0.95rem] border border-stone-200 bg-white/70 text-stone-900 px-3.5 py-2.5 font-medium flex items-center gap-2 hover:bg-white transition-colors ${isSidebarExpanded ? 'justify-start' : 'justify-center'}`;
  const primaryButtonClass = isDarkMode
    ? 'rounded-[1rem] bg-white text-stone-950 px-4 py-3 font-medium flex items-center justify-center gap-2 hover:bg-stone-200 transition-colors'
    : 'rounded-[1rem] bg-stone-900 text-white px-4 py-3 font-medium flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors';
  const shellUtilityButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-transparent px-4 py-3 text-left flex items-center gap-3 text-stone-300 hover:bg-white/6 transition-colors'
    : 'rounded-[1rem] border border-transparent px-4 py-3 text-left flex items-center gap-3 text-stone-700 hover:bg-stone-100 transition-colors';
  const sidebarTextClass = isSidebarExpanded ? 'inline' : 'hidden';
  const sidebarBlockClass = isSidebarExpanded ? 'block' : 'hidden';
  const sidebarStatsClass = isSidebarExpanded ? 'block' : 'hidden';
  const sidebarCompactButtonClass = `${shellUtilityButtonClass} ${isSidebarExpanded ? 'justify-start px-3.5 py-2.5' : 'justify-center px-2.5 py-2.5'}`;
  const telegramStatusToneClass = telegramStatus?.error
    ? (isDarkMode ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700')
    : telegramStatus?.running
      ? (isDarkMode ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
      : (isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-700');
  const telegramStatusLabel = loadingTelegramStatus
    ? 'Checking Telegram status...'
    : telegramStatus?.error
      ? 'Telegram reconnect pending'
      : telegramStatus?.running
        ? `Connected${telegramStatus.username ? ` as @${telegramStatus.username}` : ''}`
        : telegramStatus?.enabled === false
          ? 'Telegram disabled'
          : telegramStatus?.configured
            ? 'Token saved, waiting to connect'
            : 'No Telegram token saved';
  const telegramStatusDetails = loadingTelegramStatus
    ? 'Verifying the current Telegram bot state.'
    : telegramStatus?.error
      ? `Last Telegram error: ${telegramStatus.error}. Botty will keep retrying in the background.`
      : telegramStatus?.running
        ? 'Polling is active and the bot is ready to receive messages.'
        : telegramStatus?.enabled === false
          ? 'Enable Telegram bot polling and save settings to start the bot.'
          : telegramStatus?.configured
            ? 'The bot has a saved token but is not currently connected.'
            : 'Save a BotFather token to start Telegram polling.';
  const actionButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-white/10 px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/6 transition-colors'
    : 'rounded-[1rem] border border-stone-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-stone-100 transition-colors';
  const listButtonClass = isDarkMode
    ? 'w-full text-left rounded-[1rem] border border-white/8 bg-[#1a1d20] px-3 py-3 hover:border-white/20 transition-colors'
    : 'w-full text-left rounded-[1rem] border border-stone-200 bg-white px-3 py-3 hover:border-stone-300 transition-colors';
  const secondaryButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-white/10 bg-[#1a1d20] px-3 py-2 text-sm hover:bg-[#202428] transition-colors'
    : 'rounded-[1rem] border border-stone-200 bg-white px-3 py-2 text-sm hover:bg-stone-100 transition-colors';
  const destructiveButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:bg-red-950/60 transition-colors'
    : 'rounded-[1rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 transition-colors';
  const noticeClass = isDarkMode
    ? 'mb-4 rounded-[1rem] bg-emerald-950/40 border border-emerald-900 text-emerald-200 px-4 py-3 text-sm'
    : 'mb-4 rounded-[1rem] bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 text-sm';
  const emptyStateClass = isDarkMode ? 'text-center text-stone-400' : 'text-center text-stone-500';

  if (authLoading) {
    return <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center">Loading local workspace...</div>;
  }

  if (!user) {
    return (
      <div className={`${isDarkMode ? 'min-h-dvh bg-[#101214] text-stone-100' : 'min-h-dvh bg-[#f3f0ea] text-stone-900'} px-4 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-12`}>
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1500px] items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,460px)]">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className={`text-xs uppercase tracking-[0.35em] ${isDarkMode ? 'text-stone-400' : 'text-stone-500'} mb-0`}>Botty local runtime</p>
              <button onClick={() => setIsDarkMode(value => !value)} className={shellUtilityButtonClass}>
                {isDarkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {isDarkMode ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
            <h1 className="text-4xl md:text-5xl font-semibold leading-tight text-balance">Run Botty locally with a quieter, focused workspace.</h1>
            <p className={`mt-6 text-lg ${isDarkMode ? 'text-stone-300' : 'text-stone-700'} max-w-2xl leading-8`}>
              Local sign-in, PostgreSQL-backed memory, and direct Claude or local model calls. No Firebase path remains in the runtime you use here.
            </p>
            <div className={`mt-8 grid sm:grid-cols-3 gap-3 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
              <div className={`${elevatedCardClass}`}>Claude via `ANTHROPIC_API_KEY`</div>
              <div className={`${elevatedCardClass}`}>Postgres auto-bootstrapped on startup</div>
              <div className={`${elevatedCardClass}`}>JWT local auth for single-user development</div>
            </div>
          </div>

          <form onSubmit={handleLocalLogin} className={`${shellPanelClass} max-w-[460px] justify-self-end`}>
            <h2 className="text-2xl font-semibold mb-2">Local sign-in</h2>
            <p className={`${isDarkMode ? 'text-stone-400' : 'text-stone-600'} mb-6`}>Create or reuse a local identity stored in PostgreSQL.</p>

            <label className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Display name</label>
            <input
              value={loginName}
              onChange={event => setLoginName(event.target.value)}
              placeholder="Ofir"
              className={`${textInputClass} mb-4`}
            />

            <label className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Email</label>
            <input
              value={loginEmail}
              onChange={event => setLoginEmail(event.target.value)}
              type="email"
              placeholder="you@local.dev"
              className={textInputClass}
            />

            {authError ? <p className={`mt-4 text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{authError}</p> : null}

            <button type="submit" className={`mt-6 w-full ${primaryButtonClass}`}>
              Enter local workspace
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={appBackgroundClass}>
      <div className={`${isFullscreen ? 'min-h-dvh w-full p-0' : 'min-h-dvh w-full p-3 sm:p-4 lg:p-5'}`}>
        <div className={workspaceShellClass}>
          {isSidebarDrawerOpen ? (
            <button
              type="button"
              aria-label="Close menu overlay"
              className={`fixed inset-0 z-30 lg:hidden ${isDarkMode ? 'bg-black/55' : 'bg-stone-900/20'}`}
              onClick={closeMobileSidebar}
            />
          ) : null}

          <aside className={sidebarPanelClass}>
            <div className={`flex items-start gap-3 ${isSidebarExpanded ? 'justify-between' : 'justify-center'}`}>
              <div className={isSidebarExpanded ? '' : 'hidden'}>
                <p className={`text-sm font-bold uppercase tracking-[0.24em] ${isDarkMode ? 'text-stone-100' : 'text-stone-950'}`}>Botty</p>
              </div>

              <button
                type="button"
                onClick={closeMobileSidebar}
                className={`${shellUtilityButtonClass} shrink-0 px-3 lg:hidden`}
                aria-label="Close menu"
                title="Close menu"
              >
                <X className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleSidebarPreference}
                className={`${shellUtilityButtonClass} shrink-0 justify-center px-3`}
                aria-label={isSidebarExpanded ? 'Compact sidebar' : 'Expand sidebar'}
                title={isSidebarExpanded ? 'Compact sidebar' : 'Expand sidebar'}
              >
                {isSidebarExpanded ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
              </button>
            </div>

            <button onClick={startNewChat} className={`${sidebarPrimaryButtonClass} ${isSidebarExpanded ? '' : 'px-2.5'}`} title="New chat" aria-label="New chat">
              <Plus className="w-4 h-4" />
              <span className={sidebarTextClass}>New chat</span>
            </button>

            <nav className="space-y-1.5 text-sm">
              {TABS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => {
                    openTab(value);
                    closeMobileSidebar();
                  }}
                  className={navButtonClass(value)}
                  title={label}
                  aria-label={label}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span className={sidebarTextClass}>{label}</span>
                  </span>
                </button>
              ))}
            </nav>

            <button
              onClick={() => void toggleSandboxModeFromMenu()}
              disabled={savingSettings}
              className={`rounded-[0.95rem] border px-3.5 py-2.5 text-left flex items-center ${isSidebarExpanded ? 'justify-between' : 'justify-center'} gap-3 transition-colors disabled:opacity-60 ${sandboxMode ? (isDarkMode ? 'border-white/16 bg-white text-stone-950' : 'border-stone-900 bg-stone-900 text-white') : (isDarkMode ? 'border-white/10 text-stone-300 hover:bg-white/6' : 'border-stone-200 text-stone-700 hover:bg-stone-100')} ${isSidebarExpanded ? '' : 'px-2.5'}`}
              title={sandboxMode ? 'Sandbox mode is on' : 'Sandbox mode is off'}
              aria-label="Toggle sandbox mode"
            >
              <span className={`flex items-center gap-3 ${isSidebarExpanded ? '' : 'justify-center'}`}>
                <Square className="w-4 h-4" />
                <span className={sidebarBlockClass}>
                  <span className="block text-sm font-medium">Sandbox mode</span>
                  <span className="block text-xs opacity-75">{sandboxMode ? 'Facts and sites only' : 'Regular chat access'}</span>
                </span>
              </span>
              <span className={`rounded-full px-2 py-1 text-xs ${sandboxMode ? (isDarkMode ? 'bg-stone-950 text-white' : 'bg-white text-stone-900') : (isDarkMode ? 'bg-white/10 text-stone-200' : 'bg-stone-100 text-stone-700')}`}>
                {savingSettings ? 'Saving...' : sandboxMode ? 'On' : 'Off'}
              </span>
            </button>

            <button type="button" onClick={() => void toggleFullscreenMode()} className={sidebarCompactButtonClass} title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className={sidebarTextClass}>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
            </button>

            <button onClick={() => setIsDarkMode(value => !value)} className={sidebarCompactButtonClass} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDarkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className={sidebarTextClass}>{isDarkMode ? 'Light mode' : 'Dark mode'}</span>
            </button>

            <div className={`${sidebarStatsClass} mt-auto rounded-[0.95rem] border p-3.5 text-sm ${isDarkMode ? 'border-white/8 bg-[#111417] text-stone-300' : 'border-stone-200 bg-white text-stone-700'}`}>
              <p>Providers: {availableProviders.length ? availableProviders.join(', ') : 'none configured'}</p>
              <p className="mt-2">Tokens today: {dailyTokens.toLocaleString()}</p>
              {dailyModelUsage.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] opacity-60">By model</p>
                  {dailyModelUsage.map(entry => (
                    <div key={entry.key} className="flex items-start justify-between gap-3 text-xs">
                      <span className="pr-3 opacity-90">{[formatProviderLabel(entry.provider || undefined), entry.model].filter(Boolean).join(' · ')}</span>
                      <span className="whitespace-nowrap opacity-75">{entry.tokens.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-2">Stored keys: {apiKeys.length}</p>
            </div>

            <div className={`rounded-[0.95rem] px-3.5 py-2.5 ${isDarkMode ? 'bg-white/4 text-stone-200' : 'bg-white/70 text-stone-700'} ${isSidebarExpanded ? '' : 'hidden'}`}>
              <p className="text-sm font-medium leading-none">{user.displayName || user.email}</p>
              {user.displayName && user.email ? <p className={`mt-1 text-xs ${subtleTextClass}`}>{user.email}</p> : null}
            </div>

            <button onClick={handleLogout} className={sidebarCompactButtonClass} title="Sign out" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
              <span className={sidebarTextClass}>Sign out</span>
            </button>
          </aside>

          <main className={`${shellPanelClass} min-h-[calc(100dvh-1.5rem)] ${isFullscreen ? 'lg:min-h-[calc(100dvh-2rem)]' : ''}`}>
            <div className="mb-5 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsSidebarDrawerOpen(true)}
                  className={`${actionButtonClass} lg:hidden`}
                  aria-label="Open menu"
                  title="Open menu"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <div className="min-w-0">
                <h2 className="text-xl font-semibold capitalize sm:text-2xl">{activeTab}</h2>
                <p className={`text-sm ${subtleTextClass}`}>
                  {activeTab === 'chat' ? 'Send prompts through Claude or any configured local provider.' : null}
                  {activeTab === 'skills' ? 'Run Botty skills with slash commands or activate them from the menu.' : null}
                  {activeTab === 'bots' ? 'Launch specialized Botty bots for different kinds of tasks.' : null}
                  {activeTab === 'history' ? 'Reload or delete stored conversations.' : null}
                  {activeTab === 'memory' ? 'Manage facts and URLs that feed the prompt context.' : null}
                  {activeTab === 'settings' ? 'Save keys and runtime preferences used by the local server.' : null}
                </p>
                </div>
              </div>

              <button onClick={() => void refreshAll()} className={`${actionButtonClass} w-full justify-center md:w-auto`}>
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {notice ? <div className={noticeClass}>{notice}</div> : null}

            {activeTab === 'chat' ? (
              <div className={`grid gap-3 sm:gap-4 ${isFullscreen ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
                <section className={`${sectionCardClass} flex min-h-[62vh] flex-col sm:min-h-[70vh] ${isFullscreen ? 'lg:min-h-[calc(100dvh-11rem)]' : ''}`}>
                  <div className={`items-center justify-between gap-3 pb-3 xl:hidden ${isFullscreen ? 'hidden' : 'flex'}`}>
                    <div>
                      <h3 className="text-sm font-medium">Chat tools</h3>
                      <p className={`mt-1 text-xs ${subtleTextClass}`}>Toggle runtime details and recent conversations.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsChatSidebarOpen(value => !value)}
                      className={secondaryButtonClass}
                      aria-expanded={isChatSidebarOpen}
                      aria-label={isChatSidebarOpen ? 'Hide chat tools' : 'Show chat tools'}
                    >
                      {isChatSidebarOpen ? 'Hide tools' : 'Show tools'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto space-y-3 pr-1 sm:space-y-4 sm:pr-2">
                    {messages.length === 0 ? (
                      <div className={`h-full min-h-[360px] flex items-center justify-center ${emptyStateClass}`}>
                        <div className="max-w-md text-center">
                          <Bot className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-stone-500' : 'text-stone-400'}`} />
                          <p className={`text-lg ${isDarkMode ? 'text-stone-200' : 'text-stone-700'}`}>Start a local conversation.</p>
                          <p className="text-sm mt-2 max-w-md">Choose a provider, type naturally, or use slash to jump modes without leaving the composer.</p>
                        </div>
                      </div>
                    ) : null}

                    {messages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`rounded-[1.1rem] px-3 py-3 sm:px-4 sm:py-4 ${message.role === 'user' ? (isDarkMode ? 'bg-white text-stone-950 ml-auto max-w-[94%] sm:max-w-[82%]' : 'bg-stone-900 text-white ml-auto max-w-[94%] sm:max-w-[82%]') : isDarkMode ? 'bg-[#1a1d20] border border-white/8 max-w-full sm:max-w-[92%]' : 'bg-[#f7f4ee] border border-stone-200 max-w-full sm:max-w-[92%]'}`}>
                        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">
                          {message.role === 'user'
                            ? 'You'
                            : [formatProviderLabel(message.provider), message.model].filter(Boolean).join(' · ') || message.model || 'Assistant'}
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] leading-6 sm:leading-7">{message.content}</div>
                        {message.role === 'assistant' && formatTokenUsage(message.tokensUsed, message.provider, message.model) ? (
                          <div className={`mt-3 text-xs ${subtleTextClass}`}>{formatTokenUsage(message.tokensUsed, message.provider, message.model)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  {chatError ? <div className="mt-4 rounded-[1rem] bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{chatError}</div> : null}

                  <div ref={composerDropRef} className={`relative mt-4 rounded-[1.25rem] p-2.5 sm:p-3 transition-colors ${isDarkMode ? 'border border-white/8 bg-[#111417]' : 'border border-stone-200 bg-[#faf8f3]'} ${isDragOverComposer ? (isDarkMode ? 'ring-2 ring-white/30 bg-[#1b2024]' : 'ring-2 ring-stone-400/60 bg-white') : ''}`}>
                    {isDragOverComposer ? (
                      <div className={`pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[1.1rem] border-2 border-dashed ${isDarkMode ? 'border-white/25 bg-[#111417]/92 text-stone-100' : 'border-stone-300 bg-white/92 text-stone-900'}`}>
                        <div className="text-center">
                          <Upload className="mx-auto h-8 w-8" />
                          <p className="mt-3 text-base font-medium">Drop files to attach</p>
                          <p className="mt-1 text-sm opacity-75">Text, PDF, and image files are supported.</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,180px)_1fr]">
                      <select
                        value={provider}
                        onChange={event => {
                          const nextProvider = event.target.value;
                          setProvider(nextProvider);
                          if (nextProvider !== 'auto') {
                            setModel(getPreferredSelectableModel(nextProvider, prompt));
                          } else {
                            setModel('');
                          }
                        }}
                        className={inputClass}
                      >
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <select
                        value={model}
                        onChange={event => setModel(event.target.value)}
                        disabled={provider === 'auto'}
                        className={`${inputClass} ${isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400'}`}
                      >
                        {provider === 'auto' ? <option value="">Chosen automatically</option> : null}
                        {provider !== 'auto' ? getSelectableModels(provider, model).map(option => (
                          <option key={option} value={option}>{formatModelOptionLabel(option, provider)}</option>
                        )) : null}
                      </select>
                    </div>

                    <textarea
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      rows={4}
                      placeholder="Ask Claude to debug, design, or write code... Use /development for skills or /new-chat for commands"
                      className={textareaClass}
                    />

                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept="text/*,.txt,.md,.markdown,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yml,.yaml,.py,.java,.c,.cpp,.rs,.go,.sh,.sql,.log,.pdf,image/*"
                      onChange={event => void addChatFiles(event.target.files)}
                      className="hidden"
                    />

                    {pendingAttachments.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {pendingAttachments.map(item => (
                          <div key={item.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs ${isDarkMode ? 'bg-white/10 text-stone-200 border border-white/10' : 'bg-stone-100 text-stone-700 border border-stone-200'}`}>
                            <span>{item.name}</span>
                            <span className="opacity-70 uppercase">{item.source}</span>
                            <span className="opacity-70">{formatAttachmentSize(item.size)}</span>
                            <button type="button" onClick={() => removePendingAttachment(item.id)} className="opacity-80 hover:opacity-100">×</button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {prompt.startsWith('/') ? (
                      <div className={`mt-3 rounded-[1rem] border ${isDarkMode ? 'border-white/8 bg-[#1a1d20]' : 'border-stone-200 bg-white'} p-2`}>
                        <div className="flex items-center justify-between gap-3 px-2 pb-2">
                          <div className={`text-xs ${subtleTextClass}`}>Slash autocomplete</div>
                          <div className={`text-[11px] ${subtleTextClass}`}>Arrow keys to move, Enter to apply, Esc to keep text</div>
                        </div>
                        <div className="space-y-3">
                          {slashMenuItems.length > 0 ? (
                            <>
                              {groupedSlashItems.recent.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Recent</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.recent.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.commands.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Commands</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.commands.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.skills.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Skills</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.skills.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              {groupedSlashItems.bots.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Bots</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.bots.map(item => {
                                      const index = slashMenuItems.findIndex(candidate => candidate.id === item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() => void activateSlashItem(item)}
                                          className={`w-full rounded-xl px-3 py-2 text-left ${getSlashItemPanelClass(index === selectedSlashIndex)}`}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <div className="text-sm font-medium">/{item.command}</div>
                                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                                              {item.detail ? <div className={`text-[11px] mt-2 ${subtleTextClass}`}>{item.detail}</div> : null}
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                              <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
                                              <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className={`px-3 py-2 text-sm ${subtleTextClass}`}>No matching commands, skills, or bots.</div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className={`text-xs ${subtleTextClass}`}>Auth: local JWT. Memory: {useMemory ? 'enabled' : 'disabled'}. Sandbox: {sandboxMode ? 'on' : 'off'}. {activeFunctionId ? `Mode: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'Custom'}` : 'Mode: default chat'}. Drag files into this panel to attach them.</p>
                      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                        <button type="button" onClick={() => attachmentInputRef.current?.click()} className={secondaryButtonClass}>
                          <Upload className="w-4 h-4" />
                          Add files
                        </button>
                        <button type="button" onClick={toggleVoiceInput} className={secondaryButtonClass}>
                          {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          {isListening ? 'Stop voice' : 'Voice'}
                        </button>
                        <button onClick={() => void sendPrompt()} disabled={isSending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white disabled:opacity-60 sm:w-auto">
                          <Send className="w-4 h-4" />
                          {isSending ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className={`${isChatSidebarOpen || isFullscreen ? 'space-y-4' : 'hidden'} ${isFullscreen ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-2' : ''} xl:block`}>
                  <div className={sectionCardClass}>
                    <h3 className="font-medium">Current runtime</h3>
                    <ul className={`mt-3 text-sm ${mutedTextClass} space-y-2`}>
                      <li>Primary provider: {currentRuntimeProvider}</li>
                      <li>Model: {formatModelDisplay(currentRuntimeModel, currentRuntimeProvider)}</li>
                      <li>{currentRuntimeTokenUsage || `Estimated token window: ${getEstimatedModelTokenLimit(currentRuntimeProvider, currentRuntimeModel)?.toLocaleString() || 'unknown'}`}</li>
                      <li>Available providers: {availableProviders.length ? availableProviders.join(', ') : 'none'}</li>
                    </ul>
                  </div>

                  <div className={sectionCardClass}>
                    <h3 className="font-medium">Recent conversations</h3>
                    <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
                      {conversations.slice(0, 8).map(item => (
                        <button key={item.id} onClick={() => loadConversation(item.id)} className={listButtonClass}>
                          <div className="text-sm font-medium line-clamp-2">{item.items[0].prompt}</div>
                          <div className={`mt-2 text-xs ${subtleTextClass}`}>{formatTokenUsage(item.items[0].tokensUsed, undefined, item.items[0].model) || 'Tokens: unknown'}</div>
                          <div className={`text-xs ${subtleTextClass} mt-2`}>{new Date(item.items[0].timestamp).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'skills' ? (
              <div className="space-y-4">
                <section className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Skills</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Skills are best-practice overlays: reusable, narrow capabilities that keep the current chat&apos;s provider, memory, and session context.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-sm ${mutedTextClass}`}>{activeFunctionId ? `Active: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'Custom mode'}` : 'Active: default chat'}</div>
                    <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                      {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                    </button>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">What a skill is</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>A reusable instruction overlay for a focused job like debugging, drafting, analysis, or formatting.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Best when</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>You want a quick capability boost inside the same conversation, not a specialist that owns the whole workflow.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Expected attributes</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>Slash-triggered, low autonomy, inherits chat routing, and uses the current memory setup.</p>
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="w-4 h-4" />
                    <h3 className="font-medium">Create skill</h3>
                  </div>
                  <form onSubmit={createCustomSkill} className="grid gap-3 md:grid-cols-2">
                    <input value={newSkillTitle} onChange={event => setNewSkillTitle(event.target.value)} placeholder="Skill title, e.g. Architecture Critic" className={textInputClass} />
                    <input value={newSkillCommand} onChange={event => setNewSkillCommand(event.target.value)} placeholder="Slash command, e.g. architecture" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newSkillDescription} onChange={event => setNewSkillDescription(event.target.value)} placeholder="Capability summary, e.g. critiques designs and tradeoffs" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <input value={newSkillUseWhen} onChange={event => setNewSkillUseWhen(event.target.value)} placeholder="Use when, e.g. you need a quick architecture review inside the current thread" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillBoundaries} onChange={event => setNewSkillBoundaries(event.target.value)} rows={2} placeholder="Operating bounds, e.g. keeps the current provider and memory, and should not take over the whole session" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillSystemPrompt} onChange={event => setNewSkillSystemPrompt(event.target.value)} rows={4} placeholder="System prompt: define the expertise, decision rules, and tone for this focused capability" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillStarterPrompt} onChange={event => setNewSkillStarterPrompt(event.target.value)} rows={3} placeholder="Starter prompt, e.g. Review this design and point out the main risks" className={textareaClass} />
                    </div>
                    <div>
                      <button type="submit" disabled={creatingFunction === 'skill'} className="rounded-2xl bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-60">
                        {creatingFunction === 'skill' ? 'Adding...' : 'Add skill'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4" />
                    <h3 className="font-medium">Available slash skills</h3>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {skillPresets.map(item => {
                      const isActive = activeFunctionId === item.id;

                      return (
                        <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{item.title}</div>
                              <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                            </div>
                            <div className={`rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                              {isActive ? 'Active' : item.builtIn ? `/${item.command}` : `Custom /${item.command}`}
                            </div>
                          </div>

                          <div className={`text-xs ${subtleTextClass}`}>Slash command: /{item.command}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Use when: {item.useWhen}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Operating bounds: {item.boundaries}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetActivationLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetAutonomyLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetRoutingLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetMemoryLabel(item)}</div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => void activateFunctionPreset(item)}
                              disabled={applyingFunctionId === item.id}
                              className="rounded-2xl bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-60"
                            >
                              {applyingFunctionId === item.id ? 'Applying...' : 'Use skill'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'bots' ? (
              <div className="space-y-4">
                <section className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Bots</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Bots are best-practice specialists: they can own a longer task, optionally use their own routing, and choose how memory should behave across the session.</p>
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>{activeFunctionId ? `Active bot: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'none'}` : 'No active bot'}</div>
                </section>

                <section className={sectionCardClass}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">What a bot is</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>A persistent specialist that owns a multi-turn workflow such as building, reviewing, operating, or researching.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Best when</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>You want Botty to stay in a stable specialist role, potentially with its own provider, model, and memory policy.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Expected attributes</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>Higher autonomy, explicit task ownership, optional routing override, and configurable shared, isolated, or no memory.</p>
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="w-4 h-4" />
                    <h3 className="font-medium">Create bot</h3>
                  </div>
                  <form onSubmit={createCustomBot} className="grid gap-3 md:grid-cols-2">
                    <input value={newBotTitle} onChange={event => setNewBotTitle(event.target.value)} placeholder="Bot title, e.g. Security Reviewer" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newBotDescription} onChange={event => setNewBotDescription(event.target.value)} placeholder="Specialist summary, e.g. reviews code and architecture for security risk" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <input value={newBotUseWhen} onChange={event => setNewBotUseWhen(event.target.value)} placeholder="Use when, e.g. you want a dedicated security specialist to own the session" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotBoundaries} onChange={event => setNewBotBoundaries(event.target.value)} rows={2} placeholder="Operating bounds, e.g. should stay in review mode and avoid drifting into implementation without being asked" className={textareaClass} />
                    </div>
                    <select value={newBotProvider} onChange={event => {
                      const nextProvider = event.target.value;
                      setNewBotProvider(nextProvider);
                      setNewBotModel(nextProvider && nextProvider !== 'auto' ? getPreferredSelectableModel(nextProvider, newBotStarterPrompt) : '');
                    }} className={textInputClass}>
                      <option value="">Inherit chat provider</option>
                      {PROVIDERS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <select value={newBotMemoryMode} onChange={event => setNewBotMemoryMode(event.target.value as 'shared' | 'isolated' | 'none')} className={textInputClass}>
                      <option value="shared">Shared memory</option>
                      <option value="isolated">Isolated bot memory</option>
                      <option value="none">No memory</option>
                    </select>
                    <div className="md:col-span-2">
                      <select value={newBotModel} onChange={event => setNewBotModel(event.target.value)} disabled={!newBotProvider || newBotProvider === 'auto'} className={textInputClass}>
                        {(!newBotProvider || newBotProvider === 'auto') ? <option value="">Inherit provider default</option> : null}
                        {newBotProvider && newBotProvider !== 'auto' ? getSelectableModels(newBotProvider, newBotModel, true).map(option => (
                          <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, newBotProvider)}</option>
                        )) : null}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotSystemPrompt} onChange={event => setNewBotSystemPrompt(event.target.value)} rows={4} placeholder="System prompt: define the specialist role, operating rules, and decision standards" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotStarterPrompt} onChange={event => setNewBotStarterPrompt(event.target.value)} rows={3} placeholder="Starter prompt, e.g. Review this feature end to end and prioritize the biggest risks" className={textareaClass} />
                    </div>
                    <div>
                      <button type="submit" disabled={creatingFunction === 'agent'} className="rounded-2xl bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-60">
                        {creatingFunction === 'agent' ? 'Adding...' : 'Add bot'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className={sectionCardClass}>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {botPresets.map(item => {
                      const isActive = activeFunctionId === item.id;

                      return (
                        <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{item.title}</div>
                              <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                            </div>
                            <div className={`rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                              {isActive ? 'Active' : item.builtIn ? 'Bot' : 'Custom bot'}
                            </div>
                          </div>

                          <div className={`text-xs ${subtleTextClass}`}>Task focus: {item.starterPrompt}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Use when: {item.useWhen}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Operating bounds: {item.boundaries}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetActivationLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetAutonomyLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetRoutingLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetMemoryLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>
                            Provider: {item.provider ? (item.provider === 'auto' ? 'Auto route' : formatProviderLabel(item.provider)) : 'Inherit chat'}
                            {' · '}
                            Model: {item.model ? formatModelDisplay(item.model, item.provider || undefined) : 'Inherit chat'}
                            {' · '}
                            Memory: {item.memoryMode || 'shared'}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => void activateFunctionPreset(item)}
                              disabled={applyingFunctionId === item.id}
                              className="rounded-2xl bg-stone-900 text-white px-4 py-2 text-sm disabled:opacity-60"
                            >
                              {applyingFunctionId === item.id ? 'Starting...' : 'Start bot'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'history' ? (
              <div className="space-y-3">
                <section className={sectionCardClass}>
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="font-medium">Usage overview</h3>
                      <p className={`mt-1 text-sm ${subtleTextClass}`}>Track today&apos;s token usage by provider and model, plus the last 7 days of activity.</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className={elevatedCardClass}>
                        <div className={`text-xs uppercase tracking-[0.2em] ${subtleTextClass}`}>Tokens today</div>
                        <div className="mt-2 text-2xl font-semibold">{dailyTokens.toLocaleString()}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={`text-xs uppercase tracking-[0.2em] ${subtleTextClass}`}>Active providers</div>
                        <div className="mt-2 text-2xl font-semibold">{dailyProviderUsage.length}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={`text-xs uppercase tracking-[0.2em] ${subtleTextClass}`}>Active models</div>
                        <div className="mt-2 text-2xl font-semibold">{sortedModelUsage.length}</div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1fr]">
                      <div className={elevatedCardClass}>
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-medium">7-day trend</h4>
                          <span className={`text-xs ${subtleTextClass}`}>{usageTrend.length} day{usageTrend.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="mt-4 flex h-44 items-end gap-2">
                          {usageTrend.length > 0 ? usageTrend.map(entry => {
                            const height = Math.max((entry.tokens / trendPeak) * 100, entry.tokens > 0 ? 10 : 4);
                            return (
                              <div key={entry.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                <div className="text-[11px] leading-none opacity-70">{entry.tokens.toLocaleString()}</div>
                                <div className={`w-full rounded-t-2xl ${isDarkMode ? 'bg-amber-300/70' : 'bg-stone-900/75'}`} style={{ height: `${height}%` }} />
                                <div className={`text-[11px] ${subtleTextClass}`}>{entry.date.slice(5)}</div>
                              </div>
                            );
                          }) : <div className={`text-sm ${subtleTextClass}`}>No usage yet.</div>}
                        </div>
                      </div>

                      <div className={elevatedCardClass}>
                        <h4 className="text-sm font-medium">By provider</h4>
                        <div className="mt-4 space-y-3">
                          {dailyProviderUsage.length > 0 ? dailyProviderUsage.map(entry => (
                            <div key={entry.provider} className="space-y-1">
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <span>{formatProviderLabel(entry.provider)}</span>
                                <span className={subtleTextClass}>{entry.tokens.toLocaleString()}</span>
                              </div>
                              <div className={`h-2 rounded-full ${isDarkMode ? 'bg-white/8' : 'bg-stone-200'}`}>
                                <div
                                  className={`h-full rounded-full ${isDarkMode ? 'bg-emerald-300' : 'bg-stone-900'}`}
                                  style={{ width: `${Math.max((entry.tokens / providerPeak) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          )) : <div className={`text-sm ${subtleTextClass}`}>No provider usage recorded yet.</div>}
                        </div>
                      </div>

                      <div className={elevatedCardClass}>
                        <h4 className="text-sm font-medium">Top models</h4>
                        <div className="mt-4 space-y-3">
                          {sortedModelUsage.length > 0 ? sortedModelUsage.slice(0, 6).map(entry => (
                            <div key={entry.key} className="space-y-1">
                              <div className="flex items-start justify-between gap-3 text-sm">
                                <span className="pr-3">{[formatProviderLabel(entry.provider || undefined), entry.model].filter(Boolean).join(' · ')}</span>
                                <span className={subtleTextClass}>{entry.tokens.toLocaleString()}</span>
                              </div>
                              <div className={`h-2 rounded-full ${isDarkMode ? 'bg-white/8' : 'bg-stone-200'}`}>
                                <div
                                  className={`h-full rounded-full ${isDarkMode ? 'bg-amber-300' : 'bg-stone-900'}`}
                                  style={{ width: `${Math.max((entry.tokens / modelPeak) * 100, 8)}%` }}
                                />
                              </div>
                            </div>
                          )) : <div className={`text-sm ${subtleTextClass}`}>No model usage recorded yet.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                {conversations.map(item => (
                  <div key={item.id} className={`${sectionCardClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium line-clamp-2">{item.items[0].prompt}</div>
                      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${subtleTextClass}`}>
                        <span>{formatTokenUsage(item.items[0].tokensUsed, undefined, item.items[0].model) || 'Tokens: unknown'}</span>
                        <span>{new Date(item.items[0].timestamp).toLocaleString()}</span>
                        <span>{item.items.length} message pair{item.items.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start lg:self-center">
                      <button onClick={() => loadConversation(item.id)} className={secondaryButtonClass}>Open</button>
                      <button onClick={() => void deleteConversation(item.id)} className={destructiveButtonClass}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {conversations.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved history yet.</div> : null}
              </div>
            ) : null}

            {activeTab === 'memory' ? (
              <div className="space-y-4">
                <div className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Memory backup</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Download a backup or restore one to replace the current user's saved facts, URLs, settings, and recent history.</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <input
                      ref={importMemoryInputRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void prepareMemoryRestore(file);
                        }
                      }}
                    />
                    <button onClick={() => importMemoryInputRef.current?.click()} disabled={isImportingMemory} className={secondaryButtonClass}>
                      <Upload className="w-4 h-4" />
                      {isImportingMemory ? 'Restoring...' : 'Restore backup'}
                    </button>
                    <button onClick={() => void exportMemoryBackup()} disabled={isExportingMemory} className={primaryButtonClass}>
                      <Download className="w-4 h-4" />
                      {isExportingMemory ? 'Exporting...' : 'Backup memory now'}
                    </button>
                  </div>
                </div>

                {memoryRestorePreview ? (
                  <div className={`${sectionCardClass} space-y-4`}>
                    <div>
                      <h3 className="font-medium">Restore preview</h3>
                      <p className={`text-sm ${subtleTextClass} mt-1`}>Review this backup before restoring it. Confirming will replace the current signed-in user's saved backup data.</p>
                    </div>

                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>Facts</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.facts}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>Files</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.files}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>URLs</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.urls}</div>
                      </div>
                      <div className={elevatedCardClass}>
                        <div className={subtleTextClass}>History</div>
                        <div className="mt-1 text-xl font-semibold">{memoryRestorePreview.history}</div>
                      </div>
                    </div>

                    <div className={`grid gap-2 text-sm ${subtleTextClass} md:grid-cols-2`}>
                      <div>File: {memoryRestorePreview.fileName}</div>
                      <div>Exported at: {memoryRestorePreview.exportedAt ? new Date(memoryRestorePreview.exportedAt).toLocaleString() : 'unknown'}</div>
                      <div>Includes runtime settings: {memoryRestorePreview.includesSettings ? 'yes' : 'no'}</div>
                      <div>Includes system prompt: {memoryRestorePreview.includesSystemPrompt ? 'yes' : 'no'}</div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button onClick={() => void importMemoryBackup()} disabled={isImportingMemory} className={primaryButtonClass}>
                        <Upload className="w-4 h-4" />
                        {isImportingMemory ? 'Restoring...' : 'Confirm restore'}
                      </button>
                      <button onClick={resetMemoryRestoreSelection} disabled={isImportingMemory} className={secondaryButtonClass}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-3">
                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium">Facts</h3>
                      <span className={`text-xs ${subtleTextClass}`}>{facts.length} stored</span>
                    </div>
                    <form onSubmit={addFact} className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <input value={newFact} onChange={event => setNewFact(event.target.value)} placeholder="User prefers concise technical responses" className={`flex-1 ${inputClass}`} />
                      <button className={primaryButtonClass}>Add</button>
                    </form>
                    <div className="space-y-2">
                      {facts.map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div className="text-sm">{item.content}</div>
                          <button onClick={() => void deleteFact(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {facts.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved facts yet.</div> : null}
                    </div>
                  </section>

                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">Fact files</h3>
                        <p className={`mt-1 text-sm ${subtleTextClass}`}>Upload text, PDF, or image files. Botty extracts text and includes it alongside your saved facts.</p>
                      </div>
                      <span className={`text-xs ${subtleTextClass}`}>{memoryFiles.length} stored</span>
                    </div>
                    <input
                      ref={factFileInputRef}
                      type="file"
                      multiple
                      accept=".txt,.md,.csv,.json,.pdf,image/*,.log,.yaml,.yml,.xml"
                      className="hidden"
                      onChange={event => {
                        void addFactFiles(event.target.files);
                      }}
                    />
                    <button type="button" onClick={() => factFileInputRef.current?.click()} className={`mb-4 ${primaryButtonClass}`}>
                      Add files
                    </button>
                    <div className="space-y-2">
                      {memoryFiles.map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{item.name}</div>
                            <div className={`mt-1 text-xs ${subtleTextClass}`}>
                              {[item.type || 'text', typeof item.size === 'number' ? formatAttachmentSize(item.size) : null].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <button onClick={() => void deleteMemoryFile(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {memoryFiles.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved files yet.</div> : null}
                    </div>
                  </section>

                  <section className={sectionCardClass}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-medium">Saved URLs</h3>
                      <span className={`text-xs ${subtleTextClass}`}>{memoryUrls.length} stored</span>
                    </div>
                    <form onSubmit={addUrl} className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <input value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="https://docs.anthropic.com/" className={`flex-1 ${inputClass}`} />
                      <button className={primaryButtonClass}>Add</button>
                    </form>
                    <div className="space-y-2">
                      {memoryUrls.map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div>
                            <div className="text-sm font-medium">{item.title || item.url}</div>
                            <div className={`mt-1 text-xs ${subtleTextClass}`}>{item.url}</div>
                          </div>
                          <button onClick={() => void deleteUrl(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {memoryUrls.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved URLs yet.</div> : null}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {activeTab === 'settings' ? (
              <div className="space-y-4">
                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4" />
                    <h3 className="font-medium">Provider keys</h3>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    {['anthropic', 'google', 'openai'].map(providerName => (
                      <div key={providerName} className={elevatedCardClass}>
                        <div className="text-sm font-medium capitalize mb-2">{providerName}</div>
                        <input
                          value={keyInputs[providerName] || ''}
                          onChange={event => setKeyInputs(prev => ({ ...prev, [providerName]: event.target.value }))}
                          placeholder={`${providerName.toUpperCase()}_API_KEY`}
                          className={textInputClass}
                        />
                        <button onClick={() => void saveKey(providerName)} className={`mt-3 w-full ${primaryButtonClass} disabled:opacity-60`} disabled={savingKey === providerName}>
                          {savingKey === providerName ? 'Saving...' : 'Save key'}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={`${sectionCardClass} space-y-4`}>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    <h3 className="font-medium">Runtime settings</h3>
                  </div>

                  <div>
                    <label className={sectionLabelClass}>Local LLM URL</label>
                    <input value={localUrl} onChange={event => setLocalUrl(event.target.value)} className={textInputClass} />
                  </div>

                  <div>
                    <label className={sectionLabelClass}>System prompt</label>
                    <textarea value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} onKeyDown={handleSystemPromptKeyDown} rows={6} className={textareaClass} />
                  </div>

                  <div className={`grid gap-4 lg:grid-cols-2 ${elevatedCardClass}`}>
                    <div className="lg:col-span-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4" />
                        <h4 className="font-medium">Telegram bot</h4>
                      </div>
                      <p className={`text-sm ${subtleTextClass}`}>Save the bot token here and Botty will start or reload Telegram polling without editing environment files.</p>
                    </div>

                    <div className={`lg:col-span-2 rounded-[1rem] border px-4 py-3 ${telegramStatusToneClass}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{telegramStatusLabel}</div>
                          <div className="text-xs mt-1 opacity-90">{telegramStatusDetails}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshTelegramStatus()}
                          className={`inline-flex items-center gap-2 ${secondaryButtonClass}`}
                          disabled={loadingTelegramStatus}
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingTelegramStatus ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <label className={sectionLabelClass}>Bot token</label>
                      <input
                        type="password"
                        value={telegramBotToken}
                        onChange={event => setTelegramBotToken(event.target.value)}
                        placeholder="1234567890:AA..."
                        className={textInputClass}
                      />
                    </div>

                    <label className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                      <input type="checkbox" checked={telegramBotEnabled} onChange={event => setTelegramBotEnabled(event.target.checked)} />
                      Enable Telegram bot polling
                    </label>

                    <div>
                      <label className={sectionLabelClass}>Allowed chat IDs</label>
                      <input
                        value={telegramAllowedChatIds}
                        onChange={event => setTelegramAllowedChatIds(event.target.value)}
                        placeholder="123456789,987654321"
                        className={textInputClass}
                      />
                    </div>

                    <div>
                      <label className={sectionLabelClass}>Telegram provider</label>
                      <select value={telegramProvider} onChange={event => {
                        const nextProvider = event.target.value;
                        setTelegramProvider(nextProvider);
                        setTelegramModel(nextProvider && nextProvider !== 'auto' ? '' : '');
                      }} className={textInputClass}>
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={sectionLabelClass}>Telegram model override</label>
                      <select
                        value={telegramModel}
                        onChange={event => setTelegramModel(event.target.value)}
                        disabled={telegramProvider === 'auto'}
                        className={textInputClass}
                      >
                        {telegramProvider === 'auto' ? <option value="">Chosen automatically</option> : null}
                        {telegramProvider !== 'auto' ? getSelectableModels(telegramProvider, telegramModel, true).map(option => (
                          <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, telegramProvider)}</option>
                        )) : null}
                      </select>
                    </div>
                  </div>

                  <label className={`flex items-center gap-3 rounded-[1rem] ${elevatedCardClass} text-sm`}>
                    <input type="checkbox" checked={useMemory} onChange={event => setUseMemory(event.target.checked)} />
                    Include saved memory in prompt construction
                  </label>

                  <label className={`flex items-center gap-3 rounded-[1rem] ${elevatedCardClass} text-sm`}>
                    <input type="checkbox" checked={autoMemory} onChange={event => setAutoMemory(event.target.checked)} />
                    Learn durable facts about me automatically from successful chats
                  </label>

                  <button onClick={() => void saveSettings()} disabled={savingSettings} className={`${primaryButtonClass} disabled:opacity-60`}>
                    <Save className="w-4 h-4" />
                    {savingSettings ? 'Saving...' : 'Save settings'}
                  </button>
                </section>
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export default AppShell;

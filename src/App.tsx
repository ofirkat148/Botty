import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useReducer, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Copy,
  Download,
  GitBranch,
  History,
  KeyRound,
  Layers,
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
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Sparkles,
  Square,
  SunMedium,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AUTO_ROUTE_MODES,
  AUTO_ROUTE_OPTIONS,
  BUILT_IN_AGENTS,
  DEFAULT_MODEL_CATALOG,
  DEFAULT_MODELS,
  BUILT_IN_PRESETS,
  getFunctionPresetForPrompt,
  MODEL_LABELS,
  MODEL_TOKEN_LIMIT_RULES,
  normalizeSlashCommand,
  PROVIDERS,
  RESERVED_SLASH_COMMANDS,
  BUILT_IN_SKILLS,
  type FunctionPreset,
} from './config/chatConfig';
import { type AgentDefinition, type AgentExecutorType } from '../shared/agentDefinitions';
import { useChatReducer, type ChatMessage } from './hooks/useChatReducer';
import { useSkillFormReducer, useNewBotFormReducer, useBotEditorReducer, type ToolDefinition } from './hooks/useBotFormReducer';
import {
  formatAttachmentSize,
  isImageFile,
  isPdfFile,
  isSupportedAttachmentFile,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_CHARS,
  parseAttachmentFile,
  terminateOcrWorker,
} from './utils/chatAttachments';
const MAX_RECENT_SLASH_ITEMS = 4;

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
  routingMode?: string | null;
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
  isArchived?: boolean | null;
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
  hint: string;
};

type SettingsResponse = {
  localUrl: string | null;
  useMemory: boolean;
  autoMemory: boolean;
  sandboxMode: boolean;
  historyRetentionDays?: number | null;
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
  providerStatuses?: ProviderStatus[];
};

type ProviderStatus = {
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

type FunctionCatalogResponse = {
  skills: FunctionPreset[];
  agents: AgentDefinition[];
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
  category: 'command' | 'skill' | 'agent';
  preset?: FunctionPreset;
};

const TABS = [
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'skills', label: 'Skills', Icon: Sparkles },
  { value: 'agents', label: 'Agents', Icon: Bot },
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
  const [prompt, setPrompt] = useState(() => localStorage.getItem('botty.draftPrompt') || '');
  const [chatState, dispatchChat] = useChatReducer();
  const { messages, conversationId, isSending, chatError } = chatState;
  const setConversationId = (id: string | null) => dispatchChat({ type: 'LOAD_HISTORY', messages, conversationId: id ?? '' });
  const setMessages = (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    // Compatibility shim: allow callers to pass an array or an updater function.
    // Full callers have been migrated to dispatch actions; this covers any remaining
    // external setMessages usages that were not yet updated.
    dispatchChat({ type: 'LOAD_HISTORY', messages: typeof updater === 'function' ? updater(messages) : updater, conversationId: conversationId ?? '' });
  };
  const setIsSending = (value: boolean) => dispatchChat({ type: 'SET_SENDING', value });
  const setChatError = (msg: string) => msg ? dispatchChat({ type: 'SET_ERROR', message: msg }) : dispatchChat({ type: 'CLEAR_ERROR' });
  const [isListening, setIsListening] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [defaultLocalModel, setDefaultLocalModel] = useState(DEFAULT_MODELS.local);
  const [modelCatalog, setModelCatalog] = useState<Record<string, string[]>>(DEFAULT_MODEL_CATALOG);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [showArchivedHistory, setShowArchivedHistory] = useState(false);
  const [factsSearch, setFactsSearch] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [conversationLabels, setConversationLabels] = useState<Record<string, string>>({});
  const [pinnedConversations, setPinnedConversations] = useState<Set<string>>(new Set());
  const [conversationModels, setConversationModels] = useState<Record<string, { provider: string; model: string }>>({});
  const [editingLabelId, setEditingLabelId] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [memoryUrls, setMemoryUrls] = useState<MemoryUrl[]>([]);
  const [agentFactCounts, setAgentFactCounts] = useState<{ total: number; counts: Record<string, number> }>({ total: 0, counts: {} });
  const [customSkills, setCustomSkills] = useState<FunctionPreset[]>([]);
  const [customAgents, setCustomAgents] = useState<AgentDefinition[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [dailyTokens, setDailyTokens] = useState(0);
  const [dailyModelUsage, setDailyModelUsage] = useState<ModelUsageEntry[]>([]);
  const [dailyProviderUsage, setDailyProviderUsage] = useState<Array<{ provider: string; tokens: number }>>([]);
  const [usageTrend, setUsageTrend] = useState<Array<{ date: string; tokens: number }>>([]);
  const [usagePeriod, setUsagePeriod] = useState<7 | 30>(7);
  const usagePeriodRef = useRef<7 | 30>(7);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [localUrl, setLocalUrl] = useState('http://127.0.0.1:11435');
  const [useMemory, setUseMemory] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [historyRetentionDays, setHistoryRetentionDays] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotEnabled, setTelegramBotEnabled] = useState(true);
  const [telegramAllowedChatIds, setTelegramAllowedChatIds] = useState('');
  const [telegramProvider, setTelegramProvider] = useState('auto');
  const [telegramModel, setTelegramModel] = useState('');
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [loadingTelegramStatus, setLoadingTelegramStatus] = useState(false);
  const [sendingTelegramTest, setSendingTelegramTest] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activePresetId, setActivePresetId] = useState('');
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
  const [agentFacts, setAgentFacts] = useState<Record<string, Fact[]>>({});
  const [expandedAgentMemory, setExpandedAgentMemory] = useState<Record<string, boolean>>({});
  const factFileInputRef = useRef<HTMLInputElement | null>(null);
  const factImportRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const { state: newSkill, patch: patchNewSkill, reset: resetNewSkill } = useSkillFormReducer();
  const newSkillTitle = newSkill.title;
  const newSkillDescription = newSkill.description;
  const newSkillCommand = newSkill.command;
  const newSkillUseWhen = newSkill.useWhen;
  const newSkillBoundaries = newSkill.boundaries;
  const newSkillSystemPrompt = newSkill.systemPrompt;
  const newSkillStarterPrompt = newSkill.starterPrompt;

  const { state: newBot, patch: patchNewBot, reset: resetNewBot } = useNewBotFormReducer();
  const newBotTitle = newBot.title;
  const newBotDescription = newBot.description;
  const newBotCommand = newBot.command;
  const newBotUseWhen = newBot.useWhen;
  const newBotBoundaries = newBot.boundaries;
  const newBotProvider = newBot.provider;
  const newBotModel = newBot.model;
  const newBotMemoryMode = newBot.memoryMode;
  const newBotExecutorType = newBot.executorType;
  const newBotEndpoint = newBot.endpoint;
  const newBotSystemPrompt = newBot.systemPrompt;
  const newBotStarterPrompt = newBot.starterPrompt;
  const newBotTools = newBot.tools;
  const newBotMaxTurns = newBot.maxTurns;

  const { state: editingBot, patch: patchEditingBot, reset: resetEditingBot, load: loadEditingBot } = useBotEditorReducer();
  const editingBotId = editingBot.id;
  const editingBotTitle = editingBot.title;
  const editingBotDescription = editingBot.description;
  const editingBotCommand = editingBot.command;
  const editingBotUseWhen = editingBot.useWhen;
  const editingBotBoundaries = editingBot.boundaries;
  const editingBotProvider = editingBot.provider;
  const editingBotModel = editingBot.model;
  const editingBotMemoryMode = editingBot.memoryMode;
  const editingBotExecutorType = editingBot.executorType;
  const editingBotEndpoint = editingBot.endpoint;
  const editingBotSystemPrompt = editingBot.systemPrompt;
  const editingBotStarterPrompt = editingBot.starterPrompt;
  const editingBotTools = editingBot.tools;
  const editingBotMaxTurns = editingBot.maxTurns;
  const [savingBotId, setSavingBotId] = useState('');
  const [deletingBotId, setDeletingBotId] = useState('');
  const [confirmingDeleteBotId, setConfirmingDeleteBotId] = useState('');
  const [confirmingClearHistory, setConfirmingClearHistory] = useState(false);
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
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const [pendingMemoryRestore, setPendingMemoryRestore] = useState<MemoryBackupPayload | null>(null);
  const [memoryRestorePreview, setMemoryRestorePreview] = useState<MemoryRestorePreview | null>(null);
  const [notice, setNotice] = useState('');
  const importMemoryInputRef = useRef<HTMLInputElement | null>(null);
  const importAgentInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const composerDropRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollLockedRef = useRef(false);
  const [showScrollResumeBtn, setShowScrollResumeBtn] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const allPresets = useMemo(() => [...BUILT_IN_PRESETS, ...customSkills, ...customAgents], [customSkills, customAgents]);
  const skillPresets = useMemo(() => [...BUILT_IN_SKILLS, ...customSkills], [customSkills]);
  const agentPresets = useMemo(() => [...BUILT_IN_AGENTS, ...customAgents], [customAgents]);
  const usedCommands = useMemo(() => new Set(allPresets.map(item => item.command.toLowerCase())), [allPresets]);
  const builtInAgents = useMemo(() => BUILT_IN_AGENTS, []);
  const customAgentsPresets = useMemo(() => customAgents, [customAgents]);
  const activePreset = useMemo(
    () => allPresets.find(item => item.id === activePresetId) || null,
    [activePresetId, allPresets],
  );
  const activePresetTitle = activePreset?.title || '';
  const activeTabLabel = TABS.find(tab => tab.value === activeTab)?.label || activeTab;
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
      description: activePresetTitle ? `Turn off ${activePresetTitle} and return to default chat mode.` : 'Stay in default chat mode with no active skill or agent overlay.',
      detail: activePresetTitle ? 'Useful when a specialized mode is changing the assistant behavior.' : 'No skill or agent is active right now.',
      badge: activePresetTitle ? 'Active mode' : 'Default',
      keywords: ['mode', 'skill', 'agent', 'default chat', 'reset mode'],
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
  const activeBotPreset = useMemo(() => activePreset?.kind === 'agent' ? activePreset as AgentDefinition : null, [activePreset]);

  const conversationTokenWarning = useMemo(() => {
    if (messages.length === 0) return null;
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.model);
    if (!lastAssistant?.model || !lastAssistant?.provider) return null;
    const limit = getEstimatedModelTokenLimit(lastAssistant.provider, lastAssistant.model);
    if (!limit) return null;
    const totalUsed = messages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);
    if (totalUsed === 0) return null;
    const pct = totalUsed / limit;
    if (pct >= 0.9) return { level: 'critical' as const, pct, totalUsed, limit };
    if (pct >= 0.75) return { level: 'warning' as const, pct, totalUsed, limit };
    return null;
  }, [messages]);

  const conversationStats = useMemo(() => {
    const nonCompact = messages.filter(m => !m.isCompact);
    if (nonCompact.length === 0) return null;
    const allText = nonCompact.map(m => m.content).join(' ');
    const words = allText.trim().split(/\s+/).filter(Boolean).length;
    const exchanges = nonCompact.filter(m => m.role === 'user').length;
    return { words, exchanges };
  }, [messages]);

  function getAgentExecutorType(agent: FunctionPreset | AgentDefinition): AgentExecutorType {
    return 'executorType' in agent && agent.executorType === 'remote-http' ? 'remote-http' : 'internal-llm';
  }

  function getAgentEndpoint(agent: FunctionPreset | AgentDefinition) {
    return 'endpoint' in agent && typeof agent.endpoint === 'string' ? agent.endpoint : '';
  }

  function getAgentExecutorLabel(agent: FunctionPreset | AgentDefinition) {
    return getAgentExecutorType(agent) === 'remote-http' ? 'Remote HTTP agent' : 'Internal Botty agent';
  }

  function formatProviderLabel(value?: string) {
    if (!value) {
      return '';
    }

    if (value === 'auto') {
      return 'Auto route';
    }

    if (value === 'fastest') {
      return 'Auto: Fastest';
    }

    if (value === 'cheapest') {
      return 'Auto: Cheapest';
    }

    if (value === 'best-quality') {
      return 'Auto: Best quality';
    }

    if (value === 'local-first') {
      return 'Auto: Local first';
    }

    if (value === 'openai') {
      return 'OpenAI';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatRoutingModeLabel(value?: string | null) {
    if (!value || value === 'auto') {
      return 'Smart default';
    }

    if (value === 'fastest') {
      return 'Fastest';
    }

    if (value === 'cheapest') {
      return 'Cheapest';
    }

    if (value === 'best-quality') {
      return 'Best quality';
    }

    if (value === 'local-first') {
      return 'Local first';
    }

    return formatProviderLabel(value || undefined);
  }

  function formatProviderSourceLabel(source: ProviderStatus['source']) {
    if (source === 'saved-key') {
      return 'Saved key';
    }

    if (source === 'environment') {
      return 'Environment';
    }

    if (source === 'runtime-url') {
      return 'Configured URL';
    }

    if (source === 'default-local') {
      return 'Default local';
    }

    return 'Not configured';
  }

  function getProviderStatusTone(readiness: ProviderStatus['readiness']) {
    if (readiness === 'ready') {
      return isDarkMode
        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800';
    }

    if (readiness === 'missing') {
      return isDarkMode
        ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
        : 'border-amber-200 bg-amber-50 text-amber-800';
    }

    return isDarkMode
      ? 'border-rose-400/20 bg-rose-500/10 text-rose-100'
      : 'border-rose-200 bg-rose-50 text-rose-800';
  }

  function formatProviderReadinessLabel(readiness: ProviderStatus['readiness']) {
    if (readiness === 'ready') {
      return 'Ready';
    }

    if (readiness === 'missing') {
      return 'Missing config';
    }

    return 'Unreachable';
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
      return providerValue && !AUTO_ROUTE_MODES.has(providerValue) ? 'Provider default' : 'Chosen automatically';
    }

    const known = MODEL_LABELS[modelValue];
    const label = known?.label || humanizeFallbackModelName(modelValue);
    const hint = known?.hint;

    return hint ? `${label} - ${hint}` : label;
  }

  function formatModelDisplay(modelValue?: string | null, providerValue?: string) {
    if (!modelValue) {
      return providerValue && !AUTO_ROUTE_MODES.has(providerValue) ? 'provider default' : 'auto-selected';
    }

    return formatModelOptionLabel(modelValue, providerValue);
  }

  function getPresetActivationLabel(preset: FunctionPreset) {
    return preset.kind === 'skill' ? 'Activation: slash command or quick menu apply' : 'Activation: dedicated agent session';
  }

  function getPresetAutonomyLabel(preset: FunctionPreset) {
    return preset.kind === 'skill' ? 'Autonomy: low, task-scoped overlay' : 'Autonomy: higher, specialist session owner';
  }

  function getPresetRoutingLabel(preset: FunctionPreset) {
    if (preset.kind === 'skill') {
      return 'Routing: inherits current chat provider and model';
    }

    if (!preset.provider || AUTO_ROUTE_MODES.has(preset.provider)) {
      return 'Routing: inherits current chat or auto route';
    }

    return `Routing: prefers ${formatProviderLabel(preset.provider)}${preset.model ? ` · ${preset.model}` : ''}`;
  }

  function getPresetMemoryLabel(preset: FunctionPreset) {
    if (preset.kind === 'skill') {
      return 'Memory: uses the current chat and memory settings';
    }

    if (preset.memoryMode === 'isolated') {
      return 'Memory: isolated agent memory';
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

    if (item.category === 'agent') {
      if (item.preset && activePresetId === item.preset.id) {
        return isDarkMode ? 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      }
      return isDarkMode ? 'bg-violet-500/15 text-violet-100 border border-violet-400/20' : 'bg-violet-50 text-violet-700 border border-violet-200';
    }

    // skill
    if (item.preset && activePresetId === item.preset.id) {
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

  function isAutoRouteProvider(value?: string | null) {
    return AUTO_ROUTE_MODES.has((value || '').trim().toLowerCase());
  }

  function getProviderSelectValue(value?: string | null) {
    return isAutoRouteProvider(value) ? 'auto' : (value || '');
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    window.localStorage.setItem('botty.theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Terminate the shared Tesseract OCR worker when the app unmounts
  useEffect(() => {
    return () => {
      terminateOcrWorker().catch(() => {});
    };
  }, []);

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
    if (prompt) {
      window.localStorage.setItem('botty.draftPrompt', prompt);
    } else {
      window.localStorage.removeItem('botty.draftPrompt');
    }
  }, [prompt]);

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
      // Sync CSS state with native fullscreen when it changes externally (e.g. user presses Esc).
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

      if ((event.ctrlKey || event.metaKey) && event.key === 'n' && !isEditableTarget) {
        event.preventDefault();
        startNewChat();
        setTimeout(() => composerTextareaRef.current?.focus(), 50);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === '/' && !isEditableTarget) {
        event.preventDefault();
        setActiveTab('chat');
        setTimeout(() => composerTextareaRef.current?.focus(), 50);
        return;
      }

      if (event.altKey && event.key === 'Enter' && !isEditableTarget) {
        event.preventDefault();
        toggleFullscreenMode();
      }

      // Ctrl+? or Ctrl+Shift+/ opens keyboard shortcut cheatsheet
      if ((event.ctrlKey || event.metaKey) && (event.key === '?' || (event.shiftKey && event.key === '/')) && !isEditableTarget) {
        event.preventDefault();
        setShowShortcuts(value => !value);
        return;
      }

      // Escape exits CSS fullscreen or closes shortcuts modal
      if (event.key === 'Escape' && !isEditableTarget) {
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (isFullscreen) setIsFullscreen(false);
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

  // Re-fetch history whenever the archived/active toggle changes
  useEffect(() => {
    if (!user) {
      return;
    }

    apiGet<HistoryEntry[]>(showArchivedHistory ? '/api/history?archived=true' : '/api/history')
      .then(rows => setHistory(rows))
      .catch(err => setNotice(err instanceof Error ? err.message : 'Failed to load history'));
  }, [showArchivedHistory]);

  useEffect(() => {
    if (!user || activeTab !== 'settings') {
      return;
    }

    void refreshTelegramStatus();
  }, [user, activeTab]);

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [prompt]);

  // Auto-scroll to bottom when messages grow, unless user scrolled up
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el || scrollLockedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Detect user scrolling up to lock auto-scroll
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      if (atBottom) {
        scrollLockedRef.current = false;
        setShowScrollResumeBtn(false);
      } else {
        scrollLockedRef.current = true;
        setShowScrollResumeBtn(true);
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  async function apiGet<T>(path: string) {
    const response = await fetch(path, { headers: authHeaders });
    if (response.status === 401) {
      handleLogout();
      setAuthError('Your session has expired. Please log in again.');
      throw new Error('Session expired');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async function apiSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE' | 'PATCH', body?: unknown, options?: { signal?: AbortSignal }) {
    const response = await fetch(path, {
      method,
      headers: authHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });

    if (response.status === 401) {
      handleLogout();
      setAuthError('Your session has expired. Please log in again.');
      throw new Error('Session expired');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return response.headers.get('content-type')?.includes('application/json')
      ? (response.json() as Promise<T>)
      : (undefined as T);
  }

  function stopCurrentResponse() {
    if (!chatAbortControllerRef.current) {
      return;
    }

    chatAbortControllerRef.current.abort();
    chatAbortControllerRef.current = null;
  }

  async function refreshAll() {
    const [historyRows, factRows, fileRows, urlRows, functionsData, keyRows, usageData, settingsData, userSettingsData, providersData, agentCountsData] = await Promise.all([
      apiGet<HistoryEntry[]>(showArchivedHistory ? '/api/history?archived=true' : '/api/history'),
      apiGet<Fact[]>('/api/memory/facts'),
      apiGet<MemoryFile[]>('/api/memory/files'),
      apiGet<MemoryUrl[]>('/api/memory/urls'),
      apiGet<FunctionCatalogResponse>('/api/settings/functions'),
      apiGet<ApiKey[]>('/api/keys'),
      apiGet<UsageResponse>(`/api/usage?days=${usagePeriodRef.current}`),
      apiGet<SettingsResponse>('/api/settings'),
      apiGet<{ systemPrompt?: string | null; customSkills?: FunctionPreset[]; customAgents?: AgentDefinition[]; conversationLabels?: Record<string, string> | null; conversationModels?: Record<string, { provider: string; model: string }> | null; pinnedConversations?: string[] | null }>('/api/settings/user-settings'),
      apiGet<ProvidersResponse>('/api/chat/providers'),
      apiGet<{ total: number; counts: Record<string, number> }>('/api/memory/facts/agent-counts'),
    ]);

    setHistory(historyRows);
    setFacts(factRows);
    setMemoryFiles(fileRows);
    setMemoryUrls(urlRows);
    setAgentFactCounts(agentCountsData || { total: 0, counts: {} });
    setCustomSkills(functionsData.skills || []);
    setCustomAgents(functionsData.agents || []);
    setApiKeys(keyRows);
    setDailyTokens(usageData.tokens || 0);
    setDailyModelUsage(Array.isArray(usageData.modelUsage) ? usageData.modelUsage : []);
    setDailyProviderUsage(Array.isArray(usageData.providerUsage) ? usageData.providerUsage : []);
    setUsageTrend(Array.isArray(usageData.trend) ? usageData.trend : []);
    setLocalUrl(settingsData.localUrl || 'http://127.0.0.1:11435');
    setUseMemory(settingsData.useMemory !== false);
    setAutoMemory(settingsData.autoMemory !== false);
    setSandboxMode(settingsData.sandboxMode === true);
    setHistoryRetentionDays(settingsData.historyRetentionDays ? String(settingsData.historyRetentionDays) : '');
    setTelegramBotToken(settingsData.telegramBotToken || '');
    setTelegramBotEnabled(settingsData.telegramBotEnabled !== false);
    setTelegramAllowedChatIds(settingsData.telegramAllowedChatIds || '');
    setSystemPrompt(userSettingsData.systemPrompt || '');
    setActivePresetId(getFunctionPresetForPrompt(userSettingsData.systemPrompt, [...BUILT_IN_PRESETS, ...(functionsData.skills || []), ...(functionsData.agents || [])])?.id || '');
    setConversationLabels(userSettingsData.conversationLabels || {});
    setPinnedConversations(new Set(Array.isArray(userSettingsData.pinnedConversations) ? userSettingsData.pinnedConversations : []));
    setConversationModels(userSettingsData.conversationModels || {});
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
    setProviderStatuses(Array.isArray(providersData.providerStatuses) ? providersData.providerStatuses : []);
    const nextTelegramProvider = settingsData.telegramProvider || 'auto';
    setTelegramProvider(nextTelegramProvider);
    setTelegramModel(
      !isAutoRouteProvider(nextTelegramProvider)
        ? (getSelectableModels(nextTelegramProvider, settingsData.telegramModel || '', true, nextModelCatalog).includes(settingsData.telegramModel || '')
          ? (settingsData.telegramModel || '')
          : '')
        : '',
    );
    setKeyInputs({
      anthropic: '',
      google: '',
      openai: '',
    });

    if (nextProviders.length === 1 && nextProviders[0] === 'local') {
      setProvider('local');
      setModel(nextLocalModel);
      return;
    }

    if (!isAutoRouteProvider(provider) && nextProviders.includes(provider)) {
      setModel(currentModel => getPreferredSelectableModel(provider, prompt, currentModel, nextModelCatalog));
    }

    if (!isAutoRouteProvider(provider) && !nextProviders.includes(provider)) {
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

  async function sendTelegramTest() {
    if (sendingTelegramTest) return;
    setSendingTelegramTest(true);
    setTelegramTestResult(null);
    try {
      const data = await apiSend<{ ok: boolean; results: Array<{ chatId: string; ok: boolean; error?: string }> }>(
        '/api/settings/telegram-test', 'POST'
      );
      if (data?.ok) {
        setTelegramTestResult({ ok: true, message: `Test message sent to ${data.results.length} chat ID${data.results.length === 1 ? '' : 's'}.` });
      } else {
        const failed = (data?.results || []).filter(r => !r.ok).map(r => `${r.chatId}: ${r.error}`).join('; ');
        setTelegramTestResult({ ok: false, message: failed || 'Some messages failed to send.' });
      }
    } catch (error) {
      setTelegramTestResult({ ok: false, message: error instanceof Error ? error.message : 'Test failed' });
    } finally {
      setSendingTelegramTest(false);
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
    dispatchChat({ type: 'RESET' });
    setHistory([]);
    setAvailableProviders([]);
  }

  async function refreshModels() {
    if (isRefreshingModels) return;
    setIsRefreshingModels(true);
    try {
      const providersData = await apiGet<ProvidersResponse>('/api/chat/providers');
      const nextLocalModel = providersData.defaultLocalModel?.trim() || DEFAULT_MODELS.local;
      const nextModelCatalog = {
        ...DEFAULT_MODEL_CATALOG,
        ...(providersData.modelCatalog || {}),
        local: providersData.modelCatalog?.local?.length ? providersData.modelCatalog.local : [nextLocalModel],
      };
      setAvailableProviders(providersData.providers || []);
      setDefaultLocalModel(nextLocalModel);
      setModelCatalog(nextModelCatalog);
      setProviderStatuses(Array.isArray(providersData.providerStatuses) ? providersData.providerStatuses : []);
    } catch {
      // silently ignore; stale catalog stays in place
    } finally {
      setIsRefreshingModels(false);
    }
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if ((!text && pendingAttachments.length === 0) || isSending) {
      return;
    }

    const displayPrompt = text || `Attached ${pendingAttachments.length} file${pendingAttachments.length === 1 ? '' : 's'}`;
    dispatchChat({ type: 'ADD_USER_MESSAGE', content: displayPrompt });
    setPrompt('');
    dispatchChat({ type: 'SET_SENDING', value: true });
    const abortController = new AbortController();
    chatAbortControllerRef.current = abortController;

    const body = {
      prompt: text,
      provider: isAutoRouteProvider(provider) ? 'auto' : provider,
      routingMode: isAutoRouteProvider(provider) ? provider : undefined,
      model: isAutoRouteProvider(provider) ? undefined : model,
      conversationId,
      messages: messages.slice(-30),
      attachments: pendingAttachments.map(item => ({
        name: item.name,
        content: item.content,
        type: item.type,
      })),
      activeAgentId: activeBotPreset?.id || null,
    };

    try {
      // SSE streaming path
      const streamRes = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      if (!streamRes.ok || !streamRes.body) {
        let errMsg = `Stream request failed: ${streamRes.status}`;
        try {
          const errBody = await streamRes.json() as { error?: string };
          if (errBody.error) errMsg = errBody.error;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      dispatchChat({ type: 'ADD_ASSISTANT_PLACEHOLDER' });

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let meta: { id: string; text: string; tokensUsed: number; model: string; provider: string; conversationId: string; routingMode: string | null } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as { type: string; delta?: string; meta?: typeof meta; error?: string };
            if (event.type === 'chunk' && typeof event.delta === 'string') {
              dispatchChat({ type: 'APPEND_ASSISTANT_CHUNK', delta: event.delta });
            } else if (event.type === 'done' && event.meta) {
              meta = event.meta;
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Stream error');
            }
          } catch (parseErr) {
            // SyntaxError = malformed SSE line from JSON.parse — skip it.
            // Any other error (e.g. stream error thrown above) must propagate.
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      if (meta) {
        dispatchChat({
          type: 'FINALIZE_ASSISTANT',
          content: meta.text,
          model: meta.model,
          provider: meta.provider,
          routingMode: meta.routingMode,
          tokensUsed: meta.tokensUsed,
          conversationId: meta.conversationId,
        });
        setDailyTokens(prev => prev + meta!.tokensUsed);
        if (meta.conversationId && meta.provider && meta.model) {
          const nextModels = { ...conversationModels, [meta.conversationId]: { provider: meta.provider, model: meta.model } };
          setConversationModels(nextModels);
          void apiSend('/api/settings/user-settings', 'POST', { conversationModels: nextModels });
        }
      }

      // Auto-compact when conversation grows long (20+ messages).
      // The compact endpoint streams SSE chunks; we read the stream and apply
      // the summary when the 'done' event arrives.
      if (messages.length + 2 >= 20) {
        const nonCompact = messages.filter(m => !m.isCompact);
        void (async () => {
          try {
            const compactRes = await fetch('/api/chat/compact', {
              method: 'POST',
              headers: { ...authHeaders, 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: nonCompact }),
            });
            if (!compactRes.ok || !compactRes.body) return;
            const reader = compactRes.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() ?? '';
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                try {
                  const event = JSON.parse(line.slice(5).trim()) as { type: string; summary?: string };
                  if (event.type === 'done' && event.summary) {
                    dispatchChat({ type: 'COMPACT_HISTORY', summary: event.summary, keepLast: 8 });
                  }
                } catch { /* ignore malformed SSE lines */ }
              }
            }
          } catch { /* best-effort, silent */ }
        })();
      }

      setPendingAttachments([]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      await refreshAll();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        dispatchChat({ type: 'SET_ERROR', message: 'Response stopped.' });
        setPrompt(text);
        return;
      }

      const message = error instanceof Error ? error.message : 'Chat request failed';
      dispatchChat({ type: 'SET_ERROR', message });
      dispatchChat({ type: 'ROLLBACK_OPTIMISTIC' });
    } finally {
      if (chatAbortControllerRef.current === abortController) {
        chatAbortControllerRef.current = null;
      }
      dispatchChat({ type: 'SET_SENDING', value: false });
    }
  }

  async function addChatFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    const nextAttachments: PendingAttachment[] = [];

    for (const file of files) {
      if (!isSupportedAttachmentFile(file)) {
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
        parsedAttachment = await parseAttachmentFile(file, {
          onOcrProgress: percent => setNotice(`Running OCR for ${file.name}... ${percent}%`),
        });
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
    dispatchChat({ type: 'RESET' });
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

    const nextMessages: ChatMessage[] = [];
    conversationRows.forEach(item => {
      nextMessages.push({ role: 'user', content: item.prompt });
      nextMessages.push({ role: 'assistant', content: item.response, model: item.model, tokensUsed: item.tokensUsed || 0 });
    });

    dispatchChat({ type: 'LOAD_HISTORY', messages: nextMessages, conversationId: selectedConversationId });
    setActiveTab('chat');
    const pinnedModel = conversationModels[selectedConversationId];
    if (pinnedModel?.provider) {
      setProvider(pinnedModel.provider);
      setModel(pinnedModel.model || '');
    }
  }

  function openTab(tab: TabValue) {
    setActiveTab(tab);
  }

  async function saveSystemPromptOnly(nextSystemPrompt: string) {
    await apiSend('/api/settings/user-settings', 'POST', { systemPrompt: nextSystemPrompt || null });
    setSystemPrompt(nextSystemPrompt);
    setActivePresetId(getFunctionPresetForPrompt(nextSystemPrompt, allPresets)?.id || '');
  }

  async function activateFunctionPreset(preset: FunctionPreset, options?: { startNewChat?: boolean }) {
    setApplyingFunctionId(preset.id);
    try {
      if (options?.startNewChat) {
        dispatchChat({ type: 'RESET' });
      }

      await saveSystemPromptOnly(preset.systemPrompt);
      setPrompt(currentPrompt => currentPrompt.trim() && !currentPrompt.trim().startsWith('/') ? currentPrompt : preset.starterPrompt);
      setActiveTab('chat');
      setNotice(options?.startNewChat ? `${preset.title} started in a new chat.` : `${preset.title} is active in chat.`);
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

  function toggleFullscreenMode() {
    // Pure CSS-driven fullscreen — no native browser API to avoid permission/race issues.
    setIsFullscreen(current => !current);
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
          badge: activePresetId === item.id ? 'Active' : item.builtIn ? 'Built-in' : 'Custom',
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
      ...agentPresets.map(item => ({
        id: item.id,
        command: item.command,
        title: item.title,
        description: item.description,
        detail: [
          item.provider ? `Provider: ${item.provider}` : 'Provider: auto',
          `Memory: ${item.memoryMode || 'shared'}`,
          'executorType' in item && item.executorType === 'remote-http' ? 'Executor: remote' : null,
        ].filter(Boolean).join(' · '),
        badge: activePresetId === item.id ? 'Active' : item.builtIn ? 'Built-in agent' : 'Custom agent',
        keywords: [
          item.useWhen,
          item.boundaries,
          item.kind,
          item.provider || '',
          item.model || '',
          item.memoryMode || '',
          'agent',
          'specialist',
        ].filter(Boolean),
        category: 'agent' as const,
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
  }, [activePresetId, agentPresets, agentPresets.length, prompt, skillPresets, slashCommands, slashQuery]);
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
      agents: nonRecentItems.filter(item => item.category === 'agent'),
    };
  }, [recentSlashItemIds, slashMenuItems, slashQuery]);

  async function createCustomSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newSkillTitle.trim();
    const description = newSkillDescription.trim();
    const command = normalizeSlashCommand(newSkillCommand);
    const useWhenValue = newSkillUseWhen.trim();
    const boundariesValue = newSkillBoundaries.trim();
    const systemPromptValue = newSkillSystemPrompt.trim();
    const starterPromptValue = newSkillStarterPrompt.trim();

    if (!title || !description || !command || !systemPromptValue || !starterPromptValue) {
      setNotice('Fill in all skill fields before saving.');
      return;
    }

    if (RESERVED_SLASH_COMMANDS.has(command) || usedCommands.has(command)) {
      setNotice('That slash command is already in use.');
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
      resetNewSkill();
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
    const command = normalizeSlashCommand(newBotCommand);
    const useWhenValue = newBotUseWhen.trim();
    const boundariesValue = newBotBoundaries.trim();
    const providerValue = newBotProvider.trim().toLowerCase();
    const modelValue = newBotModel.trim();
    const endpointValue = newBotEndpoint.trim();
    const systemPromptValue = newBotSystemPrompt.trim();
    const starterPromptValue = newBotStarterPrompt.trim();
    const parsedMaxTurns = parseInt(newBotMaxTurns, 10);
    const maxTurnsValue = Number.isFinite(parsedMaxTurns) && parsedMaxTurns > 0 ? parsedMaxTurns : null;

    if (!title || !description || !command || !systemPromptValue || !starterPromptValue) {
      setNotice('Fill in all agent fields before saving.');
      return;
    }

    if (RESERVED_SLASH_COMMANDS.has(command) || usedCommands.has(command)) {
      setNotice('That slash command is already in use.');
      return;
    }

    if (newBotExecutorType === 'remote-http' && !endpointValue) {
      setNotice('Remote agents require an endpoint URL.');
      return;
    }

    setCreatingFunction('agent');
    try {
      await apiSend('/api/settings/functions', 'POST', {
        kind: 'agent',
        title,
        description,
        command,
        useWhen: useWhenValue || null,
        boundaries: boundariesValue || null,
        provider: newBotExecutorType === 'internal-llm' ? (providerValue || null) : null,
        model: newBotExecutorType === 'internal-llm' ? (modelValue || null) : null,
        memoryMode: newBotMemoryMode,
        executorType: newBotExecutorType,
        endpoint: newBotExecutorType === 'remote-http' ? endpointValue : null,
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
        tools: newBotTools.length > 0 ? newBotTools : null,
        maxTurns: maxTurnsValue,
      });
      resetNewBot();
      await refreshAll();
      setNotice('Custom agent added.');
    } finally {
      setCreatingFunction('');
    }
  }

  function startEditingCustomBot(agent: AgentDefinition) {
    loadEditingBot({
      id: agent.id,
      title: agent.title,
      description: agent.description,
      command: agent.command,
      useWhen: agent.useWhen || '',
      boundaries: agent.boundaries || '',
      provider: agent.provider || '',
      model: agent.model || '',
      memoryMode: agent.memoryMode || 'shared',
      executorType: agent.executorType || 'internal-llm',
      endpoint: agent.endpoint || '',
      systemPrompt: agent.systemPrompt,
      starterPrompt: agent.starterPrompt,
      tools: agent.tools || [],
      maxTurns: agent.maxTurns ? String(agent.maxTurns) : '',
    });
  }

  function stopEditingCustomBot() {
    resetEditingBot();
  }

  function requestDeleteCustomBot(agentId: string) {
    setConfirmingDeleteBotId(agentId);
  }

  function cancelDeleteCustomBot() {
    setConfirmingDeleteBotId('');
  }

  function exportAgents() {
    if (customAgentsPresets.length === 0) return;
    const payload = customAgentsPresets.map(({ id: _id, builtIn: _builtIn, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `botty-agents-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importAgentsFromFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setNotice('Invalid JSON file.');
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    let imported = 0;
    let skipped = 0;
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof (item as Record<string, unknown>).title !== 'string') { skipped++; continue; }
      const a = item as Record<string, unknown>;
      try {
        await apiSend('/api/settings/functions', 'POST', {
          kind: 'agent',
          title: a.title,
          description: a.description,
          command: a.command,
          useWhen: a.useWhen ?? null,
          boundaries: a.boundaries ?? null,
          provider: a.provider ?? null,
          model: a.model ?? null,
          memoryMode: a.memoryMode ?? 'shared',
          executorType: a.executorType ?? 'internal-llm',
          endpoint: a.endpoint ?? null,
          systemPrompt: a.systemPrompt,
          starterPrompt: a.starterPrompt,
          tools: a.tools ?? null,
          maxTurns: a.maxTurns ?? null,
        });
        imported++;
      } catch { skipped++; }
    }
    if (importAgentInputRef.current) importAgentInputRef.current.value = '';
    await refreshAll();
    setNotice(`Imported ${imported} agent${imported !== 1 ? 's' : ''}${skipped > 0 ? `, skipped ${skipped}` : ''}.`);
  }

  async function saveEditedCustomBot(agentId: string) {
    const title = editingBotTitle.trim();
    const description = editingBotDescription.trim();
    const command = normalizeSlashCommand(editingBotCommand);
    const useWhenValue = editingBotUseWhen.trim();
    const boundariesValue = editingBotBoundaries.trim();
    const providerValue = editingBotProvider.trim().toLowerCase();
    const modelValue = editingBotModel.trim();
    const endpointValue = editingBotEndpoint.trim();
    const systemPromptValue = editingBotSystemPrompt.trim();
    const starterPromptValue = editingBotStarterPrompt.trim();
    const parsedMaxTurns = parseInt(editingBotMaxTurns, 10);
    const maxTurnsValue = Number.isFinite(parsedMaxTurns) && parsedMaxTurns > 0 ? parsedMaxTurns : null;
    const commandTaken = allPresets.some(item => item.id !== agentId && item.command === command);

    if (!title || !description || !command || !systemPromptValue || !starterPromptValue) {
      setNotice('Fill in all agent fields before saving.');
      return;
    }

    if (RESERVED_SLASH_COMMANDS.has(command) || commandTaken) {
      setNotice('That slash command is already in use.');
      return;
    }

    if (editingBotExecutorType === 'remote-http' && !endpointValue) {
      setNotice('Remote agents require an endpoint URL.');
      return;
    }

    setSavingBotId(agentId);
    try {
      await apiSend(`/api/settings/functions/agents/${agentId}`, 'PUT', {
        title,
        description,
        command,
        useWhen: useWhenValue || null,
        boundaries: boundariesValue || null,
        provider: editingBotExecutorType === 'internal-llm' ? (providerValue || null) : null,
        model: editingBotExecutorType === 'internal-llm' ? (modelValue || null) : null,
        memoryMode: editingBotMemoryMode,
        executorType: editingBotExecutorType,
        endpoint: editingBotExecutorType === 'remote-http' ? endpointValue : null,
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
        tools: editingBotTools.length > 0 ? editingBotTools : null,
        maxTurns: maxTurnsValue,
      });
      stopEditingCustomBot();
      await refreshAll();
      setNotice('Custom agent updated.');
    } finally {
      setSavingBotId('');
    }
  }

  async function deleteCustomBot(agent: AgentDefinition) {
    setDeletingBotId(agent.id);
    try {
      await apiSend(`/api/settings/functions/agents/${agent.id}`, 'DELETE');
      setConfirmingDeleteBotId('');
      if (activePresetId === agent.id) {
        setActivePresetId('');
      }
      if (editingBotId === agent.id) {
        stopEditingCustomBot();
      }
      await refreshAll();
      setNotice('Custom agent deleted.');
    } finally {
      setDeletingBotId('');
    }
  }

  async function activateSlashSkill(preset: FunctionPreset) {
    await activateFunctionPreset(preset);
  }

  async function clearAllHistory() {
    await apiSend('/api/history/all', 'DELETE');
    setHistory([]);
    setConversationLabels({});
    setConversationModels({});
    setPinnedConversations(new Set());
    dispatchChat({ type: 'RESET' });
    setConfirmingClearHistory(false);
    void apiSend('/api/settings/user-settings', 'POST', { conversationLabels: {}, conversationModels: {}, pinnedConversations: [] });
  }

  async function deleteConversation(selectedConversationId: string | null | undefined) {
    if (!selectedConversationId) {
      return;
    }

    // Prune orphaned label before the backend delete so refreshAll sees it gone
    if (conversationLabels[selectedConversationId]) {
      const next = { ...conversationLabels };
      delete next[selectedConversationId];
      setConversationLabels(next);
      void apiSend('/api/settings/user-settings', 'POST', { conversationLabels: next });
    }
    if (conversationModels[selectedConversationId]) {
      const next = { ...conversationModels };
      delete next[selectedConversationId];
      setConversationModels(next);
      void apiSend('/api/settings/user-settings', 'POST', { conversationModels: next });
    }

    await apiSend(`/api/history/group/${selectedConversationId}`, 'DELETE');
    if (conversationId === selectedConversationId) {
      startNewChat();
    }
    await refreshAll();
  }

  async function archiveConversation(selectedConversationId: string) {
    await apiSend(`/api/history/group/${selectedConversationId}/archive`, 'PATCH');
    if (conversationId === selectedConversationId) {
      startNewChat();
    }
    await refreshAll();
  }

  async function unarchiveConversation(selectedConversationId: string) {
    await apiSend(`/api/history/group/${selectedConversationId}/unarchive`, 'PATCH');
    await refreshAll();
  }

  async function saveConversationLabel(id: string, label: string) {
    const next = { ...conversationLabels };
    if (label.trim()) {
      next[id] = label.trim();
    } else {
      delete next[id];
    }
    setConversationLabels(next);
    setEditingLabelId('');
    await apiSend('/api/settings/user-settings', 'POST', { conversationLabels: next });
  }

  async function togglePinConversation(id: string) {
    const next = new Set(pinnedConversations);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setPinnedConversations(next);
    await apiSend('/api/settings/user-settings', 'POST', { pinnedConversations: Array.from(next) });
  }

  function exportConversation(conv: { id: string; items: HistoryEntry[] }) {
    const sorted = [...conv.items].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
    const lines: string[] = [`# Conversation export\n\nExported: ${new Date().toLocaleString()}\nID: ${conv.id}\n`];
    for (const entry of sorted) {
      lines.push(`## User\n\n${entry.prompt}\n`);
      lines.push(`## Assistant (${entry.model})\n\n${entry.response}\n`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `conversation-${conv.id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportConversationCSV(conv: { id: string; items: HistoryEntry[] }) {
    const sorted = [...conv.items].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
    const escapeCSV = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['timestamp', 'role', 'content', 'model', 'tokens_used'].join(',');
    const rows: string[] = [header];
    for (const entry of sorted) {
      rows.push([escapeCSV(entry.timestamp), 'user', escapeCSV(entry.prompt), escapeCSV(entry.model || ''), ''].join(','));
      rows.push([escapeCSV(entry.timestamp), 'assistant', escapeCSV(entry.response), escapeCSV(entry.model || ''), String(entry.tokensUsed ?? '')].join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `conversation-${conv.id.slice(0, 8)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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

  async function importFactsFromFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setNotice('No lines found in the file.');
      return;
    }
    let added = 0;
    for (const line of lines) {
      await apiSend('/api/memory/facts', 'POST', { content: line });
      added++;
    }
    if (factImportRef.current) factImportRef.current.value = '';
    setNotice(`Imported ${added} fact${added === 1 ? '' : 's'} from ${file.name}.`);
    await refreshAll();
  }

  async function deleteFact(id: string) {
    await apiSend(`/api/memory/facts/${id}`, 'DELETE');
    await refreshAll();
  }

  async function loadAgentFacts(agentId: string) {
    const rows = await apiGet<Fact[]>(`/api/memory/facts?botId=${encodeURIComponent(agentId)}`);
    setAgentFacts(prev => ({ ...prev, [agentId]: rows }));
  }

  async function deleteAgentFact(agentId: string, factId: string) {
    await apiSend(`/api/memory/facts/${factId}`, 'DELETE');
    await loadAgentFacts(agentId);
  }

  async function clearAgentFacts(agentId: string) {
    await apiSend(`/api/memory/facts/agent/${agentId}`, 'DELETE');
    setAgentFacts(prev => ({ ...prev, [agentId]: [] }));
    await refreshAll();
  }

  function toggleAgentMemory(agentId: string) {
    const wasOpen = expandedAgentMemory[agentId];
    setExpandedAgentMemory(prev => ({ ...prev, [agentId]: !wasOpen }));
    if (!wasOpen) {
      void loadAgentFacts(agentId);
    }
  }

  async function addFactFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }

    for (const file of files) {
      if (!isSupportedAttachmentFile(file)) {
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

      const parsed = await parseAttachmentFile(file, {
        onOcrProgress: percent => setNotice(`Running OCR for ${file.name}... ${percent}%`),
      });
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
        apiSend<{ success: boolean; telegramError?: string | null; pruned?: number }>('/api/settings', 'POST', {
          localUrl,
          useMemory,
          autoMemory,
          sandboxMode,
          historyRetentionDays: historyRetentionDays.trim() ? Number(historyRetentionDays) : null,
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
  const currentRuntimeProvider = isAutoRouteProvider(provider) ? latestAssistantMessage?.provider || provider : provider;
  const currentRuntimeModel = isAutoRouteProvider(provider)
    ? latestAssistantMessage?.model || 'auto-selected'
    : model || getSuggestedChatModel(provider, prompt);
  const currentRuntimeTokenUsage = isAutoRouteProvider(provider)
    ? formatTokenUsage(latestAssistantMessage?.tokensUsed, latestAssistantMessage?.provider, latestAssistantMessage?.model)
    : formatTokenUsage(latestAssistantMessage?.tokensUsed, currentRuntimeProvider, currentRuntimeModel);
  const trendPeak = useMemo(() => Math.max(...usageTrend.map(entry => entry.tokens), 1), [usageTrend]);
  const providerPeak = useMemo(() => Math.max(...dailyProviderUsage.map(entry => entry.tokens), 1), [dailyProviderUsage]);
  const modelPeak = useMemo(() => Math.max(...sortedModelUsage.map(entry => entry.tokens), 1), [sortedModelUsage]);

  const sidebarSearchResults = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return [];
    return conversations
      .filter(item => {
        const label = (conversationLabels[item.id] || '').toLowerCase();
        return label.includes(q) || item.items.some(entry =>
          entry.prompt.toLowerCase().includes(q) || entry.response.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [sidebarSearch, conversations, conversationLabels]);

  const appBackgroundClass = isDarkMode
    ? `w-full overflow-x-hidden bg-[#101214] text-stone-100 ${isFullscreen ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`
    : `w-full overflow-x-hidden bg-[#f3f0ea] text-stone-900 ${isFullscreen ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`;
  const workspaceShellClass = `grid w-full gap-3 md:gap-4 ${isSidebarExpanded ? 'lg:grid-cols-[264px_minmax(0,1fr)]' : 'lg:grid-cols-[84px_minmax(0,1fr)]'} ${isFullscreen ? 'h-dvh overflow-hidden' : 'min-h-dvh'} lg:gap-4 lg:transition-[grid-template-columns] lg:duration-200`;
  const sidebarPanelClass = isDarkMode
    ? `fixed inset-y-3 left-3 z-40 flex w-[280px] flex-col gap-3 rounded-[1.35rem] border border-white/6 bg-[#15171a] p-4 text-stone-100 shadow-[0_8px_18px_rgba(0,0,0,0.12)] transition-transform duration-200 ${isSidebarDrawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'} lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-auto lg:translate-x-0 lg:transition-[width,padding,transform] ${isSidebarExpanded ? 'lg:px-3.5 lg:py-3.5' : 'lg:px-2.5 lg:py-3.5'}`
    : `fixed inset-y-3 left-3 z-40 flex w-[280px] flex-col gap-3 rounded-[1.35rem] border border-stone-200 bg-[#f7f4ee] p-4 text-stone-900 shadow-[0_6px_16px_rgba(36,29,18,0.05)] transition-transform duration-200 ${isSidebarDrawerOpen ? 'translate-x-0' : '-translate-x-[calc(100%+1rem)]'} lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-2rem)] lg:w-auto lg:translate-x-0 lg:transition-[width,padding,transform] ${isSidebarExpanded ? 'lg:px-3.5 lg:py-3.5' : 'lg:px-2.5 lg:py-3.5'}`;
  const shellPanelClass = isDarkMode
    ? `w-full rounded-[1.5rem] bg-[#15181b] p-4 md:p-5 lg:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.22)] border border-white/8 ${isFullscreen ? 'h-dvh overflow-hidden rounded-none border-x-0 border-y-0 p-3 sm:p-4 lg:h-[calc(100dvh-2rem)] lg:rounded-[1.5rem] lg:border lg:p-6' : ''}`
    : `w-full rounded-[1.5rem] bg-[#fcfbf8] p-4 md:p-5 lg:p-6 shadow-[0_18px_42px_rgba(36,29,18,0.08)] border border-stone-200 ${isFullscreen ? 'h-dvh overflow-hidden rounded-none border-x-0 border-y-0 p-3 sm:p-4 lg:h-[calc(100dvh-2rem)] lg:rounded-[1.5rem] lg:border lg:p-6' : ''}`;
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
    ? 'rounded-[1rem] bg-white text-stone-950 px-4 py-3 font-medium flex items-center justify-center gap-2 text-center leading-tight hover:bg-stone-200 transition-colors disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-[1rem] bg-stone-900 text-white px-4 py-3 font-medium flex items-center justify-center gap-2 text-center leading-tight hover:bg-stone-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60';
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
    ? 'rounded-[1rem] border border-white/10 px-4 py-2 text-sm flex items-center justify-center gap-2 text-center leading-tight hover:bg-white/6 transition-colors disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-[1rem] border border-stone-200 px-4 py-2 text-sm flex items-center justify-center gap-2 text-center leading-tight hover:bg-stone-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const listButtonClass = isDarkMode
    ? 'w-full text-left rounded-[1rem] border border-white/8 bg-[#1a1d20] px-3 py-3 hover:border-white/20 transition-colors'
    : 'w-full text-left rounded-[1rem] border border-stone-200 bg-white px-3 py-3 hover:border-stone-300 transition-colors';
  const secondaryButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-white/10 bg-[#1a1d20] px-3 py-2 text-sm inline-flex items-center justify-center gap-2 text-center leading-tight hover:bg-[#202428] transition-colors disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-[1rem] border border-stone-200 bg-white px-3 py-2 text-sm inline-flex items-center justify-center gap-2 text-center leading-tight hover:bg-stone-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const destructiveButtonClass = isDarkMode
    ? 'rounded-[1rem] border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300 inline-flex items-center justify-center gap-2 text-center leading-tight hover:bg-red-950/60 transition-colors disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-[1rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 inline-flex items-center justify-center gap-2 text-center leading-tight hover:bg-red-100 transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const responsiveButtonClass = 'w-full sm:w-auto';
  const responsivePrimaryButtonClass = `${primaryButtonClass} ${responsiveButtonClass}`;
  const responsiveSecondaryButtonClass = `${secondaryButtonClass} ${responsiveButtonClass}`;
  const responsiveDestructiveButtonClass = `${destructiveButtonClass} ${responsiveButtonClass}`;
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

            <label htmlFor="login-display-name" className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Display name</label>
            <input
              id="login-display-name"
              value={loginName}
              onChange={event => setLoginName(event.target.value)}
              placeholder="Ofir"
              className={`${textInputClass} mb-4`}
            />

            <label htmlFor="login-email" className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Email</label>
            <input
              id="login-email"
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
      <div className={`${isFullscreen ? 'h-dvh w-full overflow-hidden p-0' : 'min-h-dvh w-full p-3 sm:p-4 lg:p-5'}`}>
        <div className={workspaceShellClass}>
          {isSidebarDrawerOpen ? (
            <button
              type="button"
              aria-label="Close menu overlay"
              className={`fixed inset-0 z-30 lg:hidden ${isDarkMode ? 'bg-black/55' : 'bg-stone-900/20'}`}
              onClick={closeMobileSidebar}
            />
          ) : null}

          {showShortcuts ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Keyboard shortcuts"
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => setShowShortcuts(false)}
            >
              <div className={`w-full max-w-sm rounded-[1.25rem] border p-5 shadow-xl ${isDarkMode ? 'border-white/10 bg-[#1c1f23] text-stone-100' : 'border-stone-200 bg-white text-stone-900'}`} onClick={event => event.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Keyboard shortcuts</h3>
                  <button type="button" onClick={() => setShowShortcuts(false)} className="opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-current/10">
                    {([
                      ['Ctrl + N', 'New conversation'],
                      ['Ctrl + \\', 'Toggle sidebar'],
                      ['Ctrl + /', 'Focus composer'],
                      ['Alt + Enter', 'Toggle fullscreen'],
                      ['Escape', 'Close this / exit fullscreen'],
                      ['Enter', 'Send message'],
                      ['Shift + Enter', 'New line in composer'],
                      ['Ctrl + Enter', 'Save settings form'],
                      ['↑ / ↓', 'Navigate slash menu'],
                      ['Ctrl + ?', 'Toggle this panel'],
                    ] as [string, string][]).map(([key, label]) => (
                      <tr key={key}>
                        <td className="py-2 pr-4 font-mono text-xs opacity-70 whitespace-nowrap">{key}</td>
                        <td className={`py-2 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>{label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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

            {isSidebarExpanded ? (
              <div className="relative">
                <div className={`flex items-center gap-2 rounded-[0.9rem] border px-3 py-2 text-sm ${isDarkMode ? 'border-white/10 bg-white/5 text-stone-300 placeholder:text-stone-500' : 'border-stone-200 bg-white/70 text-stone-700 placeholder:text-stone-400'}`}>
                  <Search className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={event => setSidebarSearch(event.target.value)}
                    onFocus={() => setSidebarSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSidebarSearchFocused(false), 150)}
                    placeholder="Search conversations…"
                    aria-label="Search conversations"
                    className="flex-1 bg-transparent outline-none text-sm min-w-0"
                  />
                  {sidebarSearch ? (
                    <button type="button" onClick={() => setSidebarSearch('')} className="shrink-0 opacity-60 hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
                {(sidebarSearchFocused || sidebarSearch) && sidebarSearchResults.length > 0 ? (
                  <div className={`absolute left-0 right-0 top-full z-50 mt-1 rounded-[0.9rem] border py-1 shadow-lg ${isDarkMode ? 'border-white/10 bg-[#1c1f23]' : 'border-stone-200 bg-white'}`}>
                    {sidebarSearchResults.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => {
                          loadConversation(item.id);
                          setSidebarSearch('');
                          closeMobileSidebar();
                        }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${isDarkMode ? 'hover:bg-white/6 text-stone-200' : 'hover:bg-stone-50 text-stone-800'}`}
                      >
                        <div className="truncate font-medium">
                          {conversationLabels[item.id] || item.items[0].prompt}
                        </div>
                        <div className={`truncate text-xs mt-0.5 ${isDarkMode ? 'text-stone-400' : 'text-stone-500'}`}>
                          {new Date(item.items[0].timestamp).toLocaleDateString()}
                          {conversationLabels[item.id] ? ` · ${item.items[0].prompt.slice(0, 60)}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (sidebarSearchFocused || sidebarSearch) && sidebarSearch.trim() && sidebarSearchResults.length === 0 ? (
                  <div className={`absolute left-0 right-0 top-full z-50 mt-1 rounded-[0.9rem] border px-3 py-2.5 text-sm shadow-lg ${isDarkMode ? 'border-white/10 bg-[#1c1f23] text-stone-400' : 'border-stone-200 bg-white text-stone-500'}`}>
                    No matches
                  </div>
                ) : null}
              </div>
            ) : null}

            {activePresetId && isSidebarExpanded ? (
              <div className="flex items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                <span className="flex-1 truncate font-medium">{allPresets.find(item => item.id === activePresetId)?.title || 'Custom mode'} active</span>
                <button onClick={() => void clearFunctionPreset()} title="Clear active mode" className="shrink-0 hover:text-violet-900 dark:hover:text-violet-100"><X className="w-3 h-3" /></button>
              </div>
            ) : null}

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

            <button type="button" onClick={() => setShowShortcuts(true)} className={sidebarCompactButtonClass} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold leading-none" style={{ borderColor: 'currentColor' }}>?</span>
              <span className={sidebarTextClass}>Shortcuts</span>
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

          <main className={`${shellPanelClass} flex min-h-[calc(100dvh-1.5rem)] flex-col ${isFullscreen ? 'h-dvh min-h-0 overflow-hidden lg:h-[calc(100dvh-2rem)]' : activeTab === 'chat' ? 'overflow-hidden' : ''}`}>
            <div className={`mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${isFullscreen ? 'shrink-0' : ''}`}>
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setIsSidebarDrawerOpen(true)}
                  className={`${actionButtonClass} ${isFullscreen ? '' : 'lg:hidden'}`}
                  aria-label="Open menu"
                  title="Open menu"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <div className="min-w-0">
                  <h2 className="text-xl font-semibold sm:text-2xl">{activeTabLabel}</h2>
                  <p className={`text-sm ${subtleTextClass}`}>
                    {activeTab === 'chat' ? (conversationStats ? `~${conversationStats.words.toLocaleString()} words · ${conversationStats.exchanges} exchange${conversationStats.exchanges === 1 ? '' : 's'}` : 'Send prompts through Claude or any configured local provider.') : null}
                    {activeTab === 'skills' ? 'Run Botty skills with slash commands or activate them from the menu.' : null}
                    {activeTab === 'agents' ? 'Launch specialized agents that can own longer tasks across the session.' : null}
                    {activeTab === 'history' ? 'Reload or delete stored conversations.' : null}
                    {activeTab === 'memory' ? 'Manage facts and URLs that feed the prompt context.' : null}
                    {activeTab === 'settings' ? 'Save keys and runtime preferences used by the local server.' : null}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => void refreshAll()} className={`${actionButtonClass} w-full md:w-auto`}>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => toggleFullscreenMode()}
                  className={actionButtonClass}
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {notice ? <div className={noticeClass}>{notice}</div> : null}

            {activeTab === 'chat' ? (
              <div className={`grid flex-1 min-h-0 gap-3 sm:gap-4 ${isFullscreen ? 'grid-cols-1 overflow-hidden' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}>
                <section className={`${sectionCardClass} flex min-h-0 flex-col ${isFullscreen ? 'h-full' : 'min-h-[62vh] sm:min-h-[70vh]'}`}>
                  {activePreset ? (
                    <div className={`mb-3 flex flex-col gap-2 rounded-[1rem] border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
                      activePreset.kind === 'skill'
                        ? (isDarkMode ? 'border-amber-400/20 bg-amber-500/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900')
                        : (isDarkMode ? 'border-violet-400/20 bg-violet-500/10 text-violet-100' : 'border-violet-200 bg-violet-50 text-violet-900')
                    }`}>
                      <div className="flex items-start gap-2">
                        {activePreset.kind === 'skill'
                          ? <Sparkles className="mt-0.5 w-4 h-4 shrink-0" />
                          : <Bot className="mt-0.5 w-4 h-4 shrink-0" />}
                        <div>
                          <div className="font-medium">{activePreset.kind === 'skill' ? 'Skill overlay' : 'Agent session'}: {activePreset.title}</div>
                          <div className={`mt-1 text-xs opacity-80`}>
                            {activePreset.kind === 'skill'
                              ? 'Inherits the current provider, memory, and session — does not take over the workflow.'
                              : 'Owns the session. May apply its own routing, model, and memory policy.'}
                          </div>
                          {activeBotPreset?.tools?.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {activeBotPreset.tools.map(tool => (
                                <span key={tool.name} className={`rounded-full border px-2 py-0.5 text-[11px] tracking-wide opacity-80 ${isDarkMode ? 'border-violet-400/20 bg-violet-500/10' : 'border-violet-200 bg-violet-100'}`}>
                                  {tool.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                        {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                      </button>
                    </div>
                  ) : null}

                  <div className={`items-center justify-between gap-3 pb-3 xl:hidden ${isFullscreen ? 'hidden' : 'flex'}`}>
                    <div>
                      <h3 className="text-sm font-medium">Runtime</h3>
                      <p className={`mt-1 text-xs ${subtleTextClass}`}>Toggle runtime details.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsChatSidebarOpen(value => !value)}
                      className={secondaryButtonClass}
                      aria-expanded={isChatSidebarOpen}
                      aria-label={isChatSidebarOpen ? 'Hide runtime details' : 'Show runtime details'}
                    >
                      {isChatSidebarOpen ? 'Hide runtime' : 'Show runtime'}
                    </button>
                  </div>

                  <div ref={chatScrollRef} className="flex-1 overflow-auto space-y-3 pr-1 sm:space-y-4 sm:pr-2 relative">
                    {showScrollResumeBtn ? (
                      <div className="sticky top-0 z-10 flex justify-center pb-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            scrollLockedRef.current = false;
                            setShowScrollResumeBtn(false);
                            const el = chatScrollRef.current;
                            if (el) el.scrollTop = el.scrollHeight;
                          }}
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-md ${isDarkMode ? 'bg-stone-700 text-stone-100 hover:bg-stone-600' : 'bg-stone-800 text-white hover:bg-stone-700'}`}
                        >
                          ↓ Resume scroll
                        </button>
                      </div>
                    ) : null}
                    {conversationTokenWarning ? (
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${conversationTokenWarning.level === 'critical' ? (isDarkMode ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800') : (isDarkMode ? 'border-amber-400/20 bg-amber-500/8 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800')}`}>
                        <Layers className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span>
                          Context is {Math.round(conversationTokenWarning.pct * 100)}% full ({conversationTokenWarning.totalUsed.toLocaleString()} / {conversationTokenWarning.limit.toLocaleString()} tokens). Consider starting a new chat or using /new-chat.
                        </span>
                      </div>
                    ) : null}
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
                      message.isCompact && message.role === 'user' ? (
                        <div key={`compact-${index}`} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${isDarkMode ? 'border-amber-400/20 bg-amber-500/8 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                          <Layers className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                          <div className="text-xs leading-relaxed opacity-80">
                            {message.content.replace('[Context from earlier in this conversation]: ', '')}
                          </div>
                        </div>
                      ) : message.isCompact ? null : (
                      <div key={`${message.role}-${index}`} className={`rounded-[1.1rem] px-3 py-3 sm:px-4 sm:py-4 ${message.role === 'user' ? (isDarkMode ? 'bg-white text-stone-950 ml-auto max-w-[94%] sm:max-w-[82%]' : 'bg-stone-900 text-white ml-auto max-w-[94%] sm:max-w-[82%]') : isDarkMode ? 'bg-[#1a1d20] border border-white/8 max-w-full sm:max-w-[92%]' : 'bg-[#f7f4ee] border border-stone-200 max-w-full sm:max-w-[92%]'}`}>
                        {message.role === 'assistant' && message.routingMode ? (
                          <div className={`mb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>
                            Requested via {formatRoutingModeLabel(message.routingMode)}
                          </div>
                        ) : null}
                        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2 flex items-center justify-between gap-2">
                          <span>
                            {message.role === 'user'
                              ? 'You'
                              : [formatProviderLabel(message.provider), message.model].filter(Boolean).join(' · ') || message.model || 'Assistant'}
                          </span>
                          {message.sentAt ? (
                            <span className="normal-case tracking-normal text-[11px] opacity-70">
                              {new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : null}
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] leading-6 sm:leading-7">{message.content}</div>
                        {message.role === 'user' && !isSending ? (
                          <div className="mt-2 flex justify-start">
                            <button
                              type="button"
                              title="Fork — branch from this point"
                              onClick={() => {
                                dispatchChat({ type: 'FORK_AT', beforeIndex: index });
                                setPrompt(message.content);
                              }}
                              className={`flex items-center gap-1 text-xs ${subtleTextClass} opacity-50 hover:opacity-100`}
                            >
                              <GitBranch className="w-3 h-3" /> Fork
                            </button>
                          </div>
                        ) : null}
                        {message.role === 'assistant' ? (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className={`text-xs ${subtleTextClass}`}>{formatTokenUsage(message.tokensUsed, message.provider, message.model) || ''}</div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                title="Copy message"
                                onClick={() => {
                                  navigator.clipboard.writeText(message.content);
                                  setCopiedMessageIndex(index);
                                  setTimeout(() => setCopiedMessageIndex(null), 1500);
                                }}
                                className={`flex items-center gap-1 text-xs ${subtleTextClass} opacity-50 hover:opacity-100 transition-opacity`}
                              >
                                {copiedMessageIndex === index ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                {copiedMessageIndex === index ? 'Copied!' : 'Copy'}
                              </button>
                              {message.model && index === messages.length - 1 && !isSending ? (
                                <button
                                  type="button"
                                  title="Retry — resend the last message"
                                  onClick={() => {
                                    const lastUser = [...messages].reverse().find(m => m.role === 'user');
                                    if (!lastUser) return;
                                    dispatchChat({ type: 'ROLLBACK_OPTIMISTIC' });
                                    setPrompt(lastUser.content);
                                  }}
                                  className={`flex items-center gap-1 text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}
                                >
                                  <RefreshCw className="w-3 h-3" /> Retry
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      )
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
                    <div className="mb-3 grid gap-3 sm:grid-cols-[minmax(0,180px)_1fr_auto]">
                      <select
                        value={getProviderSelectValue(provider)}
                        onChange={event => {
                          const nextProvider = event.target.value;
                          if (nextProvider === 'auto') {
                            setProvider(currentProvider => isAutoRouteProvider(currentProvider) ? currentProvider : 'auto');
                            setModel('');
                            return;
                          }

                          setProvider(nextProvider);
                          setModel(getPreferredSelectableModel(nextProvider, prompt));
                        }}
                        className={inputClass}
                      >
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <select
                        value={isAutoRouteProvider(provider) ? provider : model}
                        onChange={event => {
                          if (isAutoRouteProvider(provider)) {
                            setProvider(event.target.value);
                            return;
                          }

                          setModel(event.target.value);
                        }}
                        className={inputClass}
                      >
                        {isAutoRouteProvider(provider)
                          ? AUTO_ROUTE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))
                          : getSelectableModels(provider, model).map(option => (
                              <option key={option} value={option}>{formatModelOptionLabel(option, provider)}</option>
                            ))}
                      </select>

                      <button
                        type="button"
                        title="Refresh model catalog"
                        onClick={() => void refreshModels()}
                        disabled={isRefreshingModels}
                        className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition-opacity ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-stone-300' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'} disabled:opacity-40`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`h-4 w-4 ${isRefreshingModels ? 'animate-spin' : ''}`}
                        >
                          <path d="M23 4v6h-6" />
                          <path d="M1 20v-6h6" />
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                        </svg>
                      </button>
                    </div>

                    {conversationId && conversationModels[conversationId] ? (
                      <div className={`mb-2 flex items-center gap-1.5 text-xs ${subtleTextClass}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <span>Locked to <strong>{[conversationModels[conversationId].provider, conversationModels[conversationId].model].filter(Boolean).join(' · ')}</strong> for this conversation</span>
                      </div>
                    ) : null}

                    <textarea
                      ref={composerTextareaRef}
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
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Navigation</div>
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
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className={`text-xs ${isDarkMode ? 'text-sky-400' : 'text-sky-600'}`}>→</span>
                                              <div>
                                                <span className="text-sm font-medium">/{item.command}</span>
                                                <span className={`ml-2 text-xs ${subtleTextClass}`}>{item.description}</span>
                                              </div>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${getSlashItemBadgeClass(item)}`}>{item.badge}</span>
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

                              {groupedSlashItems.agents.length > 0 ? (
                                <div>
                                  <div className={`px-2 pb-2 text-[11px] uppercase tracking-[0.2em] ${subtleTextClass}`}>Agents</div>
                                  <div className="space-y-1">
                                    {groupedSlashItems.agents.map(item => {
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
                            <div className={`px-3 py-2 text-sm ${subtleTextClass}`}>No matching commands, skills, or agents.</div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <p className={`text-xs ${subtleTextClass}`}>Auth: local JWT. Memory: {useMemory ? 'enabled' : 'disabled'}. Sandbox: {sandboxMode ? 'on' : 'off'}. {activePresetId ? `Mode: ${allPresets.find(item => item.id === activePresetId)?.title || 'Custom'}` : 'Mode: default chat'}. Drag files into this panel to attach them.{prompt.trim().length > 0 ? ` · ~${Math.max(1, Math.round(prompt.trim().length / 4)).toLocaleString()} tokens` : ''}</p>
                      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                        <button type="button" onClick={() => attachmentInputRef.current?.click()} className={secondaryButtonClass}>
                          <Upload className="w-4 h-4" />
                          Add files
                        </button>
                        <button type="button" onClick={toggleVoiceInput} className={secondaryButtonClass}>
                          {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          {isListening ? 'Stop voice' : 'Voice'}
                        </button>
                        {isSending ? (
                          <button type="button" onClick={stopCurrentResponse} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white sm:w-auto">
                            <Square className="w-4 h-4" />
                            Stop
                          </button>
                        ) : (
                          <button onClick={() => void sendPrompt()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-2.5 text-white disabled:opacity-60 sm:w-auto">
                            <Send className="w-4 h-4" />
                            Send
                          </button>
                        )}
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
                </section>
              </div>
            ) : null}

            {activeTab === 'skills' ? (
              <div className={`space-y-4 ${isFullscreen ? 'flex-1 overflow-auto min-h-0 pb-4' : ''}`}>
                <section className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Skills</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Skills are lightweight overlays: reusable, narrow capabilities that stay inside the current chat and inherit its provider, memory, and session context.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-sm ${mutedTextClass}`}>{activePresetId ? `Active skill: ${allPresets.find(item => item.id === activePresetId)?.title || 'Custom mode'}` : 'No active skill'}</div>
                    <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                      {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                    </button>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Skills</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>Lightweight overlays for the current chat. They inherit the active provider, memory, and session context.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Agents</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>Dedicated specialists for longer workflows. They can own the task and may use their own routing or memory policy.</p>
                    </div>
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
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>You want a quick capability boost inside the same conversation, not a dedicated agent that owns the whole workflow.</p>
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
                    <input value={newSkillTitle} onChange={event => patchNewSkill({ title: event.target.value })} placeholder="Skill title, e.g. Architecture Critic" className={textInputClass} />
                    <input value={newSkillCommand} onChange={event => patchNewSkill({ command: event.target.value })} placeholder="Slash command, e.g. architecture" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newSkillDescription} onChange={event => patchNewSkill({ description: event.target.value })} placeholder="Capability summary, e.g. critiques designs and tradeoffs" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <input value={newSkillUseWhen} onChange={event => patchNewSkill({ useWhen: event.target.value })} placeholder="Use when, e.g. you need a quick architecture review inside the current thread" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillBoundaries} onChange={event => patchNewSkill({ boundaries: event.target.value })} rows={2} placeholder="Operating bounds, e.g. keeps the current provider and memory, and should not take over the whole session" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillSystemPrompt} onChange={event => patchNewSkill({ systemPrompt: event.target.value })} rows={4} placeholder="System prompt: define the expertise, decision rules, and tone for this focused capability" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillStarterPrompt} onChange={event => patchNewSkill({ starterPrompt: event.target.value })} rows={3} placeholder="Starter prompt, e.g. Review this design and point out the main risks" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2 flex">
                      <button type="submit" disabled={creatingFunction === 'skill'} className={responsivePrimaryButtonClass}>
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
                      const isActive = activePresetId === item.id;

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

                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <button
                              onClick={() => void activateFunctionPreset(item)}
                              disabled={applyingFunctionId === item.id}
                              className={responsivePrimaryButtonClass}
                            >
                              {applyingFunctionId === item.id ? 'Applying...' : 'Use in current chat'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'agents' ? (
              <div className={`space-y-4 ${isFullscreen ? 'flex-1 overflow-auto min-h-0 pb-4' : ''}`}>
                <section className={`${sectionCardClass} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
                  <div>
                    <h3 className="font-medium">Agents</h3>
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Agents are dedicated specialists: they can own a longer workflow, optionally use their own routing, and choose how memory behaves across the session.</p>
                  </div>
                  <div className={`flex items-center gap-1.5 text-sm`}>
                    {activePresetId && allPresets.find(item => item.id === activePresetId)?.kind === 'agent' ? (
                      <>
                        <Bot className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <span className="text-violet-600 dark:text-violet-400 font-medium">Active: {allPresets.find(item => item.id === activePresetId)?.title}</span>
                      </>
                    ) : activePresetId ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Active: {allPresets.find(item => item.id === activePresetId)?.title}</span>
                      </>
                    ) : (
                      <span className={mutedTextClass}>No active agent</span>
                    )}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">What an agent is</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>A persistent specialist that owns a multi-turn workflow such as building, reviewing, operating, or researching.</p>
                    </div>
                    <div className={elevatedCardClass}>
                      <div className="text-sm font-medium">Best when</div>
                      <p className={`mt-2 text-sm ${subtleTextClass}`}>You want Botty to stay in a stable specialist role that can own the task, potentially with its own provider, model, and memory policy.</p>
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
                    <h3 className="font-medium">Create agent</h3>
                  </div>
                  <form onSubmit={createCustomBot} className="grid gap-3 md:grid-cols-2">
                    <input value={newBotTitle} onChange={event => patchNewBot({ title: event.target.value })} placeholder="Agent title, e.g. Security Reviewer" className={textInputClass} />
                    <input value={newBotCommand} onChange={event => patchNewBot({ command: event.target.value })} placeholder="Slash command, e.g. security-review" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newBotDescription} onChange={event => patchNewBot({ description: event.target.value })} placeholder="Specialist summary, e.g. reviews code and architecture for security risk" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <input value={newBotUseWhen} onChange={event => patchNewBot({ useWhen: event.target.value })} placeholder="Use when, e.g. you want a dedicated security specialist to own the session" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotBoundaries} onChange={event => patchNewBot({ boundaries: event.target.value })} rows={2} placeholder="Operating bounds, e.g. should stay in review mode and avoid drifting into implementation without being asked" className={textareaClass} />
                    </div>
                    <select value={newBotExecutorType} onChange={event => patchNewBot({ executorType: event.target.value as AgentExecutorType })} className={textInputClass}>
                      <option value="internal-llm">Internal Botty agent</option>
                      <option value="remote-http">Remote HTTP agent</option>
                    </select>
                    <input value={newBotEndpoint} onChange={event => patchNewBot({ endpoint: event.target.value })} placeholder="Remote endpoint, e.g. http://127.0.0.1:8787/agent" className={textInputClass} disabled={newBotExecutorType !== 'remote-http'} />
                    {newBotExecutorType === 'internal-llm' ? (
                      <>
                        <select value={newBotProvider ? getProviderSelectValue(newBotProvider) : ''} onChange={event => {
                          const nextProvider = event.target.value;
                          if (!nextProvider) {
                            patchNewBot({ provider: '', model: '' });
                            return;
                          }

                          if (nextProvider === 'auto') {
                            patchNewBot({ provider: isAutoRouteProvider(newBotProvider) ? newBotProvider : 'auto', model: '' });
                            return;
                          }

                          patchNewBot({ provider: nextProvider, model: getPreferredSelectableModel(nextProvider, newBotStarterPrompt) });
                        }} className={textInputClass}>
                          <option value="">Inherit chat provider</option>
                          {PROVIDERS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <select value={newBotMemoryMode} onChange={event => patchNewBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                          <option value="shared">Shared memory</option>
                          <option value="isolated">Isolated agent memory</option>
                          <option value="none">No memory</option>
                        </select>
                      </>
                    ) : (
                      <>
                        <div className={`${textInputClass} flex items-center ${subtleTextClass}`}>Routing handled by the remote endpoint</div>
                        <select value={newBotMemoryMode} onChange={event => patchNewBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                          <option value="shared">Shared memory</option>
                          <option value="isolated">Isolated agent memory</option>
                          <option value="none">No memory</option>
                        </select>
                      </>
                    )}
                    <div className="md:col-span-2">
                      <select value={newBotProvider && isAutoRouteProvider(newBotProvider) ? newBotProvider : newBotModel} onChange={event => {
                        if (!newBotProvider) {
                          patchNewBot({ model: event.target.value });
                          return;
                        }

                        if (isAutoRouteProvider(newBotProvider)) {
                          patchNewBot({ provider: event.target.value });
                          return;
                        }

                        patchNewBot({ model: event.target.value });
                      }} disabled={!newBotProvider || newBotExecutorType !== 'internal-llm'} className={`${textInputClass} ${!newBotProvider || newBotExecutorType !== 'internal-llm' ? (isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400') : ''}`}>
                        {!newBotProvider ? <option value="">Inherit provider default</option> : null}
                        {newBotProvider && isAutoRouteProvider(newBotProvider)
                          ? AUTO_ROUTE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))
                          : null}
                        {newBotProvider && !isAutoRouteProvider(newBotProvider) ? getSelectableModels(newBotProvider, newBotModel, true).map(option => (
                          <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, newBotProvider)}</option>
                        )) : null}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotSystemPrompt} onChange={event => patchNewBot({ systemPrompt: event.target.value })} rows={4} placeholder="System prompt: define the specialist role, operating rules, and decision standards" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotStarterPrompt} onChange={event => patchNewBot({ starterPrompt: event.target.value })} rows={3} placeholder="Starter prompt, e.g. Review this feature end to end and prioritize the biggest risks" className={textareaClass} />
                    </div>
                    <div>
                      <input type="number" min="1" max="100" value={newBotMaxTurns} onChange={event => patchNewBot({ maxTurns: event.target.value })} placeholder="Max turns (optional, e.g. 10)" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <div className="flex flex-col gap-2">
                        <div className={`text-xs ${subtleTextClass}`}>Tool definitions (optional) — listed in the system prompt so the LLM knows which tools are available</div>
                        {newBotTools.map((tool, idx) => (
                          <div key={idx} className="flex gap-2 items-start">
                            <input
                              value={tool.name}
                              onChange={event => patchNewBot({ tools: newBotTools.map((t, i) => i === idx ? { ...t, name: event.target.value } : t) })}
                              placeholder="Tool name, e.g. search_web"
                              className={textInputClass}
                            />
                            <input
                              value={tool.description}
                              onChange={event => patchNewBot({ tools: newBotTools.map((t, i) => i === idx ? { ...t, description: event.target.value } : t) })}
                              placeholder="What this tool does"
                              className={textInputClass}
                            />
                            <button
                              type="button"
                              onClick={() => patchNewBot({ tools: newBotTools.filter((_, i) => i !== idx) })}
                              className={`shrink-0 ${secondaryButtonClass}`}
                              aria-label="Remove tool"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => patchNewBot({ tools: [...newBotTools, { name: '', description: '' }] })}
                          className={secondaryButtonClass}
                        >
                          <Plus className="w-4 h-4" /> Add tool
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2 flex">
                      <button type="submit" disabled={creatingFunction === 'agent'} className={responsivePrimaryButtonClass}>
                        {creatingFunction === 'agent' ? 'Adding...' : 'Add agent'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className={sectionCardClass}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-medium">Built-in agents</h3>
                    <span className={`text-xs ${subtleTextClass}`}>{builtInAgents.length} available</span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {builtInAgents.map(item => {
                      const isActive = activePresetId === item.id;

                      return (
                        <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-4`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{item.title}</div>
                              <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                            </div>
                            <div className={`rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                              {isActive ? 'Active' : item.builtIn ? 'Agent' : 'Custom agent'}
                            </div>
                          </div>

                          <div className={`text-xs ${subtleTextClass}`}>Slash command: /{item.command}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Task focus: {item.starterPrompt}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Use when: {item.useWhen}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Operating bounds: {item.boundaries}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetActivationLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetAutonomyLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetRoutingLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>{getPresetMemoryLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>Executor: {getAgentExecutorLabel(item)}</div>
                          <div className={`text-xs ${subtleTextClass}`}>
                            Provider: {item.provider ? formatProviderLabel(item.provider) : 'Inherit chat'}
                            {' · '}
                            Model: {item.model ? formatModelDisplay(item.model, item.provider || undefined) : 'Inherit chat'}
                            {' · '}
                            Memory: {item.memoryMode || 'shared'}
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <button
                              onClick={() => void activateFunctionPreset(item, { startNewChat: true })}
                              disabled={applyingFunctionId === item.id}
                              className={responsivePrimaryButtonClass}
                            >
                              {applyingFunctionId === item.id ? 'Starting...' : 'Start agent chat'}
                            </button>
                            <button
                              onClick={() => void activateFunctionPreset(item)}
                              disabled={applyingFunctionId === item.id}
                              className={responsiveSecondaryButtonClass}
                            >
                              {applyingFunctionId === item.id ? 'Starting...' : 'Use in current chat'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-medium">Custom agents</h3>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => importAgentInputRef.current?.click()} className={`text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}>
                        Import
                      </button>
                      <input ref={importAgentInputRef} type="file" accept=".json,application/json" onChange={event => void importAgentsFromFile(event.target.files)} className="hidden" />
                      {customAgentsPresets.length > 0 ? (
                        <button type="button" onClick={exportAgents} className={`text-xs ${subtleTextClass} hover:text-stone-700 dark:hover:text-stone-300`}>
                          Export all
                        </button>
                      ) : null}
                      <span className={`text-xs ${subtleTextClass}`}>{customAgentsPresets.length} created</span>
                    </div>
                  </div>
                  {customAgentsPresets.length > 0 ? (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {customAgentsPresets.map(item => {
                        const isActive = activePresetId === item.id;
                        const isEditing = editingBotId === item.id;
                        const isSaving = savingBotId === item.id;
                        const isDeleting = deletingBotId === item.id;
                        const isConfirmingDelete = confirmingDeleteBotId === item.id;

                        return (
                          <div key={item.id} className={`${elevatedCardClass} flex flex-col gap-4`}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">{item.title}</div>
                                <p className={`text-sm ${subtleTextClass} mt-1`}>{item.description}</p>
                              </div>
                              <div className={`rounded-full px-2 py-1 text-xs ${isActive ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200') : (isDarkMode ? 'bg-white/5 text-stone-300 border border-white/10' : 'bg-stone-100 text-stone-600 border border-stone-200')}`}>
                                {isActive ? 'Active' : 'Custom agent'}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <input value={editingBotTitle} onChange={event => patchEditingBot({ title: event.target.value })} placeholder="Agent title, e.g. Security Reviewer" className={textInputClass} />
                                <input value={editingBotCommand} onChange={event => patchEditingBot({ command: event.target.value })} placeholder="Slash command, e.g. security-review" className={textInputClass} />
                                <div className="md:col-span-2">
                                  <input value={editingBotDescription} onChange={event => patchEditingBot({ description: event.target.value })} placeholder="Specialist summary, e.g. reviews code and architecture for security risk" className={textInputClass} />
                                </div>
                                <div className="md:col-span-2">
                                  <input value={editingBotUseWhen} onChange={event => patchEditingBot({ useWhen: event.target.value })} placeholder="Use when, e.g. you want a dedicated security specialist to own the session" className={textInputClass} />
                                </div>
                                <div className="md:col-span-2">
                                  <textarea value={editingBotBoundaries} onChange={event => patchEditingBot({ boundaries: event.target.value })} rows={2} placeholder="Operating bounds, e.g. should stay in review mode and avoid drifting into implementation without being asked" className={textareaClass} />
                                </div>
                                <select value={editingBotExecutorType} onChange={event => patchEditingBot({ executorType: event.target.value as AgentExecutorType })} className={textInputClass}>
                                  <option value="internal-llm">Internal Botty agent</option>
                                  <option value="remote-http">Remote HTTP agent</option>
                                </select>
                                <input value={editingBotEndpoint} onChange={event => patchEditingBot({ endpoint: event.target.value })} placeholder="Remote endpoint, e.g. http://127.0.0.1:8787/agent" className={textInputClass} disabled={editingBotExecutorType !== 'remote-http'} />
                                {editingBotExecutorType === 'internal-llm' ? (
                                  <>
                                    <select value={editingBotProvider ? getProviderSelectValue(editingBotProvider) : ''} onChange={event => {
                                      const nextProvider = event.target.value;
                                      if (!nextProvider) {
                                        patchEditingBot({ provider: '', model: '' });
                                        return;
                                      }

                                      if (nextProvider === 'auto') {
                                        patchEditingBot({ provider: isAutoRouteProvider(editingBotProvider) ? editingBotProvider : 'auto', model: '' });
                                        return;
                                      }

                                      patchEditingBot({ provider: nextProvider, model: getPreferredSelectableModel(nextProvider, editingBotStarterPrompt, editingBotModel) });
                                    }} className={textInputClass}>
                                      <option value="">Inherit chat provider</option>
                                      {PROVIDERS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                    <select value={editingBotMemoryMode} onChange={event => patchEditingBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                                      <option value="shared">Shared memory</option>
                                      <option value="isolated">Isolated agent memory</option>
                                      <option value="none">No memory</option>
                                    </select>
                                  </>
                                ) : (
                                  <>
                                    <div className={`${textInputClass} flex items-center ${subtleTextClass}`}>Routing handled by the remote endpoint</div>
                                    <select value={editingBotMemoryMode} onChange={event => patchEditingBot({ memoryMode: event.target.value as 'shared' | 'isolated' | 'none' })} className={textInputClass}>
                                      <option value="shared">Shared memory</option>
                                      <option value="isolated">Isolated agent memory</option>
                                      <option value="none">No memory</option>
                                    </select>
                                  </>
                                )}
                                <div className="md:col-span-2">
                                  <select value={editingBotProvider && isAutoRouteProvider(editingBotProvider) ? editingBotProvider : editingBotModel} onChange={event => {
                                    if (!editingBotProvider) {
                                      patchEditingBot({ model: event.target.value });
                                      return;
                                    }

                                    if (isAutoRouteProvider(editingBotProvider)) {
                                      patchEditingBot({ provider: event.target.value });
                                      return;
                                    }

                                    patchEditingBot({ model: event.target.value });
                                  }} disabled={!editingBotProvider || editingBotExecutorType !== 'internal-llm'} className={`${textInputClass} ${!editingBotProvider || editingBotExecutorType !== 'internal-llm' ? (isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400') : ''}`}>
                                    {!editingBotProvider ? <option value="">Inherit provider default</option> : null}
                                    {editingBotProvider && isAutoRouteProvider(editingBotProvider)
                                      ? AUTO_ROUTE_OPTIONS.map(option => (
                                          <option key={option.value} value={option.value}>{option.label}</option>
                                        ))
                                      : null}
                                    {editingBotProvider && !isAutoRouteProvider(editingBotProvider) ? getSelectableModels(editingBotProvider, editingBotModel, true).map(option => (
                                      <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, editingBotProvider)}</option>
                                    )) : null}
                                  </select>
                                </div>
                                <div className="md:col-span-2">
                                  <textarea value={editingBotSystemPrompt} onChange={event => patchEditingBot({ systemPrompt: event.target.value })} rows={4} placeholder="System prompt: define the specialist role, operating rules, and decision standards" className={textareaClass} />
                                </div>
                                <div className="md:col-span-2">
                                  <textarea value={editingBotStarterPrompt} onChange={event => patchEditingBot({ starterPrompt: event.target.value })} rows={3} placeholder="Starter prompt, e.g. Review this feature end to end and prioritize the biggest risks" className={textareaClass} />
                                </div>
                                <div>
                                  <input type="number" min="1" max="100" value={editingBotMaxTurns} onChange={event => patchEditingBot({ maxTurns: event.target.value })} placeholder="Max turns (optional, e.g. 10)" className={textInputClass} />
                                </div>
                                <div className="md:col-span-2">
                                  <div className="flex flex-col gap-2">
                                    <div className={`text-xs ${subtleTextClass}`}>Tool definitions (optional) — listed in the system prompt so the LLM knows which tools are available</div>
                                    {editingBotTools.map((tool, idx) => (
                                      <div key={idx} className="flex gap-2 items-start">
                                        <input
                                          value={tool.name}
                                          onChange={event => patchEditingBot({ tools: editingBotTools.map((t, i) => i === idx ? { ...t, name: event.target.value } : t) })}
                                          placeholder="Tool name, e.g. search_web"
                                          className={textInputClass}
                                        />
                                        <input
                                          value={tool.description}
                                          onChange={event => patchEditingBot({ tools: editingBotTools.map((t, i) => i === idx ? { ...t, description: event.target.value } : t) })}
                                          placeholder="What this tool does"
                                          className={textInputClass}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => patchEditingBot({ tools: editingBotTools.filter((_, i) => i !== idx) })}
                                          className={`shrink-0 ${secondaryButtonClass}`}
                                          aria-label="Remove tool"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => patchEditingBot({ tools: [...editingBotTools, { name: '', description: '' }] })}
                                      className={secondaryButtonClass}
                                    >
                                      <Plus className="w-4 h-4" /> Add tool
                                    </button>
                                  </div>
                                </div>
                                <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  <button type="button" onClick={() => void saveEditedCustomBot(item.id)} disabled={isSaving} className={responsivePrimaryButtonClass}>
                                    <Save className="w-4 h-4" />
                                    {isSaving ? 'Saving...' : 'Save changes'}
                                  </button>
                                  <button type="button" onClick={stopEditingCustomBot} disabled={isSaving} className={responsiveSecondaryButtonClass}>
                                    Cancel
                                  </button>
                                  <button type="button" onClick={() => void deleteCustomBot(item)} disabled={isSaving || isDeleting} className={responsiveDestructiveButtonClass}>
                                    <Trash2 className="w-4 h-4" />
                                    {isDeleting ? 'Deleting...' : 'Delete agent'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className={`text-xs ${subtleTextClass}`}>Slash command: /{item.command}</div>
                                <div className={`text-xs ${subtleTextClass}`}>Task focus: {item.starterPrompt}</div>
                                <div className={`text-xs ${subtleTextClass}`}>Use when: {item.useWhen}</div>
                                <div className={`text-xs ${subtleTextClass}`}>Operating bounds: {item.boundaries}</div>
                                <div className={`text-xs ${subtleTextClass}`}>{getPresetActivationLabel(item)}</div>
                                <div className={`text-xs ${subtleTextClass}`}>{getPresetAutonomyLabel(item)}</div>
                                <div className={`text-xs ${subtleTextClass}`}>{getPresetRoutingLabel(item)}</div>
                                <div className={`text-xs ${subtleTextClass}`}>{getPresetMemoryLabel(item)}</div>
                                <div className={`text-xs ${subtleTextClass}`}>Executor: {getAgentExecutorLabel(item)}</div>
                                {getAgentEndpoint(item) ? <div className={`text-xs ${subtleTextClass}`}>Endpoint: {getAgentEndpoint(item)}</div> : null}
                                <div className={`text-xs ${subtleTextClass}`}>
                                  Provider: {getAgentExecutorType(item) === 'internal-llm' ? (item.provider ? formatProviderLabel(item.provider) : 'Inherit chat') : 'Remote endpoint'}
                                  {' · '}
                                  Model: {getAgentExecutorType(item) === 'internal-llm' ? (item.model ? formatModelDisplay(item.model, item.provider || undefined) : 'Inherit chat') : 'Handled remotely'}
                                  {' · '}
                                  Memory: {item.memoryMode || 'shared'}
                                </div>
                                {isConfirmingDelete ? (
                                  <div className={`rounded-[1rem] border px-3 py-3 text-sm ${isDarkMode ? 'border-red-900/60 bg-red-950/20 text-red-200' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                    Delete this custom agent?
                                    {isActive ? ' It is currently active, so Botty will clear the active agent mode after deletion.' : ''}
                                  </div>
                                ) : null}

                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                  <button
                                    onClick={() => void activateFunctionPreset(item, { startNewChat: true })}
                                    disabled={applyingFunctionId === item.id || isConfirmingDelete}
                                    className={responsivePrimaryButtonClass}
                                  >
                                    {applyingFunctionId === item.id ? 'Starting...' : 'Start agent chat'}
                                  </button>
                                  <button
                                    onClick={() => void activateFunctionPreset(item)}
                                    disabled={applyingFunctionId === item.id || isConfirmingDelete}
                                    className={responsiveSecondaryButtonClass}
                                  >
                                    {applyingFunctionId === item.id ? 'Starting...' : 'Use in current chat'}
                                  </button>
                                  <button type="button" onClick={() => startEditingCustomBot(item)} disabled={isDeleting || isConfirmingDelete} className={responsiveSecondaryButtonClass}>
                                    Edit agent
                                  </button>
                                  {isConfirmingDelete ? (
                                    <>
                                      <button type="button" onClick={() => void deleteCustomBot(item)} disabled={isDeleting} className={responsiveDestructiveButtonClass}>
                                        <Trash2 className="w-4 h-4" />
                                        {isDeleting ? 'Deleting...' : 'Confirm delete'}
                                      </button>
                                      <button type="button" onClick={cancelDeleteCustomBot} disabled={isDeleting} className={responsiveSecondaryButtonClass}>
                                        Cancel delete
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => requestDeleteCustomBot(item.id)} disabled={isDeleting} className={responsiveDestructiveButtonClass}>
                                      <Trash2 className="w-4 h-4" />
                                      Delete agent
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={`text-sm ${subtleTextClass}`}>No custom agents yet.</div>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === 'history' ? (
              <div className={`space-y-4 ${isFullscreen ? 'flex-1 overflow-auto min-h-0 pb-4' : ''}`}>
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
                        <div className={`text-xs uppercase tracking-[0.2em] ${subtleTextClass}`}>Agent memory facts</div>
                        <div className="mt-2 text-2xl font-semibold">{agentFactCounts.total}</div>
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
                          <h4 className="text-sm font-medium">{usagePeriod}-day trend</h4>
                          <div className="flex gap-1">
                            {([7, 30] as const).map(p => (
                              <button key={p} type="button" onClick={() => { usagePeriodRef.current = p; setUsagePeriod(p); void apiGet<UsageResponse>(`/api/usage?days=${p}`).then(d => setUsageTrend(Array.isArray(d.trend) ? d.trend : [])); }} className={`rounded px-2 py-0.5 text-xs transition-colors ${usagePeriod === p ? (isDarkMode ? 'bg-white/15 text-white' : 'bg-stone-900 text-white') : (isDarkMode ? 'text-stone-400 hover:text-stone-200' : 'text-stone-500 hover:text-stone-700')}`}>{p}d</button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <div className="flex flex-col justify-between pb-7 text-right">
                            <div className="text-[10px] leading-none opacity-60">{trendPeak.toLocaleString()}</div>
                            <div className="text-[10px] leading-none opacity-60">0</div>
                          </div>
                          <div className="flex flex-1 h-44 items-end gap-2">
                          {usageTrend.length > 0 ? usageTrend.map((entry, index) => {
                            const height = Math.max((entry.tokens / trendPeak) * 100, entry.tokens > 0 ? 10 : 4);
                            return (
                              <div key={entry.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                {usagePeriod === 7 ? <div className="text-[11px] leading-none opacity-70">{entry.tokens.toLocaleString()}</div> : null}
                                <div className={`w-full rounded-t-2xl ${isDarkMode ? 'bg-amber-300/70' : 'bg-stone-900/75'}`} style={{ height: `${height}%` }} />
                                <div className={`text-[11px] ${subtleTextClass}`}>{usagePeriod === 30 && index % 5 !== 0 && index !== usageTrend.length - 1 ? '' : entry.date.slice(5)}</div>
                              </div>
                            );
                          }) : <div className={`text-sm ${subtleTextClass}`}>No usage yet.</div>}
                          </div>
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

                <div className="flex gap-2">
                  <input
                    value={historySearch}
                    onChange={event => setHistorySearch(event.target.value)}
                    placeholder="Search conversations..."
                    className={`flex-1 ${textInputClass}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowArchivedHistory(v => !v)}
                    className={responsiveSecondaryButtonClass}
                    title={showArchivedHistory ? 'Show active conversations' : 'Show archived conversations'}
                  >
                    {showArchivedHistory ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    <span className="hidden sm:inline">{showArchivedHistory ? 'Active' : 'Archived'}</span>
                  </button>
                  {!showArchivedHistory && conversations.length > 0 ? (
                    confirmingClearHistory ? (
                      <>
                        <button type="button" onClick={() => void clearAllHistory()} className={`${responsiveSecondaryButtonClass} text-red-600 dark:text-red-400`}>Confirm clear</button>
                        <button type="button" onClick={() => setConfirmingClearHistory(false)} className={responsiveSecondaryButtonClass}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmingClearHistory(true)} className={responsiveSecondaryButtonClass} title="Clear all history">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )
                  ) : null}
                </div>

                {conversations.filter(item =>
                  !historySearch.trim() || item.items.some(entry =>
                    entry.prompt.toLowerCase().includes(historySearch.toLowerCase()) ||
                    entry.response.toLowerCase().includes(historySearch.toLowerCase())
                  ) || (conversationLabels[item.id] || '').toLowerCase().includes(historySearch.toLowerCase())
                ).sort((a, b) => {
                  const aPinned = pinnedConversations.has(a.id) ? 0 : 1;
                  const bPinned = pinnedConversations.has(b.id) ? 0 : 1;
                  return aPinned - bPinned;
                }).map(item => (
                  <div key={item.id} className={`${sectionCardClass} flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${pinnedConversations.has(item.id) ? (isDarkMode ? 'ring-1 ring-amber-400/30' : 'ring-1 ring-amber-400/60') : ''}`}>
                    <div className="min-w-0 flex-1">
                      {editingLabelId === item.id ? (
                        <form onSubmit={event => { event.preventDefault(); void saveConversationLabel(item.id, labelDraft); }} className="mb-2 flex gap-2">
                          <input
                            autoFocus
                            value={labelDraft}
                            onChange={event => setLabelDraft(event.target.value)}
                            placeholder="Rename this conversation…"
                            className={`flex-1 text-sm ${inputClass}`}
                          />
                          <button type="submit" className={responsivePrimaryButtonClass}>Save</button>
                          <button type="button" onClick={() => setEditingLabelId('')} className={responsiveSecondaryButtonClass}>Cancel</button>
                        </form>
                      ) : (
                        <button type="button" onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); }} className="w-full text-left">
                          <div className="text-sm font-medium line-clamp-2">
                            {conversationLabels[item.id] || item.items[0].prompt}
                          </div>
                          {conversationLabels[item.id] ? (
                            <div className={`mt-0.5 text-xs line-clamp-1 ${subtleTextClass}`}>{item.items[0].prompt}</div>
                          ) : null}
                        </button>
                      )}
                      <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${subtleTextClass}`}>
                        <span>{(() => { const t = item.items.reduce((s, e) => s + (e.tokensUsed || 0), 0); return t > 0 ? `${t.toLocaleString()} tokens total` : 'Tokens: unknown'; })()}</span>
                        <span>{new Date(item.items[0].timestamp).toLocaleString()}</span>
                        <span>{item.items.length} message pair{item.items.length === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 self-start sm:w-auto sm:flex-row lg:self-center">
                      {!showArchivedHistory ? <button onClick={() => { setEditingLabelId(item.id); setLabelDraft(conversationLabels[item.id] || ''); }} className={responsiveSecondaryButtonClass} title="Rename conversation"><Pencil className="w-4 h-4" /></button> : null}
                      {!showArchivedHistory ? <button onClick={() => void togglePinConversation(item.id)} className={`${responsiveSecondaryButtonClass} ${pinnedConversations.has(item.id) ? (isDarkMode ? 'text-amber-300' : 'text-amber-600') : ''}`} title={pinnedConversations.has(item.id) ? 'Unpin conversation' : 'Pin conversation'}><Pin className="w-4 h-4" /></button> : null}
                      <button onClick={() => loadConversation(item.id)} className={responsiveSecondaryButtonClass}>Open</button>
                      <button onClick={() => exportConversation(item)} className={responsiveSecondaryButtonClass} title="Export as Markdown">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => exportConversationCSV(item)} className={responsiveSecondaryButtonClass} title="Export as CSV">
                        <span className="text-xs font-medium">CSV</span>
                      </button>
                      {showArchivedHistory ? (
                        <button onClick={() => void unarchiveConversation(item.id)} className={responsiveSecondaryButtonClass} title="Restore conversation">
                          <ArchiveRestore className="w-4 h-4" />
                        </button>
                      ) : (
                        <button onClick={() => void archiveConversation(item.id)} className={responsiveSecondaryButtonClass} title="Archive conversation">
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => void deleteConversation(item.id)} className={responsiveDestructiveButtonClass}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {conversations.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved history yet.</div> : null}
                {conversations.length > 0 && historySearch.trim() && conversations.filter(item => item.items.some(entry => entry.prompt.toLowerCase().includes(historySearch.toLowerCase()) || entry.response.toLowerCase().includes(historySearch.toLowerCase())) || (conversationLabels[item.id] || '').toLowerCase().includes(historySearch.toLowerCase())).length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No conversations match your search.</div> : null}
              </div>
            ) : null}

            {activeTab === 'memory' ? (
              <div className={`space-y-4 ${isFullscreen ? 'flex-1 overflow-auto min-h-0 pb-4' : ''}`}>
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
                    <button onClick={() => importMemoryInputRef.current?.click()} disabled={isImportingMemory} className={responsiveSecondaryButtonClass}>
                      <Upload className="w-4 h-4" />
                      {isImportingMemory ? 'Restoring...' : 'Restore backup'}
                    </button>
                    <button onClick={() => void exportMemoryBackup()} disabled={isExportingMemory} className={responsivePrimaryButtonClass}>
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
                      <button onClick={() => void importMemoryBackup()} disabled={isImportingMemory} className={responsivePrimaryButtonClass}>
                        <Upload className="w-4 h-4" />
                        {isImportingMemory ? 'Restoring...' : 'Confirm restore'}
                      </button>
                      <button onClick={resetMemoryRestoreSelection} disabled={isImportingMemory} className={responsiveSecondaryButtonClass}>
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
                      <button className={responsivePrimaryButtonClass}>Add</button>
                      <button type="button" onClick={() => factImportRef.current?.click()} className={responsiveSecondaryButtonClass} title="Import facts from a .txt or .md file (one fact per line)">
                        <Upload className="w-4 h-4" />
                        Import
                      </button>
                    </form>
                    <input ref={factImportRef} type="file" accept=".txt,.md" className="hidden" onChange={event => void importFactsFromFile(event.target.files)} />
                    {facts.length > 4 ? (
                      <div className="mb-3 relative">
                        <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${subtleTextClass}`} />
                        <input value={factsSearch} onChange={event => setFactsSearch(event.target.value)} placeholder="Filter facts…" className={`w-full pl-7 text-sm ${inputClass}`} />
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      {facts.filter(item => !factsSearch.trim() || item.content.toLowerCase().includes(factsSearch.toLowerCase())).map(item => (
                        <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                          <div className="text-sm">{item.content}</div>
                          <button onClick={() => void deleteFact(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                      {facts.length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No saved facts yet.</div> : null}
                      {facts.length > 0 && factsSearch.trim() && facts.filter(item => item.content.toLowerCase().includes(factsSearch.toLowerCase())).length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No facts match your filter.</div> : null}
                    </div>
                  </section>

                  {customAgents.filter(agent => agent.memoryMode === 'isolated').map(agent => (
                    <section key={agent.id} className={sectionCardClass}>
                      <button
                        type="button"
                        className="mb-3 flex w-full items-center justify-between gap-3 text-left"
                        onClick={() => toggleAgentMemory(agent.id)}
                      >
                        <div>
                          <h3 className="font-medium">{agent.title} — isolated memory</h3>
                          <p className={`mt-0.5 text-xs ${subtleTextClass}`}>/{agent.command}</p>
                        </div>
                        <span className={`text-xs ${subtleTextClass}`}>{expandedAgentMemory[agent.id] ? '▲' : '▼'}</span>
                      </button>
                      {expandedAgentMemory[agent.id] ? (
                        <div className="space-y-2">
                          {(agentFacts[agent.id] || []).map(item => (
                            <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                              <div className="text-sm">{item.content}</div>
                              <button onClick={() => void deleteAgentFact(agent.id, item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                          {(agentFacts[agent.id] || []).length === 0 ? <div className={`text-sm ${subtleTextClass}`}>No isolated facts yet for this agent.</div> : null}
                          {(agentFacts[agent.id] || []).length > 0 ? (
                            <button
                              type="button"
                              onClick={() => void clearAgentFacts(agent.id)}
                              className={responsiveDestructiveButtonClass}
                            >
                              <Trash2 className="w-4 h-4" /> Clear all agent facts
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ))}

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
                    <button type="button" onClick={() => factFileInputRef.current?.click()} className={`mb-4 ${responsivePrimaryButtonClass}`}>
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
                      <button className={responsivePrimaryButtonClass}>Add</button>
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
              <div className={`space-y-4 ${isFullscreen ? 'flex-1 overflow-auto min-h-0 pb-4' : ''}`}>
                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <KeyRound className="w-4 h-4" />
                    <h3 className="font-medium">Provider keys</h3>
                  </div>
                  <div className={`mb-4 rounded-[0.9rem] border px-4 py-3 text-sm ${isDarkMode ? 'border-emerald-400/20 bg-emerald-500/8 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                    <strong>Free options:</strong> Local (Ollama) needs no key — just a running model. Google Gemini Flash has a generous free tier (1,500 requests/day) via <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="underline">aistudio.google.com</a>.
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {['anthropic', 'google', 'openai'].map(providerName => {
                      const saved = apiKeys.find(k => k.provider === providerName);
                      return (
                      <div key={providerName} className={`${elevatedCardClass} flex flex-col gap-3`}>
                        <div className="text-sm font-medium capitalize mb-2">{providerName}</div>
                        <input
                          value={keyInputs[providerName] || ''}
                          onChange={event => setKeyInputs(prev => ({ ...prev, [providerName]: event.target.value }))}
                          placeholder={saved ? saved.hint : `${providerName.toUpperCase()}_API_KEY`}
                          className={textInputClass}
                        />
                        <button onClick={() => void saveKey(providerName)} className={responsivePrimaryButtonClass} disabled={savingKey === providerName}>
                          {savingKey === providerName ? 'Saving...' : saved ? 'Replace key' : 'Save key'}
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-medium">Provider readiness</h3>
                      <p className={`mt-1 text-sm ${subtleTextClass}`}>See which providers are ready for auto route, which are missing keys, and whether the local endpoint is reachable.</p>
                    </div>
                    <div className={`text-xs ${subtleTextClass}`}>
                      {providerStatuses.filter(item => item.readiness === 'ready').length} ready
                      {' · '}
                      {providerStatuses.filter(item => item.readiness === 'missing').length} missing
                      {' · '}
                      {providerStatuses.filter(item => item.readiness === 'unreachable').length} unreachable
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {providerStatuses.map(item => (
                      <div key={item.provider} className={`${elevatedCardClass} flex flex-col gap-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">{formatProviderLabel(item.provider)}</div>
                            <div className={`mt-1 text-xs ${subtleTextClass}`}>{formatProviderSourceLabel(item.source)}</div>
                          </div>
                          <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${getProviderStatusTone(item.readiness)}`}>
                            {formatProviderReadinessLabel(item.readiness)}
                          </span>
                        </div>

                        <div className={`text-sm ${subtleTextClass}`}>{item.detail}</div>

                        <div className={`space-y-1 text-xs ${subtleTextClass}`}>
                          <div>Default model: {item.defaultModel ? formatModelDisplay(item.defaultModel, item.provider) : 'unknown'}</div>
                          {item.provider === 'local' ? <div>Endpoint: {item.localUrl || localUrl || 'unknown'}</div> : null}
                          {item.provider === 'local' ? <div>Installed models: {typeof item.modelCount === 'number' ? item.modelCount : 0}</div> : null}
                          <div>Auto route: {item.available ? 'eligible' : 'skipped'}</div>
                        </div>
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
                    <label htmlFor="local-llm-url" className={sectionLabelClass}>Local LLM URL</label>
                    <input id="local-llm-url" value={localUrl} onChange={event => setLocalUrl(event.target.value)} className={textInputClass} />
                  </div>

                  <div>
                    <label htmlFor="history-retention-days" className={sectionLabelClass}>History retention (days)</label>
                    <input
                      id="history-retention-days"
                      type="number"
                      min="1"
                      max="3650"
                      value={historyRetentionDays}
                      onChange={event => setHistoryRetentionDays(event.target.value)}
                      placeholder="No limit"
                      className={textInputClass}
                    />
                    <p className={`mt-1 text-xs ${subtleTextClass}`}>History older than this many days is pruned when you save settings. Leave blank to keep everything.</p>
                  </div>

                  <div>
                    <label htmlFor="system-prompt" className={sectionLabelClass}>System prompt</label>
                    <textarea id="system-prompt" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} onKeyDown={handleSystemPromptKeyDown} rows={6} className={textareaClass} />
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
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium">{telegramStatusLabel}</div>
                          <div className="text-xs mt-1 opacity-90">{telegramStatusDetails}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshTelegramStatus()}
                          className={responsiveSecondaryButtonClass}
                          disabled={loadingTelegramStatus}
                        >
                          <RefreshCw className={`w-4 h-4 ${loadingTelegramStatus ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendTelegramTest()}
                          className={responsiveSecondaryButtonClass}
                          disabled={sendingTelegramTest}
                          title="Send a test message to all configured chat IDs"
                        >
                          <Send className={`w-4 h-4 ${sendingTelegramTest ? 'opacity-50' : ''}`} />
                          Test
                        </button>
                      </div>
                    </div>

                    {telegramTestResult ? (
                      <div className={`lg:col-span-2 rounded-[1rem] border px-4 py-3 text-sm ${telegramTestResult.ok ? (isDarkMode ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : (isDarkMode ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-800')}`}>
                        {telegramTestResult.message}
                      </div>
                    ) : null}

                    <div className="lg:col-span-2">
                      <label htmlFor="telegram-bot-token" className={sectionLabelClass}>Bot token</label>
                      <input
                        id="telegram-bot-token"
                        type="password"
                        value={telegramBotToken}
                        onChange={event => setTelegramBotToken(event.target.value)}
                        placeholder="1234567890:AA..."
                        className={textInputClass}
                      />
                    </div>

                    <label className={`flex items-start gap-3 rounded-[1rem] px-1 py-1 text-sm sm:items-center ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                      <input type="checkbox" checked={telegramBotEnabled} onChange={event => setTelegramBotEnabled(event.target.checked)} />
                      <span>Enable Telegram bot polling</span>
                    </label>

                    <div>
                      <label htmlFor="telegram-allowed-chat-ids" className={sectionLabelClass}>Allowed chat IDs</label>
                      <input
                        id="telegram-allowed-chat-ids"
                        value={telegramAllowedChatIds}
                        onChange={event => setTelegramAllowedChatIds(event.target.value)}
                        placeholder="123456789,987654321"
                        className={textInputClass}
                      />
                    </div>

                    <div>
                      <label htmlFor="telegram-provider" className={sectionLabelClass}>Telegram provider</label>
                      <select id="telegram-provider" value={getProviderSelectValue(telegramProvider)} onChange={event => {
                        const nextProvider = event.target.value;
                        if (nextProvider === 'auto') {
                          setTelegramProvider(currentProvider => isAutoRouteProvider(currentProvider) ? currentProvider : 'auto');
                          setTelegramModel('');
                          return;
                        }

                        setTelegramProvider(nextProvider);
                        setTelegramModel('');
                      }} className={textInputClass}>
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="telegram-model" className={sectionLabelClass}>Telegram model override</label>
                      <select
                        id="telegram-model"
                        value={isAutoRouteProvider(telegramProvider) ? telegramProvider : telegramModel}
                        onChange={event => {
                          if (isAutoRouteProvider(telegramProvider)) {
                            setTelegramProvider(event.target.value);
                            return;
                          }

                          setTelegramModel(event.target.value);
                        }}
                        className={textInputClass}
                      >
                        {isAutoRouteProvider(telegramProvider)
                          ? AUTO_ROUTE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))
                          : getSelectableModels(telegramProvider, telegramModel, true).map(option => (
                              <option key={option || '__default__'} value={option}>{formatModelOptionLabel(option, telegramProvider)}</option>
                            ))}
                      </select>
                    </div>
                  </div>

                  <label className={`flex items-start gap-3 rounded-[1rem] ${elevatedCardClass} text-sm sm:items-center`}>
                    <input type="checkbox" checked={useMemory} onChange={event => setUseMemory(event.target.checked)} />
                    <span>Include saved memory in prompt construction</span>
                  </label>

                  <label className={`flex items-start gap-3 rounded-[1rem] ${elevatedCardClass} text-sm sm:items-center`}>
                    <input type="checkbox" checked={autoMemory} onChange={event => setAutoMemory(event.target.checked)} />
                    <span>Learn durable facts about me automatically from successful chats</span>
                  </label>

                  <button onClick={() => void saveSettings()} disabled={savingSettings} className={responsivePrimaryButtonClass}>
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

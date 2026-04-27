import { FormEvent, useEffect, useEffectEvent, useMemo, useRef, useReducer, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Archive,
  ArchiveRestore,
  Bookmark,
  Bot,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitBranch,
  Globe,
  History,
  KeyRound,
  Layers,
  Link,
  Link2Off,
  LogOut,
  Mail,
  Maximize2,
  Menu,
  MemoryStick,
  MoreHorizontal,
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
  Share2,
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
import { parseArtifacts, hasArtifacts } from './utils/artifacts';
import AppContext from './contexts/AppContext';
import ChatPanel from './components/panels/ChatPanel';
import HistoryPanel from './components/panels/HistoryPanel';
import MemoryPanel from './components/panels/MemoryPanel';
import SettingsPanel from './components/panels/SettingsPanel';

// ---------------------------------------------------------------------------
// Artifact language set (shared by ArtifactBlock and MarkdownMessage)
// ---------------------------------------------------------------------------
const ARTIFACT_LANG_SET = new Set(['html', 'tsx', 'jsx', 'svg', 'vue', 'svelte']);

// ---------------------------------------------------------------------------
// ArtifactBlock — sandboxed iframe preview of HTML/TSX/SVG code blocks
// ---------------------------------------------------------------------------
function ArtifactBlock({ lang, code, isDark }: { lang: string; code: string; isDark: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  const iframeContent = lang === 'svg'
    ? `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${isDark ? '#1a1d20' : '#fff'}}</style></head><body>${code}</body></html>`
    : /<!doctype html/i.test(code)
      ? code
      : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:16px;background:${isDark ? '#1a1d20' : '#fff'};color:${isDark ? '#e7e5e4' : '#171717'}}</style></head><body>${code}</body></html>`;

  return (
    <div className={`mt-3 rounded-xl border overflow-hidden ${isDark ? 'border-white/10' : 'border-stone-200'}`}>
      <div className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${isDark ? 'bg-white/5 text-stone-400' : 'bg-stone-100 text-stone-500'}`}>
        <span className="font-mono uppercase tracking-widest">{lang}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => setShown(v => !v)}
            className="opacity-60 hover:opacity-100 transition-opacity font-medium"
          >
            {shown ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
      </div>
      <pre className={`overflow-x-auto p-3 text-xs leading-5 font-mono ${isDark ? 'bg-[#0f1113] text-stone-300' : 'bg-stone-50 text-stone-800'}`}><code>{code}</code></pre>
      {shown ? (
        <iframe
          title={`artifact-${lang}`}
          sandbox="allow-scripts"
          srcDoc={iframeContent}
          className="w-full border-t"
          style={{ height: '340px', background: isDark ? '#1a1d20' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e7e5e4' }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarkdownMessage — renders assistant message content as formatted markdown
// ---------------------------------------------------------------------------
function MarkdownMessage({ content, isDark }: { content: string; isDark: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          // Make pre transparent; code component handles the block wrapper
          return <>{children}</>;
        },
        code({ children, className }) {
          const match = /language-(\w+)/.exec(className || '');
          const lang = match?.[1]?.toLowerCase() ?? '';
          const code = String(children ?? '').replace(/\n$/, '');
          if (match) {
            if (ARTIFACT_LANG_SET.has(lang)) {
              return <ArtifactBlock lang={lang} code={code} isDark={isDark} />;
            }
            return (
              <pre className={`my-3 overflow-x-auto rounded-xl border p-3 text-xs leading-5 font-mono ${isDark ? 'bg-[#0f1113] border-white/10 text-stone-300' : 'bg-stone-50 border-stone-200 text-stone-800'}`}>
                <code className="font-mono">{code}</code>
              </pre>
            );
          }
          return (
            <code className={`rounded px-1 py-0.5 text-[0.85em] font-mono ${isDark ? 'bg-white/10 text-rose-200' : 'bg-stone-100 text-rose-700'}`}>
              {children}
            </code>
          );
        },
        p({ children }) { return <p className="mb-3 last:mb-0">{children}</p>; },
        ul({ children }) { return <ul className="mb-3 ml-4 list-disc space-y-1">{children}</ul>; },
        ol({ children }) { return <ol className="mb-3 ml-4 list-decimal space-y-1">{children}</ol>; },
        li({ children }) { return <li className="leading-6">{children}</li>; },
        h1({ children }) { return <h1 className="mb-3 mt-4 text-lg font-bold first:mt-0">{children}</h1>; },
        h2({ children }) { return <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>; },
        h3({ children }) { return <h3 className="mb-2 mt-3 text-sm font-semibold first:mt-0">{children}</h3>; },
        blockquote({ children }) {
          return (
            <blockquote className={`my-3 border-l-2 pl-3 italic ${isDark ? 'border-stone-500 text-stone-400' : 'border-stone-300 text-stone-500'}`}>
              {children}
            </blockquote>
          );
        },
        hr() { return <hr className={`my-4 ${isDark ? 'border-white/10' : 'border-stone-200'}`} />; },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={`underline ${isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-700'}`}>
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="my-3 overflow-x-auto">
              <table className="text-sm border-collapse w-full">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return <th className={`border px-3 py-1.5 text-left font-semibold text-sm ${isDark ? 'border-white/10 bg-white/5' : 'border-stone-200 bg-stone-100'}`}>{children}</th>;
        },
        td({ children }) {
          return <td className={`border px-3 py-1.5 text-sm ${isDark ? 'border-white/10' : 'border-stone-200'}`}>{children}</td>;
        },
        strong({ children }) { return <strong className="font-semibold">{children}</strong>; },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

const MAX_RECENT_SLASH_ITEMS = 4;

// ---------------------------------------------------------------------------
// Project color utilities
// ---------------------------------------------------------------------------
import {
  PROJECT_COLOR_PRESETS,
  type ProjectColor,
  getProjectActivePill,
  getProjectDotClass,
  getProjectBadgeClass,
} from './utils/projectColors';

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
  projectId?: string | null;
  isArchived?: boolean | null;
  timestamp: string;
};

type Project = {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Fact = {
  id: string;
  content: string;
  timestamp: string;
};

type PromptTemplate = {
  id: string;
  title: string;
  text: string;
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
  telegramDigestEnabled?: boolean;
  telegramDigestHour?: number | null;
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
  const [interimTranscript, setInterimTranscript] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [defaultLocalModel, setDefaultLocalModel] = useState(DEFAULT_MODELS.local);
  const [modelCatalog, setModelCatalog] = useState<Record<string, string[]>>(DEFAULT_MODEL_CATALOG);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);

  // Ollama model management
  type OllamaModel = { name: string; size: number; details?: { parameter_size?: string; family?: string } };
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');
  const [ollamaPullName, setOllamaPullName] = useState('');
  const [ollamaPullLog, setOllamaPullLog] = useState('');
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const [ollamaDeleting, setOllamaDeleting] = useState('');

  type RagDocument = { name: string; chunks: number; createdAt: string };
  const [ragDocuments, setRagDocuments] = useState<RagDocument[]>([]);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragUploadError, setRagUploadError] = useState('');
  const [ragDeleting, setRagDeleting] = useState('');
  const ragFileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [sessionSystemPrompt, setSessionSystemPrompt] = useState('');
  const [memorySuggestion, setMemorySuggestion] = useState<{ messageIndex: number; suggestions: string[]; loading: boolean; saved: boolean } | null>(null);
  const [showArchivedHistory, setShowArchivedHistory] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectFilter, setActiveProjectFilter] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [editingProject, setEditingProject] = useState<Partial<Project>>({});
  const [newProjectColor, setNewProjectColor] = useState<string>('stone');
  const [newProjectSystemPrompt, setNewProjectSystemPrompt] = useState('');
  const [assigningConvId, setAssigningConvId] = useState('');
  const [openConvMenuId, setOpenConvMenuId] = useState('');
  const [factsSearch, setFactsSearch] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [sidebarSearchFocused, setSidebarSearchFocused] = useState(false);
  const [conversationLabels, setConversationLabels] = useState<Record<string, string>>({});
  const [pinnedConversations, setPinnedConversations] = useState<Set<string>>(new Set());
  const [conversationModels, setConversationModels] = useState<Record<string, { provider: string; model: string }>>({});
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');
  // Google integration
  const [googleCredentialsSaving, setGoogleCredentialsSaving] = useState(false);
  const [googleClientIdInput, setGoogleClientIdInput] = useState('');
  const [googleClientSecretInput, setGoogleClientSecretInput] = useState('');
  const [googleStatus, setGoogleStatus] = useState<{ credentialsConfigured: boolean; connected: boolean; email: string | null } | null>(null);
  const [googleNotice, setGoogleNotice] = useState('');
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
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [tavilyConfigured, setTavilyConfigured] = useState(false);
  const [attachedRagDoc, setAttachedRagDoc] = useState('');
  const [showRagDocMenu, setShowRagDocMenu] = useState(false);
  // Sharing state
  const [sharingConvId, setSharingConvId] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [historyRetentionDays, setHistoryRetentionDays] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotEnabled, setTelegramBotEnabled] = useState(true);
  const [telegramAllowedChatIds, setTelegramAllowedChatIds] = useState('');
  const [telegramProvider, setTelegramProvider] = useState('auto');
  const [telegramModel, setTelegramModel] = useState('');
  const [telegramDigestEnabled, setTelegramDigestEnabled] = useState(false);
  const [telegramDigestHour, setTelegramDigestHour] = useState('9');
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
  const newSkillSystemPrompt = newSkill.systemPrompt;

  const { state: newBot, patch: patchNewBot, reset: resetNewBot } = useNewBotFormReducer();
  const newBotTitle = newBot.title;
  const newBotDescription = newBot.description;
  const newBotCommand = newBot.command;
  const newBotProvider = newBot.provider;
  const newBotModel = newBot.model;
  const newBotMemoryMode = newBot.memoryMode;
  const newBotExecutorType = newBot.executorType;
  const newBotEndpoint = newBot.endpoint;
  const newBotSystemPrompt = newBot.systemPrompt;
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
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null);
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
    {
      id: 'command-imagine',
      command: 'imagine',
      title: 'Generate Image',
      description: 'Generate an image with DALL-E 3. Type your description after /imagine.',
      detail: 'Requires an OpenAI API key. Uses DALL-E 3 at 1024×1024.',
      badge: 'DALL-E 3',
      keywords: ['image', 'dalle', 'generate', 'draw', 'picture', 'art'],
      category: 'command' as const,
    },
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



  async function scanLocalAgents(): Promise<Array<Record<string, unknown>>> {
    const data = await apiGet<{ agents: Array<Record<string, unknown>> }>('/api/settings/local-agents/scan');
    return data.agents;
  }

  async function createLocalAgent(manifest: { title: string; command: string; description: string; systemPrompt: string; port: number }): Promise<void> {
    await apiSend('/api/settings/functions', 'POST', {
      kind: 'agent',
      title: manifest.title,
      command: manifest.command,
      description: manifest.description,
      systemPrompt: manifest.systemPrompt,
      executorType: 'local-agent',
      endpoint: `http://localhost:${manifest.port}/`,
      memoryMode: 'shared',
    });
    await refreshAll();
  }

  function getAgentExecutorType(agent: FunctionPreset | AgentDefinition): AgentExecutorType {
    if ('executorType' in agent) {
      if (agent.executorType === 'remote-http') return 'remote-http';
      if (agent.executorType === 'local-agent') return 'local-agent';
    }
    return 'internal-llm';
  }

  function getAgentEndpoint(agent: FunctionPreset | AgentDefinition) {
    return 'endpoint' in agent && typeof agent.endpoint === 'string' ? agent.endpoint : '';
  }

  function getAgentExecutorLabel(agent: FunctionPreset | AgentDefinition) {
    const t = getAgentExecutorType(agent);
    if (t === 'remote-http') return 'Remote HTTP agent';
    if (t === 'local-agent') return 'Local agent';
    return 'Internal Botty agent';
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

      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setIsSidebarExpanded(true);
        setHasSidebarPreference(true);
        setTimeout(() => sidebarSearchRef.current?.focus(), 50);
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

      if ((event.ctrlKey || event.metaKey) && event.key === 'f' && activeTab === 'chat') {
        event.preventDefault();
        setShowChatSearch(v => !v);
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

    setHistoryLoading(true);
    apiGet<HistoryEntry[]>(showArchivedHistory ? '/api/history?archived=true' : '/api/history')
      .then(rows => { setHistory(rows); setHistoryLoading(false); })
      .catch(err => { setHistoryLoading(false); setNotice(err instanceof Error ? err.message : 'Failed to load history'); });
    apiGet<Project[]>('/api/projects')
      .then(rows => setProjects(rows))
      .catch(() => {});
  }, [showArchivedHistory]);

  useEffect(() => {
    if (!user || activeTab !== 'settings') {
      return;
    }

    void refreshTelegramStatus();
    void loadGoogleStatus();
    apiGet<{ configured: boolean }>('/api/settings/search-status')
      .then(r => setTavilyConfigured(r.configured))
      .catch(() => {});
    void loadOllamaModels();
  }, [user, activeTab]);

  // Handle OAuth redirects (Google callback adds ?google=connected or ?google=error)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get('google');
    if (googleResult) {
      // Strip the query param without a full page reload
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      if (googleResult === 'connected') {
        setActiveTab('settings');
        void loadGoogleStatus();
        setGoogleNotice('Google account connected successfully!');
      } else {
        const reason = params.get('reason') || 'unknown';
        setActiveTab('settings');
        setGoogleNotice(`Google connection failed: ${reason}`);
      }
    }
  }, [user]);

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

  /** Extract tool names mentioned in an LLM response. Matches patterns like:
   *  - **Tool: name** or **Tool: name**
   *  - [TOOL: name] or [Tool: name]
   *  - Using tool: name
   */
  function parseToolSteps(text: string): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    const patterns = [
      /\[(?:TOOL|Tool|tool):\s*([^\]]{1,60})\]/g,
      /\*\*(?:Tool|TOOL|tool):\s*([^*]{1,60})\*\*/g,
      /using tool[:\s]+([^\n.]{1,60})/gi,
      /calling tool[:\s]+([^\n.]{1,60})/gi,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const name = m[1].trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          results.push(name);
        }
      }
    }
    return results;
  }

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
    setHistoryLoading(true);
    const [historyRows, factRows, fileRows, urlRows, functionsData, keyRows, usageData, settingsData, userSettingsData, providersData, agentCountsData, ragDocsData] = await Promise.all([
      apiGet<HistoryEntry[]>(showArchivedHistory ? '/api/history?archived=true' : '/api/history'),
      apiGet<Fact[]>('/api/memory/facts'),
      apiGet<MemoryFile[]>('/api/memory/files'),
      apiGet<MemoryUrl[]>('/api/memory/urls'),
      apiGet<FunctionCatalogResponse>('/api/settings/functions'),
      apiGet<ApiKey[]>('/api/keys'),
      apiGet<UsageResponse>(`/api/usage?days=${usagePeriodRef.current}`),
      apiGet<SettingsResponse>('/api/settings'),
      apiGet<{ systemPrompt?: string | null; customSkills?: FunctionPreset[]; customAgents?: AgentDefinition[]; conversationLabels?: Record<string, string> | null; conversationModels?: Record<string, { provider: string; model: string }> | null; pinnedConversations?: string[] | null; promptTemplates?: PromptTemplate[] | null }>('/api/settings/user-settings'),
      apiGet<ProvidersResponse>('/api/chat/providers'),
      apiGet<{ total: number; counts: Record<string, number> }>('/api/memory/facts/agent-counts'),
      apiGet<{ documents: RagDocument[] }>('/api/rag/documents').catch(() => ({ documents: [] })),
    ]);

    setHistory(historyRows);
    setFacts(factRows);
    setMemoryFiles(fileRows);
    setMemoryUrls(urlRows);
    setAgentFactCounts(agentCountsData || { total: 0, counts: {} });
    setRagDocuments(ragDocsData.documents || []);
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
    setPromptTemplates(Array.isArray(userSettingsData.promptTemplates) ? userSettingsData.promptTemplates : []);
    // Load Google integration status
    void loadGoogleStatus();
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
    setTelegramDigestEnabled(settingsData.telegramDigestEnabled === true);
    setTelegramDigestHour(String(settingsData.telegramDigestHour ?? 9));
    setKeyInputs({
      anthropic: '',
      google: '',
      openai: '',
    });

    if (nextProviders.length === 1 && nextProviders[0] === 'local') {
      setProvider('local');
      setModel(nextLocalModel);
      setHistoryLoading(false);
      return;
    }

    if (!isAutoRouteProvider(provider) && nextProviders.includes(provider)) {
      setModel(currentModel => getPreferredSelectableModel(provider, prompt, currentModel, nextModelCatalog));
    }

    if (!isAutoRouteProvider(provider) && !nextProviders.includes(provider)) {
      setProvider('auto');
      setModel('');
    }
    setHistoryLoading(false);
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

    // /imagine <description> — generate image via DALL-E 3
    const imagineMatch = text.match(/^\/imagine\s+(.+)/is);
    if (imagineMatch) {
      const imagePrompt = imagineMatch[1].trim();
      const displayPrompt = `/imagine ${imagePrompt}`;
      dispatchChat({ type: 'ADD_USER_MESSAGE', content: displayPrompt });
      setPrompt('');
      dispatchChat({ type: 'SET_SENDING', value: true });
      dispatchChat({ type: 'ADD_ASSISTANT_PLACEHOLDER' });
      try {
        const res = await fetch('/api/chat/generate-image', {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: imagePrompt }),
        });
        const data = await res.json() as { b64?: string; revisedPrompt?: string; error?: string };
        if (!res.ok || data.error) throw new Error(data.error || 'Image generation failed');
        const imgContent = `![generated](data:image/png;base64,${data.b64})${data.revisedPrompt ? `\n\n*Revised prompt: ${data.revisedPrompt}*` : ''}`;
        dispatchChat({ type: 'FINALIZE_ASSISTANT', content: imgContent, model: 'dall-e-3', provider: 'openai', routingMode: null, tokensUsed: 0, conversationId: conversationId || '' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image generation failed';
        dispatchChat({ type: 'FINALIZE_ASSISTANT', content: `Error: ${msg}`, model: 'dall-e-3', provider: 'openai', routingMode: null, tokensUsed: 0, conversationId: conversationId || '' });
      } finally {
        dispatchChat({ type: 'SET_SENDING', value: false });
        setPendingAttachments([]);
      }
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
      webSearch: webSearchEnabled,
      ragDocName: attachedRagDoc || undefined,
      sessionSystemPrompt: sessionSystemPrompt.trim() || undefined,
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
      let meta: { id: string; text: string; tokensUsed: number; model: string; provider: string; conversationId: string; routingMode: string | null; ragSources?: string[] } | null = null;

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
          ragSources: meta.ragSources || [],
          toolSteps: parseToolSteps(meta.text),
        });
        setDailyTokens(prev => prev + meta!.tokensUsed);
        if (meta.conversationId && meta.provider && meta.model) {
          const nextModels = { ...conversationModels, [meta.conversationId]: { provider: meta.provider, model: meta.model } };
          setConversationModels(nextModels);
          void apiSend('/api/settings/user-settings', 'POST', { conversationModels: nextModels });
        }
        // Auto-title: fire on the first exchange of a new conversation (no prior messages)
        if (meta.conversationId && messages.length === 0 && !conversationLabels[meta.conversationId]) {
          void (async () => {
            try {
              const res = await fetch('/api/history/auto-title', {
                method: 'POST',
                headers: { ...authHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: meta!.conversationId, prompt: text }),
              });
              const data = await res.json() as { title?: string | null };
              if (data.title) {
                setConversationLabels(prev => ({ ...prev, [meta!.conversationId]: data.title! }));
              }
            } catch { /* best-effort, silent */ }
          })();
        }
      }

      // Auto-compact when conversation grows long (20+ messages).
      // The compact endpoint streams SSE chunks; we read the stream and apply
      // the summary when the 'done' event arrives.
      if (messages.length + 2 >= 20) {
        const nonCompact = messages.filter(m => !m.isCompact);
        // Capture the conversation ID now so we can guard against applying a
        // stale compact to a new chat that starts before the response arrives.
        const compactConvId = meta?.conversationId ?? conversationId;
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
                    dispatchChat({ type: 'COMPACT_HISTORY', summary: event.summary, keepLast: 8, conversationId: compactConvId });
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
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        setPrompt(current => current.trim() ? `${current.trim()} ${finalTranscript.trim()}` : finalTranscript.trim());
        setInterimTranscript('');
      } else if (interim) {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
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
      // starterPrompt removed — no longer pre-fills the chat input
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
          'executorType' in item && item.executorType === 'remote-http' ? 'Executor: remote' : 'executorType' in item && item.executorType === 'local-agent' ? 'Executor: local' : null,
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
    const systemPromptValue = newSkillSystemPrompt.trim();

    if (!title || !description || !command || !systemPromptValue) {
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
        useWhen: null,
        boundaries: null,
        systemPrompt: systemPromptValue,
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
    const providerValue = newBotProvider.trim().toLowerCase();
    const modelValue = newBotModel.trim();
    const endpointValue = newBotEndpoint.trim();
    const systemPromptValue = newBotSystemPrompt.trim();
    const parsedMaxTurns = parseInt(newBotMaxTurns, 10);
    const maxTurnsValue = Number.isFinite(parsedMaxTurns) && parsedMaxTurns > 0 ? parsedMaxTurns : null;

    if (!title || !description || !command || !systemPromptValue) {
      setNotice('Fill in all agent fields before saving.');
      return;
    }

    if (RESERVED_SLASH_COMMANDS.has(command) || usedCommands.has(command)) {
      setNotice('That slash command is already in use.');
      return;
    }

    if ((newBotExecutorType === 'remote-http' || newBotExecutorType === 'local-agent') && !endpointValue) {
      setNotice('Local/remote agents require an endpoint URL.');
      return;
    }

    setCreatingFunction('agent');
    try {
      await apiSend('/api/settings/functions', 'POST', {
        kind: 'agent',
        title,
        description,
        command,
        useWhen: null,
        boundaries: null,
        provider: newBotExecutorType === 'internal-llm' ? (providerValue || null) : null,
        model: newBotExecutorType === 'internal-llm' ? (modelValue || null) : null,
        memoryMode: newBotMemoryMode,
        executorType: newBotExecutorType,
        endpoint: (newBotExecutorType === 'remote-http' || newBotExecutorType === 'local-agent') ? endpointValue : null,
        systemPrompt: systemPromptValue,
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
    const parsedMaxTurns = parseInt(editingBotMaxTurns, 10);
    const maxTurnsValue = Number.isFinite(parsedMaxTurns) && parsedMaxTurns > 0 ? parsedMaxTurns : null;
    const commandTaken = allPresets.some(item => item.id !== agentId && item.command === command);

    if (!title || !description || !command || !systemPromptValue) {
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

  async function shareConversation(convId: string) {
    if (shareLoading) return;
    setShareLoading(true);
    setSharingConvId(convId);
    setShareLink('');
    try {
      const res = await apiSend<{ token: string }>(`/api/shares/${convId}`, 'POST', {});
      const origin = window.location.origin;
      setShareLink(`${origin}/share/${res.token}`);
    } catch {
      setShareLink('error');
    } finally {
      setShareLoading(false);
    }
  }

  async function revokeShare(convId: string) {
    await apiSend(`/api/shares/${convId}`, 'DELETE');
    if (sharingConvId === convId) {
      setSharingConvId('');
      setShareLink('');
    }
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const proj = await apiSend<Project>('/api/projects', 'POST', {
      name,
      color: newProjectColor,
      systemPrompt: newProjectSystemPrompt.trim() || null,
    });
    setProjects(prev => [proj, ...prev]);
    setNewProjectName('');
    setNewProjectColor('stone');
    setNewProjectSystemPrompt('');
    setCreatingProject(false);
  }

  async function updateProject(id: string, patch: Partial<Project>) {
    const updated = await apiSend<Project>(`/api/projects/${id}`, 'PUT', patch);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
    setEditingProjectId('');
    setEditingProject({});
  }

  async function deleteProject(id: string) {
    await apiSend(`/api/projects/${id}`, 'DELETE');
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectFilter === id) setActiveProjectFilter(null);
    setHistory(prev => prev.map(h => h.projectId === id ? { ...h, projectId: null } : h));
  }

  async function assignConversationToProject(convId: string, projectId: string | null) {
    await apiSend(`/api/projects/assign/${convId}`, 'PUT', { projectId });
    setHistory(prev => prev.map(h => h.conversationId === convId ? { ...h, projectId } : h));
    setAssigningConvId('');
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

  async function savePromptTemplate(title: string, text: string) {
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    if (!trimmedTitle || !trimmedText) return;
    const next = [...promptTemplates, { id: crypto.randomUUID(), title: trimmedTitle, text: trimmedText }];
    setPromptTemplates(next);
    setNewTemplateTitle('');
    setNewTemplateText('');
    await apiSend('/api/settings/user-settings', 'POST', { promptTemplates: next });
  }

  async function deletePromptTemplate(id: string) {
    const next = promptTemplates.filter(t => t.id !== id);
    setPromptTemplates(next);
    await apiSend('/api/settings/user-settings', 'POST', { promptTemplates: next });
  }

  function applyPromptTemplate(text: string) {
    setPrompt(text);
    setShowTemplatesMenu(false);
    setTimeout(() => composerTextareaRef.current?.focus(), 50);
  }

  // ── Google integration ──────────────────────────────────────────────────

  async function loadGoogleStatus() {
    try {
      const data = await apiGet<{ credentialsConfigured: boolean; connected: boolean; email: string | null }>('/api/google/status');
      setGoogleStatus(data);
    } catch { /* non-fatal */ }
  }

  async function saveGoogleCredentials() {
    if (!googleClientIdInput.trim() || !googleClientSecretInput.trim()) return;
    setGoogleCredentialsSaving(true);
    setGoogleNotice('');
    try {
      await apiSend('/api/google/credentials', 'POST', {
        clientId: googleClientIdInput.trim(),
        clientSecret: googleClientSecretInput.trim(),
      });
      setGoogleClientIdInput('');
      setGoogleClientSecretInput('');
      await loadGoogleStatus();
      setGoogleNotice('Credentials saved. Click "Connect Google account" to authorise.');
    } catch (err) {
      setGoogleNotice(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setGoogleCredentialsSaving(false);
    }
  }

  function startGoogleOAuth() {
    // Pass JWT as a query param — window.open can't send Authorization headers
    const authUrl = `/api/google/auth?token=${encodeURIComponent(token)}`;
    window.open(authUrl, '_blank', 'noopener');
    setGoogleNotice('Authorisation opened in a new tab. Return here after approving access.');
  }

  async function disconnectGoogle() {
    setGoogleNotice('');
    try {
      await apiSend('/api/google/disconnect', 'DELETE');
      await loadGoogleStatus();
      setGoogleNotice('Google account disconnected.');
    } catch (err) {
      setGoogleNotice(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }

  // ── end Google integration ──────────────────────────────────────────────

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

  async function uploadRagDocument(file: File) {
    setRagUploading(true);
    setRagUploadError('');
    try {
      const text = await file.text();
      if (!text.trim()) { setRagUploadError('File has no text content.'); return; }
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, text }),
      });
      const data = await res.json() as { ok?: boolean; chunks?: number; error?: string };
      if (!res.ok || data.error) { setRagUploadError(data.error || 'Upload failed'); return; }
      await refreshAll();
    } catch (err) {
      setRagUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setRagUploading(false);
      if (ragFileInputRef.current) ragFileInputRef.current.value = '';
    }
  }

  async function deleteRagDocument(name: string) {
    setRagDeleting(name);
    try {
      await apiSend(`/api/rag/documents/${encodeURIComponent(name)}`, 'DELETE');
      await refreshAll();
    } finally {
      setRagDeleting('');
    }
  }

  async function loadOllamaModels() {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      type OllamaModel = { name: string; size: number; details?: { parameter_size?: string; family?: string } };
      const data = await apiGet<{ models: OllamaModel[] }>('/api/settings/ollama-models');
      setOllamaModels(data.models || []);
    } catch (err) {
      setOllamaModelsError(err instanceof Error ? err.message : 'Cannot reach Ollama');
    } finally {
      setOllamaModelsLoading(false);
    }
  }

  async function pullOllamaModel() {
    const name = ollamaPullName.trim();
    if (!name) return;
    setOllamaPulling(true);
    setOllamaPullLog('Starting pull…');
    try {
      const response = await fetch('/api/settings/ollama-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('botty.token') || ''}` },
        body: JSON.stringify({ name }),
      });
      if (!response.ok || !response.body) {
        setOllamaPullLog(`Error: ${response.status}`);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lastStatus = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line) as { status?: string; completed?: number; total?: number };
            const pct = json.total ? ` (${Math.round((json.completed || 0) / json.total * 100)}%)` : '';
            lastStatus = (json.status || '') + pct;
          } catch { /* skip malformed */ }
        }
        setOllamaPullLog(lastStatus);
      }
      setOllamaPullLog('Done!');
      setOllamaPullName('');
      await loadOllamaModels();
    } catch (err) {
      setOllamaPullLog(err instanceof Error ? err.message : 'Pull failed');
    } finally {
      setOllamaPulling(false);
    }
  }

  async function deleteOllamaModel(name: string) {
    setOllamaDeleting(name);
    try {
      await apiSend(`/api/settings/ollama-models/${encodeURIComponent(name)}`, 'DELETE');
      await loadOllamaModels();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setOllamaDeleting('');
    }
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
          telegramDigestEnabled,
          telegramDigestHour: Number(telegramDigestHour) || 9,
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
        telegramDigestEnabled,
        telegramDigestHour: Number(telegramDigestHour) || 9,
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
  const workspaceShellClass = `grid w-full gap-3 md:gap-4 ${isSidebarExpanded ? 'md:grid-cols-[264px_minmax(0,1fr)]' : 'md:grid-cols-[84px_minmax(0,1fr)]'} ${isFullscreen ? 'h-dvh overflow-hidden' : 'min-h-dvh'} md:transition-[grid-template-columns] md:duration-200`;
  const sidebarPanelClass = isDarkMode
    ? `flex flex-col gap-3 rounded-[1.35rem] border border-white/6 bg-[#15171a] p-4 text-stone-100 shadow-[0_8px_18px_rgba(0,0,0,0.12)] max-md:fixed max-md:inset-y-3 max-md:left-3 max-md:z-40 max-md:w-[280px] max-md:transition-transform max-md:duration-200 ${isSidebarDrawerOpen ? '' : 'max-md:-translate-x-[calc(100%+1rem)]'} md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:w-auto md:transition-[width,padding,transform] ${isSidebarExpanded ? 'md:px-3.5 md:py-3.5' : 'md:px-2.5 md:py-3.5'}`
    : `flex flex-col gap-3 rounded-[1.35rem] border border-stone-200 bg-[#f7f4ee] p-4 text-stone-900 shadow-[0_6px_16px_rgba(36,29,18,0.05)] max-md:fixed max-md:inset-y-3 max-md:left-3 max-md:z-40 max-md:w-[280px] max-md:transition-transform max-md:duration-200 ${isSidebarDrawerOpen ? '' : 'max-md:-translate-x-[calc(100%+1rem)]'} md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:w-auto md:transition-[width,padding,transform] ${isSidebarExpanded ? 'md:px-3.5 md:py-3.5' : 'md:px-2.5 md:py-3.5'}`;
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


  // ---------------------------------------------------------------------------
  // App context value — passed to panel components via React Context
  // ---------------------------------------------------------------------------
  const ctxVal = {
    isDarkMode, setIsDarkMode,
    token, setToken,
    user, setUser,
    authLoading, setAuthLoading,
    authError, setAuthError,
    loginEmail, setLoginEmail,
    loginName, setLoginName,
    activeTab, setActiveTab,
    provider, setProvider,
    model, setModel,
    prompt, setPrompt,
    chatState, dispatchChat,
    messages, conversationId, isSending, chatError,
    setConversationId, setMessages, setIsSending, setChatError,
    isListening, setIsListening,
    interimTranscript, setInterimTranscript,
    availableProviders, setAvailableProviders,
    defaultLocalModel, setDefaultLocalModel,
    modelCatalog, setModelCatalog,
    providerStatuses, setProviderStatuses,
    isRefreshingModels, setIsRefreshingModels,
    ollamaModels, setOllamaModels,
    ollamaModelsLoading, setOllamaModelsLoading,
    ollamaModelsError, setOllamaModelsError,
    ollamaPullName, setOllamaPullName,
    ollamaPullLog, setOllamaPullLog,
    ollamaPulling, setOllamaPulling,
    ollamaDeleting, setOllamaDeleting,
    ragDocuments, setRagDocuments,
    ragUploading, setRagUploading,
    ragUploadError, setRagUploadError,
    ragDeleting, setRagDeleting,
    history, setHistory,
    historyLoading, setHistoryLoading,
    historySearch, setHistorySearch,
    chatSearch, setChatSearch,
    showChatSearch, setShowChatSearch,
    sessionSystemPrompt, setSessionSystemPrompt,
    memorySuggestion, setMemorySuggestion,
    showArchivedHistory, setShowArchivedHistory,
    projects, setProjects,
    activeProjectFilter, setActiveProjectFilter,
    creatingProject, setCreatingProject,
    newProjectName, setNewProjectName,
    editingProjectId, setEditingProjectId,
    editingProject, setEditingProject,
    newProjectColor, setNewProjectColor,
    newProjectSystemPrompt, setNewProjectSystemPrompt,
    assigningConvId, setAssigningConvId,
    openConvMenuId, setOpenConvMenuId,
    factsSearch, setFactsSearch,
    sidebarSearch, setSidebarSearch,
    sidebarSearchFocused, setSidebarSearchFocused,
    conversationLabels, setConversationLabels,
    pinnedConversations, setPinnedConversations,
    conversationModels, setConversationModels,
    promptTemplates, setPromptTemplates,
    showTemplatesMenu, setShowTemplatesMenu,
    newTemplateTitle, setNewTemplateTitle,
    newTemplateText, setNewTemplateText,
    googleCredentialsSaving, setGoogleCredentialsSaving,
    googleClientIdInput, setGoogleClientIdInput,
    googleClientSecretInput, setGoogleClientSecretInput,
    googleStatus, setGoogleStatus,
    googleNotice, setGoogleNotice,
    editingLabelId, setEditingLabelId,
    labelDraft, setLabelDraft,
    facts, setFacts,
    memoryFiles, setMemoryFiles,
    memoryUrls, setMemoryUrls,
    agentFactCounts, setAgentFactCounts,
    customSkills, setCustomSkills,
    customAgents, setCustomAgents,
    apiKeys, setApiKeys,
    dailyTokens, setDailyTokens,
    dailyModelUsage, setDailyModelUsage,
    dailyProviderUsage, setDailyProviderUsage,
    usageTrend, setUsageTrend,
    usagePeriod, setUsagePeriod,
    systemPrompt, setSystemPrompt,
    localUrl, setLocalUrl,
    useMemory, setUseMemory,
    autoMemory, setAutoMemory,
    sandboxMode, setSandboxMode,
    webSearchEnabled, setWebSearchEnabled,
    tavilyConfigured, setTavilyConfigured,
    attachedRagDoc, setAttachedRagDoc,
    showRagDocMenu, setShowRagDocMenu,
    sharingConvId, setSharingConvId,
    shareLink, setShareLink,
    shareLoading, setShareLoading,
    historyRetentionDays, setHistoryRetentionDays,
    telegramBotToken, setTelegramBotToken,
    telegramBotEnabled, setTelegramBotEnabled,
    telegramAllowedChatIds, setTelegramAllowedChatIds,
    telegramProvider, setTelegramProvider,
    telegramModel, setTelegramModel,
    telegramDigestEnabled, setTelegramDigestEnabled,
    telegramDigestHour, setTelegramDigestHour,
    telegramStatus, setTelegramStatus,
    loadingTelegramStatus, setLoadingTelegramStatus,
    sendingTelegramTest, setSendingTelegramTest,
    telegramTestResult, setTelegramTestResult,
    activePresetId, setActivePresetId,
    applyingFunctionId, setApplyingFunctionId,
    selectedSlashIndex, setSelectedSlashIndex,
    hasSidebarPreference, setHasSidebarPreference,
    isSidebarExpanded, setIsSidebarExpanded,
    isFullscreen, setIsFullscreen,
    isSidebarDrawerOpen, setIsSidebarDrawerOpen,
    isChatSidebarOpen, setIsChatSidebarOpen,
    recentSlashItemIds, setRecentSlashItemIds,
    newFact, setNewFact,
    newUrl, setNewUrl,
    agentFacts, setAgentFacts,
    expandedAgentMemory, setExpandedAgentMemory,
    pendingAttachments, setPendingAttachments,
    isDragOverComposer, setIsDragOverComposer,
    savingBotId, setSavingBotId,
    deletingBotId, setDeletingBotId,
    confirmingDeleteBotId, setConfirmingDeleteBotId,
    confirmingClearHistory, setConfirmingClearHistory,
    keyInputs, setKeyInputs,
    savingKey, setSavingKey,
    savingSettings, setSavingSettings,
    creatingFunction, setCreatingFunction,
    isExportingMemory, setIsExportingMemory,
    isImportingMemory, setIsImportingMemory,
    copiedMessageIndex, setCopiedMessageIndex,
    pendingMemoryRestore, setPendingMemoryRestore,
    memoryRestorePreview, setMemoryRestorePreview,
    notice, setNotice,
    showScrollResumeBtn, setShowScrollResumeBtn,
    showShortcuts, setShowShortcuts,
    patchNewSkill, resetNewSkill,
    newSkillTitle, newSkillCommand, newSkillDescription, newSkillSystemPrompt,
    patchNewBot, resetNewBot,
    newBotTitle, newBotDescription, newBotCommand, newBotProvider, newBotModel,
    newBotMemoryMode, newBotExecutorType, newBotEndpoint, newBotSystemPrompt,
    newBotTools, newBotMaxTurns,
    patchEditingBot, resetEditingBot, loadEditingBot,
    editingBotId, editingBotTitle, editingBotDescription, editingBotCommand,
    editingBotUseWhen, editingBotBoundaries, editingBotProvider, editingBotModel,
    editingBotMemoryMode, editingBotExecutorType, editingBotEndpoint, editingBotSystemPrompt,
    editingBotTools, editingBotMaxTurns,
    ragFileInputRef, factFileInputRef, factImportRef,
    importMemoryInputRef, importAgentInputRef, attachmentInputRef,
    composerDropRef, composerTextareaRef, speechRecognitionRef,
    chatAbortControllerRef, chatScrollRef, scrollLockedRef, sidebarSearchRef,
    apiSend, parseToolSteps,
    authHeaders, allPresets, skillPresets, agentPresets, usedCommands,
    builtInAgents, customAgentsPresets, activePreset, slashCommands,
    activeBotPreset, conversationTokenWarning, slashMenuItems, groupedSlashItems,
    conversations, sortedModelUsage, latestAssistantMessage,
    trendPeak, providerPeak, modelPeak, sidebarSearchResults,
    currentRuntimeProvider, currentRuntimeModel, currentRuntimeTokenUsage,
    sectionCardClass, elevatedCardClass, inputClass, textInputClass, textareaClass,
    subtleTextClass, mutedTextClass, sectionLabelClass, navButtonClass,
    sidebarPrimaryButtonClass, primaryButtonClass, shellUtilityButtonClass,
    sidebarTextClass, sidebarBlockClass, sidebarStatsClass, sidebarCompactButtonClass,
    telegramStatusToneClass, telegramStatusLabel, telegramStatusDetails,
    actionButtonClass, listButtonClass, secondaryButtonClass, destructiveButtonClass,
    responsiveButtonClass, responsivePrimaryButtonClass, responsiveSecondaryButtonClass,
    responsiveDestructiveButtonClass, noticeClass, emptyStateClass,
    refreshAll, stopCurrentResponse, sendPrompt, startNewChat, loadConversation,
    openTab, handleLogout, toggleVoiceInput, handlePromptKeyDown, handleSystemPromptKeyDown,
    addChatFiles, removePendingAttachment, refreshModels,
    refreshTelegramStatus, sendTelegramTest,
    toggleFullscreenMode, toggleSidebarPreference, closeMobileSidebar,
    clearFunctionPreset, executeSlashCommand, activateSlashItem,
    activateFunctionPreset, dismissSlashMode, rememberSlashItem,
    saveSystemPromptOnly, createCustomSkill, createCustomBot,
    startEditingCustomBot, stopEditingCustomBot,
    requestDeleteCustomBot, cancelDeleteCustomBot,
    exportAgents, importAgentsFromFile, saveEditedCustomBot, deleteCustomBot,
    activateSlashSkill, clearAllHistory, deleteConversation,
    archiveConversation, unarchiveConversation, shareConversation, revokeShare,
    createProject, updateProject, deleteProject,
    assignConversationToProject, saveConversationLabel, togglePinConversation,
    savePromptTemplate, deletePromptTemplate, applyPromptTemplate,
    loadGoogleStatus, saveGoogleCredentials, startGoogleOAuth, disconnectGoogle,
    exportConversation, exportConversationCSV,
    addFact, importFactsFromFile, deleteFact, loadAgentFacts,
    deleteAgentFact, clearAgentFacts, toggleAgentMemory, addFactFiles,
    deleteMemoryFile, addUrl, deleteUrl,
    uploadRagDocument, deleteRagDocument,
    loadOllamaModels, pullOllamaModel, deleteOllamaModel,
    saveKey, saveSettings, toggleSandboxModeFromMenu,
    exportMemoryBackup, resetMemoryRestoreSelection, prepareMemoryRestore, importMemoryBackup,
    scanLocalAgents, createLocalAgent,
    getAgentExecutorType, getAgentEndpoint, getAgentExecutorLabel,
    formatProviderLabel, formatRoutingModeLabel, formatProviderSourceLabel,
    getProviderStatusTone, formatProviderReadinessLabel,
    humanizeFallbackModelName, formatModelOptionLabel, formatModelDisplay,
    getPresetActivationLabel, getPresetAutonomyLabel, getPresetRoutingLabel, getPresetMemoryLabel,
    getSlashItemPanelClass, getSlashItemBadgeClass,
    inferProviderFromModel, isAutoRouteProvider, getProviderSelectValue,
    getEstimatedModelTokenLimit, formatTokenUsage,
    getSuggestedChatModel, getSelectableModels, getPreferredSelectableModel,
    supportsSpeechRecognition,
    ARTIFACT_LANG_SET,
    ArtifactBlock,
    MarkdownMessage,
  };
  return (
    <AppContext.Provider value={ctxVal}>
    <div className={appBackgroundClass}>
      <div className={`${isFullscreen ? 'h-dvh w-full overflow-hidden p-0' : 'min-h-dvh w-full p-3 sm:p-4 lg:p-5'}`}>
        <div className={workspaceShellClass}>
          {isSidebarDrawerOpen ? (
            <button
              type="button"
              aria-label="Close menu overlay"
              className={`fixed inset-0 z-30 md:hidden ${isDarkMode ? 'bg-black/55' : 'bg-stone-900/20'}`}
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
                      ['Ctrl + K', 'Search conversations'],
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
                className={`${shellUtilityButtonClass} shrink-0 px-3 md:hidden`}
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
                    ref={sidebarSearchRef}
                    type="text"
                    value={sidebarSearch}
                    onChange={event => setSidebarSearch(event.target.value)}
                    onFocus={() => setSidebarSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSidebarSearchFocused(false), 150)}
                    placeholder="Search conversations… (Ctrl+K)"
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



            <div className={`rounded-[0.95rem] px-3.5 py-2.5 ${isDarkMode ? 'bg-white/4 text-stone-200' : 'bg-white/70 text-stone-700'} ${isSidebarExpanded ? '' : 'hidden'}`}>
              <p className="text-sm font-medium leading-none">{user.displayName || user.email}</p>
              {user.displayName && user.email ? <p className={`mt-1 text-xs ${subtleTextClass}`}>{user.email}</p> : null}
            </div>

            <button onClick={handleLogout} className={sidebarCompactButtonClass} title="Sign out" aria-label="Sign out">
              <LogOut className="w-4 h-4" />
              <span className={sidebarTextClass}>Sign out</span>
            </button>
          </aside>

          <main className={`${shellPanelClass} flex min-h-[calc(100dvh-1.5rem)] flex-col md:h-[calc(100dvh-2rem)] md:min-h-0 md:overflow-hidden ${isFullscreen ? 'h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-2rem)]' : activeTab === 'chat' ? 'overflow-hidden' : ''}`}>
            <div className={`mb-5 shrink-0 flex flex-col gap-3 md:flex-row md:items-center md:justify-between`}>
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setIsSidebarDrawerOpen(true)}
                  className={`${actionButtonClass} ${isFullscreen ? '' : 'md:hidden'}`}
                  aria-label="Open menu"
                  title="Open menu"
                >
                  <Menu className="w-4 h-4" />
                </button>

                <div className="min-w-0">
                  <h2 className="text-xl font-semibold sm:text-2xl">{activeTabLabel}</h2>
                  <p className={`text-sm ${subtleTextClass}`}>
                    {activeTab === 'chat' ? 'Send prompts through Claude or any configured local provider.' : null}
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

            {notice ? <div className={`shrink-0 ${noticeClass}`}>{notice}</div> : null}

            {activeTab === 'chat' ? <ChatPanel /> : null}

            {activeTab === 'history' ? <HistoryPanel /> : null}

            {activeTab === 'memory' ? <MemoryPanel /> : null}

            {activeTab === 'settings' ? <SettingsPanel /> : null}
          </main>
        </div>
      </div>
    </div>
    </AppContext.Provider>
  );
}

export default AppShell;

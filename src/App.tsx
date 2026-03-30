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
  MemoryStick,
  Mic,
  MessageSquare,
  Moon,
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
} from 'lucide-react';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_CHAT_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_CHAT_ATTACHMENT_CHARS = 12000;
const MAX_CHAT_ATTACHMENT_PAGES = 20;

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

const FUNCTION_PRESETS: FunctionPreset[] = [
  {
    id: 'skill-botty-development',
    kind: 'skill',
    builtIn: true,
    title: 'Botty Development',
    description: 'Full-stack product work across React, Express, memory, local LLM, settings, and Telegram.',
    command: 'development',
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

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryUrls, setMemoryUrls] = useState<MemoryUrl[]>([]);
  const [customSkills, setCustomSkills] = useState<FunctionPreset[]>([]);
  const [customBots, setCustomBots] = useState<FunctionPreset[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [dailyTokens, setDailyTokens] = useState(0);
  const [dailyModelUsage, setDailyModelUsage] = useState<ModelUsageEntry[]>([]);
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
  const [newFact, setNewFact] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [newSkillTitle, setNewSkillTitle] = useState('');
  const [newSkillDescription, setNewSkillDescription] = useState('');
  const [newSkillCommand, setNewSkillCommand] = useState('');
  const [newSkillSystemPrompt, setNewSkillSystemPrompt] = useState('');
  const [newSkillStarterPrompt, setNewSkillStarterPrompt] = useState('');
  const [newBotTitle, setNewBotTitle] = useState('');
  const [newBotDescription, setNewBotDescription] = useState('');
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
    const [historyRows, factRows, urlRows, functionsData, keyRows, usageData, settingsData, userSettingsData, providersData] = await Promise.all([
      apiGet<HistoryEntry[]>('/api/history'),
      apiGet<Fact[]>('/api/memory/facts'),
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
    setMemoryUrls(urlRows);
    setCustomSkills(functionsData.skills || []);
    setCustomBots(functionsData.bots || []);
    setApiKeys(keyRows);
    setDailyTokens(usageData.tokens || 0);
    setDailyModelUsage(Array.isArray(usageData.modelUsage) ? usageData.modelUsage : []);
    setLocalUrl(settingsData.localUrl || 'http://127.0.0.1:11435');
    setUseMemory(settingsData.useMemory !== false);
    setAutoMemory(settingsData.autoMemory !== false);
    setSandboxMode(settingsData.sandboxMode === true);
    setTelegramBotToken(settingsData.telegramBotToken || '');
    setTelegramBotEnabled(settingsData.telegramBotEnabled !== false);
    setTelegramAllowedChatIds(settingsData.telegramAllowedChatIds || '');
    setTelegramProvider(settingsData.telegramProvider || 'auto');
    setTelegramModel(settingsData.telegramModel || '');
    setSystemPrompt(userSettingsData.systemPrompt || '');
    setActiveFunctionId(getFunctionPresetForPrompt(userSettingsData.systemPrompt, [...FUNCTION_PRESETS, ...(functionsData.skills || []), ...(functionsData.bots || [])])?.id || '');
    const nextProviders = providersData.providers || [];
    const nextLocalModel = providersData.defaultLocalModel?.trim() || DEFAULT_MODELS.local;
    setAvailableProviders(nextProviders);
    setDefaultLocalModel(nextLocalModel);
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

    if (provider === 'local' && nextProviders.includes('local') && (!model || model === defaultLocalModel)) {
      setModel(nextLocalModel);
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
      if (event.key === 'ArrowDown' && matchingSkillPresets.length > 0) {
        event.preventDefault();
        setSelectedSlashIndex(index => (index + 1) % matchingSkillPresets.length);
        return;
      }

      if (event.key === 'ArrowUp' && matchingSkillPresets.length > 0) {
        event.preventDefault();
        setSelectedSlashIndex(index => (index - 1 + matchingSkillPresets.length) % matchingSkillPresets.length);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        const preset = matchingSkillPresets[selectedSlashIndex] || matchingSkillPresets[0];
        if (preset) {
          event.preventDefault();
          void activateSlashSkill(preset);
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
      nextMessages.push({ role: 'assistant', content: item.response, model: item.model });
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

  const slashQuery = prompt.startsWith('/') ? prompt.slice(1).trim().toLowerCase() : '';
  const matchingSkillPresets = prompt.startsWith('/')
    ? skillPresets.filter(item => {
        if (!slashQuery) {
          return true;
        }

        return item.command.includes(slashQuery)
          || item.title.toLowerCase().includes(slashQuery)
          || item.description.toLowerCase().includes(slashQuery);
      })
    : [];

  async function createCustomSkill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newSkillTitle.trim();
    const description = newSkillDescription.trim();
    const command = newSkillCommand.trim().toLowerCase();
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
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
      });
      setNewSkillTitle('');
      setNewSkillDescription('');
      setNewSkillCommand('');
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
        provider: providerValue || null,
        model: modelValue || null,
        memoryMode: newBotMemoryMode,
        systemPrompt: systemPromptValue,
        starterPrompt: starterPromptValue,
      });
      setNewBotTitle('');
      setNewBotDescription('');
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

  const appBackgroundClass = isDarkMode
    ? 'min-h-dvh w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_24%),linear-gradient(180deg,_#0d1117_0%,_#111827_100%)] text-stone-100'
    : 'min-h-dvh w-full overflow-x-hidden bg-[#f3efe6] text-stone-900';
  const shellPanelClass = isDarkMode
    ? 'rounded-[2rem] bg-[#111927]/88 backdrop-blur-xl p-4 md:p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] border border-white/8'
    : 'rounded-[2rem] bg-white/80 backdrop-blur-xl p-4 md:p-6 shadow-[0_30px_80px_rgba(120,95,64,0.15)] border border-white/70';
  const sectionCardClass = isDarkMode
    ? 'rounded-[1.5rem] border border-white/8 bg-[#0f1724] p-4'
    : 'rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4';
  const elevatedCardClass = isDarkMode
    ? 'rounded-2xl border border-white/8 bg-[#172131] px-3 py-3'
    : 'rounded-2xl bg-white border border-stone-200 px-3 py-3';
  const inputClass = isDarkMode
    ? 'rounded-2xl border border-white/10 px-3 py-2 bg-[#0b1220] text-stone-100 placeholder:text-stone-500'
    : 'rounded-2xl border border-stone-200 px-3 py-2 bg-stone-50';
  const textInputClass = isDarkMode
    ? 'w-full rounded-2xl border border-white/10 px-3 py-2 text-sm bg-[#0b1220] text-stone-100 placeholder:text-stone-500'
    : 'w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm';
  const textareaClass = isDarkMode
    ? 'w-full resize-none rounded-[1.25rem] border border-white/10 px-4 py-3 outline-none bg-[#0b1220] text-stone-100 placeholder:text-stone-500 focus:border-amber-300/50'
    : 'w-full resize-none rounded-[1.25rem] border border-stone-200 px-4 py-3 outline-none focus:border-stone-400';
  const subtleTextClass = isDarkMode ? 'text-stone-400' : 'text-stone-500';
  const mutedTextClass = isDarkMode ? 'text-stone-300' : 'text-stone-600';
  const sectionLabelClass = isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-600 mb-2';
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
    ? 'rounded-2xl border border-white/10 px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5'
    : 'rounded-2xl border border-stone-200 px-4 py-2 text-sm flex items-center gap-2 hover:bg-stone-50';
  const listButtonClass = isDarkMode
    ? 'w-full text-left rounded-2xl border border-white/8 bg-[#172131] px-3 py-3 hover:border-amber-300/30'
    : 'w-full text-left rounded-2xl border border-stone-200 bg-white px-3 py-3 hover:border-stone-300';
  const secondaryButtonClass = isDarkMode
    ? 'rounded-2xl border border-white/10 bg-[#172131] px-3 py-2 text-sm hover:bg-[#1d293d]'
    : 'rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm hover:bg-stone-100';
  const destructiveButtonClass = isDarkMode
    ? 'rounded-2xl border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:bg-red-950/60'
    : 'rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100';
  const noticeClass = isDarkMode
    ? 'mb-4 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-200 px-4 py-3 text-sm'
    : 'mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 text-sm';
  const emptyStateClass = isDarkMode ? 'text-center text-stone-400' : 'text-center text-stone-500';

  if (authLoading) {
    return <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center">Loading local workspace...</div>;
  }

  if (!user) {
    return (
      <div className={`${isDarkMode ? 'min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(180deg,_#171717_0%,_#09090b_100%)] text-stone-100' : 'min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(180deg,_#f5efe4_0%,_#ece5d6_100%)] text-stone-900'} px-4 py-6 sm:px-6 sm:py-10 lg:px-10 lg:py-12`}>
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1600px] items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,520px)]">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className={`text-xs uppercase tracking-[0.35em] ${isDarkMode ? 'text-amber-300/80' : 'text-amber-700'} mb-0`}>Botty local runtime</p>
              <button onClick={() => setIsDarkMode(value => !value)} className={`${isDarkMode ? 'border-white/10 bg-white/5 text-stone-100 hover:bg-white/10' : 'border-stone-300 bg-white/70 text-stone-700 hover:bg-white'} rounded-2xl border px-3 py-2 text-sm flex items-center gap-2`}>
                {isDarkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {isDarkMode ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
            <h1 className="text-5xl md:text-6xl font-semibold leading-tight text-balance">Run the migrated app entirely on your machine.</h1>
            <p className={`mt-6 text-lg ${isDarkMode ? 'text-stone-300' : 'text-stone-700'} max-w-2xl leading-8`}>
              Local sign-in, PostgreSQL-backed memory, and direct Claude or local model calls. No Firebase path remains in the runtime you use here.
            </p>
            <div className={`mt-8 grid sm:grid-cols-3 gap-3 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
              <div className={`rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white/65'} p-4`}>Claude via ANTHROPIC_API_KEY</div>
              <div className={`rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white/65'} p-4`}>Postgres auto-bootstrapped on startup</div>
              <div className={`rounded-2xl border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white/65'} p-4`}>JWT local auth for single-user development</div>
            </div>
          </div>

          <form onSubmit={handleLocalLogin} className={`rounded-[2rem] border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-stone-300 bg-white/80'} backdrop-blur-xl p-6 shadow-2xl`}>
            <h2 className="text-2xl font-semibold mb-2">Local sign-in</h2>
            <p className={`${isDarkMode ? 'text-stone-400' : 'text-stone-600'} mb-6`}>Create or reuse a local identity stored in PostgreSQL.</p>

            <label className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Display name</label>
            <input
              value={loginName}
              onChange={event => setLoginName(event.target.value)}
              placeholder="Ofir"
              className={`w-full rounded-2xl ${isDarkMode ? 'bg-black/30 border-white/10 text-stone-100 placeholder:text-stone-500' : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400'} border px-4 py-3 mb-4 outline-none focus:border-amber-300/60`}
            />

            <label className={`${isDarkMode ? 'block text-sm text-stone-300 mb-2' : 'block text-sm text-stone-700 mb-2'}`}>Email</label>
            <input
              value={loginEmail}
              onChange={event => setLoginEmail(event.target.value)}
              type="email"
              placeholder="you@local.dev"
              className={`w-full rounded-2xl ${isDarkMode ? 'bg-black/30 border-white/10 text-stone-100 placeholder:text-stone-500' : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400'} border px-4 py-3 outline-none focus:border-amber-300/60`}
            />

            {authError ? <p className="mt-4 text-sm text-red-300">{authError}</p> : null}

            <button type="submit" className="mt-6 w-full rounded-2xl bg-amber-300 text-stone-950 font-medium px-4 py-3 hover:bg-amber-200 transition-colors">
              Enter local workspace
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={appBackgroundClass}>
      <div className="min-h-dvh w-full p-3 sm:p-4 lg:p-5">
        <div className="grid min-h-[calc(100dvh-1.5rem)] w-full gap-3 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] lg:gap-6">
          <aside className="relative flex min-h-[240px] flex-col gap-4 rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(36,24,18,0.96)_0%,rgba(20,14,12,0.92)_100%)] p-4 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-0 before:rounded-[2rem] before:border before:border-white/6 before:content-[''] lg:sticky lg:top-5 lg:max-h-[calc(100dvh-2.5rem)]">
            <div className="flex items-start gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Botty</p>
                <h1 className="mt-2 text-3xl font-semibold">Local OSS</h1>
                <p className="mt-2 text-sm text-stone-300">{user.displayName || user.email}</p>
              </div>
            </div>

            <button onClick={startNewChat} className="rounded-2xl bg-amber-300 text-stone-950 px-4 py-3 font-medium flex items-center justify-center gap-2 hover:bg-amber-200">
              <Plus className="w-4 h-4" />
              New chat
            </button>

            <nav className="space-y-2 text-sm">
              {TABS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => openTab(value)}
                  className={`w-full rounded-2xl px-4 py-3 flex items-center gap-3 ${activeTab === value ? 'bg-white/10 text-white' : 'text-stone-300 hover:bg-white/5'}`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </nav>

            <button
              onClick={() => void toggleSandboxModeFromMenu()}
              disabled={savingSettings}
              className={`rounded-2xl border px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors disabled:opacity-60 ${sandboxMode ? 'border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15' : 'border-white/10 text-stone-300 hover:bg-white/5'}`}
            >
              <span>
                <span className="block text-sm font-medium">Sandbox mode</span>
                <span className="block text-xs opacity-75">{sandboxMode ? 'Facts and sites only' : 'Regular chat access'}</span>
              </span>
              <span className={`rounded-full px-2 py-1 text-xs ${sandboxMode ? 'bg-amber-200 text-stone-950' : 'bg-white/10 text-stone-200'}`}>
                {savingSettings ? 'Saving...' : sandboxMode ? 'On' : 'Off'}
              </span>
            </button>

            <button onClick={() => setIsDarkMode(value => !value)} className="rounded-2xl border border-white/10 px-4 py-3 text-left flex items-center gap-3 text-stone-300 hover:bg-white/5">
              {isDarkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDarkMode ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="mt-auto rounded-2xl border border-white/8 bg-white/6 p-4 text-sm text-stone-300 backdrop-blur-sm">
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

            <button onClick={handleLogout} className="rounded-2xl border border-white/10 px-4 py-3 text-left flex items-center gap-3 text-stone-300 hover:bg-white/5">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </aside>

          <main className={`${shellPanelClass} min-h-[calc(100dvh-1.5rem)]`}>
            <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold capitalize">{activeTab}</h2>
                <p className={`text-sm ${subtleTextClass}`}>
                  {activeTab === 'chat' ? 'Send prompts through Claude or any configured local provider.' : null}
                  {activeTab === 'skills' ? 'Run Botty skills with slash commands or activate them from the menu.' : null}
                  {activeTab === 'bots' ? 'Launch specialized Botty bots for different kinds of tasks.' : null}
                  {activeTab === 'history' ? 'Reload or delete stored conversations.' : null}
                  {activeTab === 'memory' ? 'Manage facts and URLs that feed the prompt context.' : null}
                  {activeTab === 'settings' ? 'Save keys and runtime preferences used by the local server.' : null}
                </p>
              </div>

              <button onClick={() => void refreshAll()} className={actionButtonClass}>
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>

            {notice ? <div className={noticeClass}>{notice}</div> : null}

            {activeTab === 'chat' ? (
              <div className="grid xl:grid-cols-[1fr_320px] gap-4">
                <section className={`${sectionCardClass} min-h-[70vh] flex flex-col`}>
                  <div className="flex-1 overflow-auto space-y-4 pr-2">
                    {messages.length === 0 ? (
                      <div className={`h-full min-h-[360px] flex items-center justify-center ${emptyStateClass}`}>
                        <div>
                          <Bot className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-stone-500' : 'text-stone-400'}`} />
                          <p className={`text-lg ${isDarkMode ? 'text-stone-200' : 'text-stone-700'}`}>Start a local conversation.</p>
                          <p className="text-sm mt-2 max-w-md">If Anthropic is configured, Botty will use Claude. Otherwise set a provider key or switch to your local endpoint.</p>
                        </div>
                      </div>
                    ) : null}

                    {messages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`rounded-[1.5rem] px-4 py-4 ${message.role === 'user' ? 'bg-stone-900 text-white ml-auto max-w-[82%]' : isDarkMode ? 'bg-[#172131] border border-white/8 max-w-[92%]' : 'bg-white border border-stone-200 max-w-[92%]'}`}>
                        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">
                          {message.role === 'user'
                            ? 'You'
                            : [formatProviderLabel(message.provider), message.model].filter(Boolean).join(' · ') || message.model || 'Assistant'}
                        </div>
                        <div className="whitespace-pre-wrap leading-7 text-[15px]">{message.content}</div>
                      </div>
                    ))}
                  </div>

                  {chatError ? <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{chatError}</div> : null}

                  <div ref={composerDropRef} className={`mt-4 rounded-[1.5rem] p-3 relative transition-colors ${isDarkMode ? 'border border-white/8 bg-[#111927]' : 'border border-stone-200 bg-white'} ${isDragOverComposer ? (isDarkMode ? 'ring-2 ring-amber-300/70 bg-[#1d2a3f]' : 'ring-2 ring-amber-400/80 bg-amber-50') : ''}`}>
                    {isDragOverComposer ? (
                      <div className={`pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[1.25rem] border-2 border-dashed ${isDarkMode ? 'border-amber-300/70 bg-[#0f1726]/88 text-amber-100' : 'border-amber-400 bg-white/92 text-stone-900'}`}>
                        <div className="text-center">
                          <Upload className="mx-auto h-8 w-8" />
                          <p className="mt-3 text-base font-medium">Drop files to attach</p>
                          <p className="mt-1 text-sm opacity-75">Text, PDF, and image files are supported.</p>
                        </div>
                      </div>
                    ) : null}
                    <div className="grid md:grid-cols-[180px_1fr] gap-3 mb-3">
                      <select
                        value={provider}
                        onChange={event => {
                          const nextProvider = event.target.value;
                          setProvider(nextProvider);
                          if (nextProvider !== 'auto') {
                            setModel(getSuggestedChatModel(nextProvider, prompt));
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

                      <input
                        value={model}
                        onChange={event => setModel(event.target.value)}
                        disabled={provider === 'auto'}
                        placeholder={provider === 'auto' ? 'Chosen automatically' : 'Model name'}
                        className={`${inputClass} ${isDarkMode ? 'disabled:bg-[#111927] disabled:text-stone-600' : 'disabled:bg-stone-100 disabled:text-stone-400'}`}
                      />
                    </div>

                    <textarea
                      value={prompt}
                      onChange={event => setPrompt(event.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      rows={5}
                      placeholder="Ask Claude to debug, design, or write code... Use /development, /debug, or /ops for skills"
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
                      <div className={`mt-3 rounded-2xl border ${isDarkMode ? 'border-white/8 bg-[#172131]' : 'border-stone-200 bg-stone-50'} p-2`}>
                        <div className={`px-2 pb-2 text-xs ${subtleTextClass}`}>Slash skills</div>
                        <div className="space-y-1">
                          {matchingSkillPresets.length > 0 ? matchingSkillPresets.map((item, index) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => void activateSlashSkill(item)}
                              className={`w-full rounded-xl px-3 py-2 text-left ${index === selectedSlashIndex ? (isDarkMode ? 'bg-white/10 text-stone-100' : 'bg-white text-stone-900 border border-stone-200') : (isDarkMode ? 'text-stone-300 hover:bg-white/5' : 'text-stone-700 hover:bg-white')}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium">/{item.command}</div>
                                <div className={`text-xs ${subtleTextClass}`}>{item.title}</div>
                              </div>
                              <div className={`text-xs mt-1 ${subtleTextClass}`}>{item.description}</div>
                            </button>
                          )) : (
                            <div className={`px-3 py-2 text-sm ${subtleTextClass}`}>No matching skills.</div>
                          )}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className={`text-xs ${subtleTextClass}`}>Auth: local JWT. Memory: {useMemory ? 'enabled' : 'disabled'}. Sandbox: {sandboxMode ? 'on' : 'off'}. {activeFunctionId ? `Mode: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'Custom'}` : 'Mode: default chat'}. Drag files into this panel to attach them.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => attachmentInputRef.current?.click()} className={secondaryButtonClass}>
                          <Upload className="w-4 h-4" />
                          Add files
                        </button>
                        <button type="button" onClick={toggleVoiceInput} className={secondaryButtonClass}>
                          {isListening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          {isListening ? 'Stop voice' : 'Voice'}
                        </button>
                        <button onClick={() => void sendPrompt()} disabled={isSending} className="rounded-2xl bg-stone-900 text-white px-4 py-2.5 flex items-center gap-2 disabled:opacity-60">
                          <Send className="w-4 h-4" />
                          {isSending ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className={sectionCardClass}>
                    <h3 className="font-medium">Current runtime</h3>
                    <ul className={`mt-3 text-sm ${mutedTextClass} space-y-2`}>
                      <li>Primary provider: {provider}</li>
                      <li>Model: {provider === 'auto' ? 'auto-selected' : model}</li>
                      <li>Available providers: {availableProviders.length ? availableProviders.join(', ') : 'none'}</li>
                    </ul>
                  </div>

                  <div className={sectionCardClass}>
                    <h3 className="font-medium">Recent conversations</h3>
                    <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
                      {conversations.slice(0, 8).map(item => (
                        <button key={item.id} onClick={() => loadConversation(item.id)} className={listButtonClass}>
                          <div className="text-sm font-medium line-clamp-2">{item.items[0].prompt}</div>
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
                    <p className={`text-sm ${subtleTextClass} mt-1`}>Use these in the menu or type `/` in chat to activate a Botty skill instantly.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`text-sm ${mutedTextClass}`}>{activeFunctionId ? `Active: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'Custom mode'}` : 'Active: default chat'}</div>
                    <button onClick={() => void clearFunctionPreset()} disabled={applyingFunctionId === 'clear'} className={secondaryButtonClass}>
                      {applyingFunctionId === 'clear' ? 'Clearing...' : 'Clear mode'}
                    </button>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="w-4 h-4" />
                    <h3 className="font-medium">Create skill</h3>
                  </div>
                  <form onSubmit={createCustomSkill} className="grid gap-3 md:grid-cols-2">
                    <input value={newSkillTitle} onChange={event => setNewSkillTitle(event.target.value)} placeholder="Skill title" className={textInputClass} />
                    <input value={newSkillCommand} onChange={event => setNewSkillCommand(event.target.value)} placeholder="Slash command, e.g. research" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newSkillDescription} onChange={event => setNewSkillDescription(event.target.value)} placeholder="Short description" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillSystemPrompt} onChange={event => setNewSkillSystemPrompt(event.target.value)} rows={4} placeholder="System prompt" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newSkillStarterPrompt} onChange={event => setNewSkillStarterPrompt(event.target.value)} rows={3} placeholder="Starter prompt" className={textareaClass} />
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
                    <p className={`text-sm ${subtleTextClass} mt-1`}>These agent-backed bots switch Botty into a specialized task mode for building, reviewing, or operating the app.</p>
                  </div>
                  <div className={`text-sm ${mutedTextClass}`}>{activeFunctionId ? `Active bot: ${allFunctionPresets.find(item => item.id === activeFunctionId)?.title || 'none'}` : 'No active bot'}</div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex items-center gap-2 mb-3">
                    <Plus className="w-4 h-4" />
                    <h3 className="font-medium">Create bot</h3>
                  </div>
                  <form onSubmit={createCustomBot} className="grid gap-3 md:grid-cols-2">
                    <input value={newBotTitle} onChange={event => setNewBotTitle(event.target.value)} placeholder="Bot title" className={textInputClass} />
                    <div className="md:col-span-2">
                      <input value={newBotDescription} onChange={event => setNewBotDescription(event.target.value)} placeholder="Short description" className={textInputClass} />
                    </div>
                    <select value={newBotProvider} onChange={event => setNewBotProvider(event.target.value)} className={textInputClass}>
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
                      <input value={newBotModel} onChange={event => setNewBotModel(event.target.value)} placeholder="Optional model override" className={textInputClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotSystemPrompt} onChange={event => setNewBotSystemPrompt(event.target.value)} rows={4} placeholder="System prompt" className={textareaClass} />
                    </div>
                    <div className="md:col-span-2">
                      <textarea value={newBotStarterPrompt} onChange={event => setNewBotStarterPrompt(event.target.value)} rows={3} placeholder="Starter prompt" className={textareaClass} />
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
                          <div className={`text-xs ${subtleTextClass}`}>
                            Provider: {item.provider ? (item.provider === 'auto' ? 'Auto route' : formatProviderLabel(item.provider)) : 'Inherit chat'}
                            {' · '}
                            Model: {item.model || 'Inherit chat'}
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
                {conversations.map(item => (
                  <div key={item.id} className={`${sectionCardClass} flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`}>
                    <div>
                      <div className="text-sm font-medium">{item.items[0].prompt}</div>
                      <div className={`text-xs ${subtleTextClass} mt-2`}>{new Date(item.items[0].timestamp).toLocaleString()} · {item.items.length} message pair(s)</div>
                    </div>
                    <div className="flex items-center gap-2">
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
                    <button onClick={() => importMemoryInputRef.current?.click()} disabled={isImportingMemory} className="rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 flex items-center gap-2 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-stone-100">
                      <Upload className="w-4 h-4" />
                      {isImportingMemory ? 'Restoring...' : 'Restore backup'}
                    </button>
                    <button onClick={() => void exportMemoryBackup()} disabled={isExportingMemory} className="rounded-2xl bg-stone-900 text-white px-4 py-3 flex items-center gap-2 disabled:opacity-60">
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

                    <div className={`text-sm ${subtleTextClass} space-y-1`}>
                      <div>File: {memoryRestorePreview.fileName}</div>
                      <div>Exported at: {memoryRestorePreview.exportedAt ? new Date(memoryRestorePreview.exportedAt).toLocaleString() : 'unknown'}</div>
                      <div>Includes runtime settings: {memoryRestorePreview.includesSettings ? 'yes' : 'no'}</div>
                      <div>Includes system prompt: {memoryRestorePreview.includesSystemPrompt ? 'yes' : 'no'}</div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button onClick={() => void importMemoryBackup()} disabled={isImportingMemory} className="rounded-2xl bg-stone-900 text-white px-4 py-3 flex items-center gap-2 disabled:opacity-60">
                        <Upload className="w-4 h-4" />
                        {isImportingMemory ? 'Restoring...' : 'Confirm restore'}
                      </button>
                      <button onClick={resetMemoryRestoreSelection} disabled={isImportingMemory} className="rounded-2xl border border-stone-300 bg-white/80 px-4 py-3 flex items-center gap-2 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-stone-100">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="grid xl:grid-cols-2 gap-4">
                <section className={sectionCardClass}>
                  <h3 className="font-medium mb-3">Facts</h3>
                  <form onSubmit={addFact} className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <input value={newFact} onChange={event => setNewFact(event.target.value)} placeholder="User prefers concise technical responses" className={`flex-1 ${inputClass}`} />
                    <button className="rounded-2xl bg-stone-900 text-white px-3 py-2">Add</button>
                  </form>
                  <div className="space-y-2">
                    {facts.map(item => (
                      <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                        <div className="text-sm">{item.content}</div>
                        <button onClick={() => void deleteFact(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <h3 className="font-medium mb-3">Saved URLs</h3>
                  <form onSubmit={addUrl} className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <input value={newUrl} onChange={event => setNewUrl(event.target.value)} placeholder="https://docs.anthropic.com/" className={`flex-1 ${inputClass}`} />
                    <button className="rounded-2xl bg-stone-900 text-white px-3 py-2">Add</button>
                  </form>
                  <div className="space-y-2">
                    {memoryUrls.map(item => (
                      <div key={item.id} className={`${elevatedCardClass} flex items-start justify-between gap-3`}>
                        <div>
                          <div className="text-sm font-medium">{item.title || item.url}</div>
                          <div className={`text-xs ${subtleTextClass} mt-1`}>{item.url}</div>
                        </div>
                        <button onClick={() => void deleteUrl(item.id)} className={`${subtleTextClass} hover:text-red-600`}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
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
                      <div key={providerName} className={`${isDarkMode ? 'rounded-2xl bg-[#172131] border border-white/8 p-3' : 'rounded-2xl bg-white border border-stone-200 p-3'}`}>
                        <div className="text-sm font-medium capitalize mb-2">{providerName}</div>
                        <input
                          value={keyInputs[providerName] || ''}
                          onChange={event => setKeyInputs(prev => ({ ...prev, [providerName]: event.target.value }))}
                          placeholder={`${providerName.toUpperCase()}_API_KEY`}
                          className={textInputClass}
                        />
                        <button onClick={() => void saveKey(providerName)} className="mt-3 rounded-2xl bg-stone-900 text-white px-3 py-2 text-sm w-full disabled:opacity-60" disabled={savingKey === providerName}>
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
                    <input value={localUrl} onChange={event => setLocalUrl(event.target.value)} className={isDarkMode ? 'w-full rounded-2xl border border-white/10 px-3 py-2 bg-[#0b1220] text-stone-100' : 'w-full rounded-2xl border border-stone-200 px-3 py-2'} />
                  </div>

                  <div>
                    <label className={sectionLabelClass}>System prompt</label>
                    <textarea value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} onKeyDown={handleSystemPromptKeyDown} rows={6} className={isDarkMode ? 'w-full rounded-2xl border border-white/10 px-3 py-2 bg-[#0b1220] text-stone-100' : 'w-full rounded-2xl border border-stone-200 px-3 py-2'} />
                  </div>

                  <div className={`grid gap-4 lg:grid-cols-2 ${elevatedCardClass}`}>
                    <div className="lg:col-span-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4" />
                        <h4 className="font-medium">Telegram bot</h4>
                      </div>
                      <p className={`text-sm ${subtleTextClass}`}>Save the bot token here and Botty will start or reload Telegram polling without editing environment files.</p>
                    </div>

                    <div className={`lg:col-span-2 rounded-2xl border px-4 py-3 ${telegramStatusToneClass}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{telegramStatusLabel}</div>
                          <div className="text-xs mt-1 opacity-90">{telegramStatusDetails}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void refreshTelegramStatus()}
                          className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${isDarkMode ? 'bg-white/10 text-stone-100' : 'bg-white text-stone-700 border border-stone-200'}`}
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
                      <select value={telegramProvider} onChange={event => setTelegramProvider(event.target.value)} className={textInputClass}>
                        {PROVIDERS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={sectionLabelClass}>Telegram model override</label>
                      <input
                        value={telegramModel}
                        onChange={event => setTelegramModel(event.target.value)}
                        placeholder="Leave blank for provider default"
                        className={textInputClass}
                      />
                    </div>
                  </div>

                  <label className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                    <input type="checkbox" checked={useMemory} onChange={event => setUseMemory(event.target.checked)} />
                    Include saved memory in prompt construction
                  </label>

                  <label className={`flex items-center gap-3 text-sm ${isDarkMode ? 'text-stone-300' : 'text-stone-700'}`}>
                    <input type="checkbox" checked={autoMemory} onChange={event => setAutoMemory(event.target.checked)} />
                    Learn durable facts about me automatically from successful chats
                  </label>

                  <button onClick={() => void saveSettings()} disabled={savingSettings} className="rounded-2xl bg-stone-900 text-white px-4 py-3 flex items-center gap-2 disabled:opacity-60">
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

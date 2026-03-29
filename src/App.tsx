import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Download,
  History,
  KeyRound,
  LogOut,
  Menu,
  MemoryStick,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  SunMedium,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

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
};

type ProvidersResponse = {
  providers: string[];
  defaultLocalModel?: string | null;
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

const TABS = [
  { value: 'chat', label: 'Chat', Icon: MessageSquare },
  { value: 'history', label: 'History', Icon: History },
  { value: 'memory', label: 'Memory', Icon: MemoryStick },
  { value: 'settings', label: 'Settings', Icon: Settings },
] as const;

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'memory' | 'settings'>('chat');
  const [provider, setProvider] = useState('auto');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryUrls, setMemoryUrls] = useState<MemoryUrl[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [dailyTokens, setDailyTokens] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [localUrl, setLocalUrl] = useState('http://localhost:11434');
  const [useMemory, setUseMemory] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [newFact, setNewFact] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({
    anthropic: '',
    google: '',
    openai: '',
  });
  const [savingKey, setSavingKey] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [isExportingMemory, setIsExportingMemory] = useState(false);
  const [isImportingMemory, setIsImportingMemory] = useState(false);
  const [pendingMemoryRestore, setPendingMemoryRestore] = useState<MemoryBackupPayload | null>(null);
  const [memoryRestorePreview, setMemoryRestorePreview] = useState<MemoryRestorePreview | null>(null);
  const [notice, setNotice] = useState('');
  const importMemoryInputRef = useRef<HTMLInputElement | null>(null);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

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
    const [historyRows, factRows, urlRows, keyRows, usageData, settingsData, userSettingsData, providersData] = await Promise.all([
      apiGet<HistoryEntry[]>('/api/history'),
      apiGet<Fact[]>('/api/memory/facts'),
      apiGet<MemoryUrl[]>('/api/memory/urls'),
      apiGet<ApiKey[]>('/api/keys'),
      apiGet<{ tokens: number }>('/api/usage'),
      apiGet<SettingsResponse>('/api/settings'),
      apiGet<{ systemPrompt?: string | null }>('/api/settings/user-settings'),
      apiGet<ProvidersResponse>('/api/chat/providers'),
    ]);

    setHistory(historyRows);
    setFacts(factRows);
    setMemoryUrls(urlRows);
    setApiKeys(keyRows);
    setDailyTokens(usageData.tokens || 0);
    setLocalUrl(settingsData.localUrl || 'http://localhost:11434');
    setUseMemory(settingsData.useMemory !== false);
    setAutoMemory(settingsData.autoMemory !== false);
    setSystemPrompt(userSettingsData.systemPrompt || '');
    const nextProviders = providersData.providers || [];
    const nextLocalModel = providersData.defaultLocalModel?.trim() || DEFAULT_MODELS.local;
    setAvailableProviders(nextProviders);
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

    if (provider === 'local' && model !== nextLocalModel && nextProviders.includes('local')) {
      setModel(nextLocalModel);
    }

    if (provider !== 'auto' && !nextProviders.includes(provider)) {
      setProvider('auto');
      setModel('');
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
    setIsSidebarOpen(false);
    setMessages([]);
    setConversationId(null);
    setHistory([]);
    setAvailableProviders([]);
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if (!text || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
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
      });

      setConversationId(response.conversationId);
      setMessages(prev => [...prev, { role: 'assistant', content: response.text, model: response.model }]);
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

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setChatError('');
    setActiveTab('chat');
    setIsSidebarOpen(false);
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
    setIsSidebarOpen(false);
  }

  function openTab(tab: 'chat' | 'history' | 'memory' | 'settings') {
    setActiveTab(tab);
    setIsSidebarOpen(false);
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
      await Promise.all([
        apiSend('/api/settings', 'POST', { localUrl, useMemory, autoMemory }),
        apiSend('/api/settings/user-settings', 'POST', { systemPrompt }),
      ]);
      await refreshAll();
      setNotice('Settings updated.');
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
        <div className="relative min-h-[calc(100dvh-1.5rem)] w-full">
          {isSidebarOpen ? (
            <button
              type="button"
              aria-label="Close menu overlay"
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
            />
          ) : null}

          <aside className={`fixed left-3 top-3 z-50 flex w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] flex-col gap-4 overflow-auto rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(36,24,18,0.96)_0%,rgba(20,14,12,0.92)_100%)] p-4 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-2xl transition-all duration-300 ease-out before:pointer-events-none before:absolute before:inset-0 before:rounded-[2rem] before:border before:border-white/6 before:content-[''] ${isSidebarOpen ? 'translate-x-0 translate-y-0 scale-100 opacity-100' : '-translate-x-8 translate-y-2 scale-[0.98] opacity-0 pointer-events-none'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Botty</p>
                <h1 className="mt-2 text-3xl font-semibold">Local OSS</h1>
                <p className="mt-2 text-sm text-stone-300">{user.displayName || user.email}</p>
              </div>

              <button onClick={() => setIsSidebarOpen(false)} className="rounded-2xl border border-white/10 px-3 py-2 text-stone-300 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
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

            <button onClick={() => setIsDarkMode(value => !value)} className="rounded-2xl border border-white/10 px-4 py-3 text-left flex items-center gap-3 text-stone-300 hover:bg-white/5">
              {isDarkMode ? <SunMedium className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDarkMode ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="mt-auto rounded-2xl border border-white/8 bg-white/6 p-4 text-sm text-stone-300 backdrop-blur-sm">
              <p>Providers: {availableProviders.length ? availableProviders.join(', ') : 'none configured'}</p>
              <p className="mt-2">Tokens today: {dailyTokens.toLocaleString()}</p>
              <p className="mt-2">Stored keys: {apiKeys.length}</p>
            </div>

            <button onClick={handleLogout} className="rounded-2xl border border-white/10 px-4 py-3 text-left flex items-center gap-3 text-stone-300 hover:bg-white/5">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </aside>

          <main className={`${shellPanelClass} min-h-[calc(100dvh-1.5rem)] pt-16`}>
            <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold capitalize">{activeTab}</h2>
                <p className={`text-sm ${subtleTextClass}`}>
                  {activeTab === 'chat' ? 'Send prompts through Claude or any configured local provider.' : null}
                  {activeTab === 'history' ? 'Reload or delete stored conversations.' : null}
                  {activeTab === 'memory' ? 'Manage facts and URLs that feed the prompt context.' : null}
                  {activeTab === 'settings' ? 'Save keys and runtime preferences used by the local server.' : null}
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <button onClick={() => setIsSidebarOpen(true)} className="rounded-2xl border border-stone-300 bg-white/80 px-4 py-2 text-sm flex items-center gap-2 dark:border-white/10 dark:bg-white/5 dark:text-stone-100">
                  <Menu className="w-4 h-4" />
                  {isSidebarOpen ? 'Menu open' : 'Open menu'}
                </button>
                <button onClick={() => void refreshAll()} className={actionButtonClass}>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
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
                        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">{message.role === 'user' ? 'You' : message.model || 'Assistant'}</div>
                        <div className="whitespace-pre-wrap leading-7 text-[15px]">{message.content}</div>
                      </div>
                    ))}
                  </div>

                  {chatError ? <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{chatError}</div> : null}

                  <div className={`mt-4 rounded-[1.5rem] p-3 ${isDarkMode ? 'border border-white/8 bg-[#111927]' : 'border border-stone-200 bg-white'}`}>
                    <div className="grid md:grid-cols-[180px_1fr] gap-3 mb-3">
                      <select
                        value={provider}
                        onChange={event => {
                          const nextProvider = event.target.value;
                          setProvider(nextProvider);
                          if (nextProvider !== 'auto') {
                            setModel(DEFAULT_MODELS[nextProvider] || '');
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
                      rows={5}
                      placeholder="Ask Claude to debug, design, or write code..."
                      className={textareaClass}
                    />

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className={`text-xs ${subtleTextClass}`}>Auth: local JWT. Memory: {useMemory ? 'enabled' : 'disabled'}.</p>
                      <button onClick={() => void sendPrompt()} disabled={isSending} className="rounded-2xl bg-stone-900 text-white px-4 py-2.5 flex items-center gap-2 disabled:opacity-60">
                        <Send className="w-4 h-4" />
                        {isSending ? 'Sending...' : 'Send'}
                      </button>
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
                    <textarea value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} rows={6} className={isDarkMode ? 'w-full rounded-2xl border border-white/10 px-3 py-2 bg-[#0b1220] text-stone-100' : 'w-full rounded-2xl border border-stone-200 px-3 py-2'} />
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

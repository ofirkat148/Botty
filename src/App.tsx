import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send, History, Cpu, Zap, Clock, BarChart3, ChevronRight,
  AlertCircle, CheckCircle2, Loader2, Terminal, Settings,
  Sparkles, Plus, Mic, MicOff, Brain, Trash2, Globe, Key,
  MessageSquare, User, Bot, X, FileUp, FileText, Paperclip,
  LogOut, LogIn, Mail, ShieldCheck, ShieldOff, PanelLeft,
  Copy, Menu, RefreshCw
} from 'lucide-react';
import { format, isToday, isYesterday, subDays, startOfDay, isAfter } from 'date-fns';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';

// ─── Utilities ────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ─── Error Boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, info: any) { console.error('ErrorBoundary', error, info); }
  render() {
    if (this.state.hasError) return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#e5e5e5] p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6"><AlertCircle className="w-8 h-8 text-red-500" /></div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-gray-500 mb-6">Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors">Refresh</button>
          {process.env.NODE_ENV === 'development' && <pre className="mt-6 p-4 bg-gray-50 rounded-lg text-left text-xs overflow-auto max-h-40 text-red-600">{this.state.error?.toString()}</pre>}
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ─── Code Block ───────────────────────────────────────────────────────────────

const CodeBlock = ({ children, onCopy }: { children: any; onCopy?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const handleCopy = () => {
    if (preRef.current) { navigator.clipboard.writeText(preRef.current.innerText); setCopied(true); onCopy?.(); setTimeout(() => setCopied(false), 2000); }
  };
  return (
    <div className="relative group/code my-4 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
      <div className="absolute top-2 left-4 flex items-center gap-2 z-20">
        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-mono uppercase tracking-widest"><Terminal className="w-3 h-3" /><span>Snippet</span></div>
      </div>
      <div className="absolute top-2 right-2 z-20">
        <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/90 rounded-lg transition-all border border-white/10 text-[10px] font-medium uppercase tracking-wider">
          {copied ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /><span>Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
        </button>
      </div>
      <pre ref={preRef} className="bg-[#0d0d0d] text-white p-5 pt-12 rounded-xl overflow-x-auto font-mono text-xs m-0">{children}</pre>
    </div>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppUser { uid: string; email: string; displayName?: string; photoURL?: string; }

interface LLMRequest {
  id: string; prompt: string; response: string; model: string;
  tokens_used: number; status: string; timestamp: any;
  conversationId?: string; uid?: string;
}

interface Fact { id: string; content: string; timestamp: any; }
interface MemoryFile { id: string; name: string; type: string; size: number; timestamp: any; isSkill?: boolean; }

const MODELS = [
  { id: 'gemini-3-flash-preview',        provider: 'google',    name: 'Gemini 3 Flash',              type: 'Speed',      icon: Zap,        description: 'Optimised for speed.' },
  { id: 'gemini-3.1-pro-preview',        provider: 'google',    name: 'Gemini 3.1 Pro',              type: 'Reasoning',  icon: ShieldCheck, description: 'Complex reasoning.' },
  { id: 'gemini-3.1-flash-lite-preview', provider: 'google',    name: 'Gemini 3.1 Flash Lite',       type: 'Lite',       icon: Zap,        description: 'Ultra-fast.' },
  { id: 'gemini-flash-latest',           provider: 'google',    name: 'Gemini Flash (Stable)',        type: 'Balanced',   icon: Zap,        description: 'Stable Gemini Flash.' },
  { id: 'gpt-4o',                        provider: 'openai',    name: 'GPT-4o',                      type: 'Balanced',   icon: Cpu,        description: 'OpenAI flagship.' },
  { id: 'gpt-4o-mini',                   provider: 'openai',    name: 'GPT-4o Mini',                 type: 'Speed',      icon: Zap,        description: 'Fast & affordable.' },
  { id: 'claude-3-5-sonnet-20240620',    provider: 'anthropic', name: 'Claude 3.5 Sonnet',           type: 'Creative',   icon: ShieldCheck, description: 'High-intelligence.' },
  { id: 'claude-3-5-haiku-20241022',     provider: 'anthropic', name: 'Claude 3.5 Haiku',            type: 'Speed',      icon: Zap,        description: 'Fastest Anthropic.' },
  { id: 'llama-3.3-70b-versatile',       provider: 'groq',      name: 'Llama 3.3 70B',               type: 'Versatile',  icon: Cpu,        description: 'Meta via Groq.' },
  { id: 'deepseek-chat',                 provider: 'deepseek',  name: 'DeepSeek V3',                 type: 'Reasoning',  icon: Brain,      description: 'Open-weights DeepSeek.' },
  { id: 'mistral-large-latest',          provider: 'mistral',   name: 'Mistral Large',               type: 'Balanced',   icon: ShieldCheck, description: 'Mistral flagship.' },
  { id: 'grok-beta',                     provider: 'xai',       name: 'Grok Beta',                   type: 'Real-time',  icon: Zap,        description: 'xAI with real-time.' },
  { id: 'hypereal',                      provider: 'hypereal',  name: 'Hypereal',                    type: 'Experimental', icon: Sparkles, description: 'Experimental.' },
  { id: 'gpt-4o',                        provider: 'github',    name: 'GitHub Copilot (GPT-4o)',     type: 'Balanced',   icon: Cpu,        description: 'Copilot GPT-4o.' },
  { id: 'claude-3-5-sonnet',             provider: 'github',    name: 'GitHub Copilot (Claude 3.5)', type: 'Creative',   icon: ShieldCheck, description: 'Copilot Claude 3.5.' },
  { id: 'ollama',                        provider: 'local',     name: 'Ollama / Local',              type: 'Local',      icon: Cpu,        description: 'Local LLM endpoint.' },
  { id: 'auto',                          provider: 'auto',      name: 'Smart Router',                type: 'Dynamic',    icon: Cpu,        description: 'Best model auto-selected.' },
];

const DAILY_TOKEN_LIMIT = 500_000;

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [user, setUser]               = useState<AppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn]  = useState(false);

  // On mount, fetch the current session from the server
  useEffect(() => {
    fetch('/auth/me')
      .then(r => r.json())
      .then(data => { setUser(data.user ?? null); setIsAuthLoading(false); })
      .catch(() => setIsAuthLoading(false));
  }, []);

  // After OAuth redirect, parse ?auth= query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('auth');
    if (authResult === 'success') {
      // Re-fetch user, then clean URL
      fetch('/auth/me').then(r => r.json()).then(data => {
        setUser(data.user ?? null);
        showNotification('Signed in successfully!', 'success');
        window.history.replaceState({}, '', '/');
      });
    } else if (authResult === 'failed') {
      showNotification('Sign-in failed. Please try again.', 'error');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const signInWithGoogle = () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    // Server-side OAuth redirect — works in all contexts (no popup)
    window.location.href = '/auth/google';
  };

  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST' });
    setUser(null);
    setHistory([]);
    setFacts([]);
    setMemoryFiles([]);
    setApiKeys([]);
    showNotification('Signed out successfully', 'success');
  };

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('selectedModel') || 'auto');
  const [history, setHistory] = useState<LLMRequest[]>([]);
  const [dailyTokens, setDailyTokens] = useState(0);
  const [modelUsage, setModelUsage] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'settings' | 'memory'>('chat');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; model?: string; isError?: boolean; media?: { preview: string; type: string }[] }[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('selectedModel', selectedModelId); }, [selectedModelId]);

  // ── Settings & memory state ─────────────────────────────────────────────────
  const [apiKeys, setApiKeys]                   = useState<{ provider: string; key: string }[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>(() => {
    const s = localStorage.getItem('availableProviders'); return s ? JSON.parse(s) : [];
  });
  const [localUrl, setLocalUrl]       = useState('http://localhost:11434');
  const [tgBotInfo, setTgBotInfo]     = useState<any>(null);
  const [facts, setFacts]             = useState<Fact[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [memoryUrls, setMemoryUrls]   = useState<{ id: string; url: string; title: string; timestamp: any }[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File; preview: string; type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newFact, setNewFact] = useState('');
  const [newUrl,  setNewUrl]  = useState('');
  const [isAddingUrl, setIsAddingUrl]   = useState(false);
  const [isUploading, setIsUploading]   = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSandboxed, setIsSandboxed]   = useState(false);
  const [useMemory, setUseMemory]       = useState(true);
  const [autoMemory, setAutoMemory]     = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isDragging, setIsDragging]     = useState(false);
  const [recognition, setRecognition]   = useState<any>(null);
  const [isSavingKey, setIsSavingKey]   = useState<string | null>(null);
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);
  const [isCleaningFacts, setIsCleaningFacts] = useState(false);
  const [isSummarizing, setIsSummarizing]     = useState(false);
  const [summary, setSummary]                 = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [enterToSend, setEnterToSend]           = useState(() => { const s = localStorage.getItem('enter_to_send'); return s !== null ? JSON.parse(s) : true; });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => { const s = localStorage.getItem('sidebar_collapsed'); return s !== null ? JSON.parse(s) : window.innerWidth < 768; });
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedIndex, setCopiedIndex]   = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem('availableProviders', JSON.stringify(availableProviders)); }, [availableProviders]);
  useEffect(() => { localStorage.setItem('enter_to_send', JSON.stringify(enterToSend)); }, [enterToSend]);
  useEffect(() => { localStorage.setItem('sidebar_collapsed', JSON.stringify(isSidebarCollapsed)); }, [isSidebarCollapsed]);
  useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 5000); return () => clearTimeout(t); } }, [notification]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatMessages, isLoading]);
  useEffect(() => { const r = () => { const m = window.innerWidth < 768; setIsMobile(m); if (m) setIsSidebarCollapsed(true); }; r(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);

  const showNotification = (message: any, type: 'success' | 'error' = 'success') => {
    setNotification({ message: typeof message === 'string' ? message : String(message || ''), type });
  };

  // ── Load data when user changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) { setHistory([]); setFacts([]); setMemoryFiles([]); setApiKeys([]); return; }
    fetchHistory();
    fetchFacts();
    fetchMemoryFiles();
    fetchMemoryUrls();
    fetchApiKeys();
    fetchUsage();
    fetchBotInfo();
    fetchUserSettings();
    fetchAvailableProviders();
  }, [user]);

  useEffect(() => { setupVoice(); }, []);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchHistory = async () => {
    if (!user) return;
    const r = await fetch('/api/history'); if (!r.ok) return;
    const data = await r.json();
    data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setHistory(data);
  };

  const fetchFacts = async () => {
    if (!user) return;
    const r = await fetch('/api/facts'); if (!r.ok) return;
    const data = await r.json();
    data.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setFacts(data);
  };

  const fetchMemoryFiles = async () => {
    if (!user) return;
    const r = await fetch('/api/memory-files'); if (!r.ok) return;
    const data = await r.json();
    setMemoryFiles(data);
  };

  const fetchMemoryUrls = async () => {
    if (!user) return;
    const r = await fetch('/api/memory-urls'); if (!r.ok) return;
    setMemoryUrls(await r.json());
  };

  const fetchApiKeys = async () => {
    if (!user) return;
    const r = await fetch('/api/keys'); if (!r.ok) return;
    setApiKeys(await r.json());
  };

  const fetchAvailableProviders = async () => {
    if (!user) return;
    setIsRefreshingProviders(true);
    try {
      const r = await fetch('/api/available-providers'); if (!r.ok) return;
      const data = await r.json();
      setAvailableProviders(data.providers ?? []);
    } finally { setIsRefreshingProviders(false); }
  };

  const fetchUsage = async () => {
    if (!user) return;
    const r = await fetch('/api/usage'); if (!r.ok) return;
    const data = await r.json();
    setDailyTokens(data.tokens ?? 0);
    setModelUsage(data.modelUsage ?? {});
  };

  const fetchBotInfo = async () => {
    const r = await fetch('/api/settings'); if (!r.ok) return;
    const data = await r.json();
    setTgBotInfo(data.bot);
  };

  const fetchUserSettings = async () => {
    if (!user) return;
    const r = await fetch('/api/user-settings'); if (!r.ok) return;
    const data = await r.json();
    if (data.systemPrompt !== undefined) setSystemPrompt(data.systemPrompt);
    if (data.localUrl     !== undefined) setLocalUrl(data.localUrl);
    if (data.useMemory    !== undefined) setUseMemory(data.useMemory);
    if (data.autoMemory   !== undefined) setAutoMemory(data.autoMemory);
  };

  // ── Grouped history (same logic as before) ──────────────────────────────────
  const groupedHistory = useMemo(() => {
    const withId: Record<string, LLMRequest[]> = {};
    const withoutId: LLMRequest[] = [];
    history.forEach(req => {
      if (req.conversationId) { (withId[req.conversationId] ??= []).push(req); }
      else withoutId.push(req);
    });
    const conversations: any[] = [];
    Object.entries(withId).forEach(([id, msgs]) => {
      const sorted = [...msgs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      conversations.push({ id, lastReq: sorted[0], count: msgs.length, timestamp: sorted[0].timestamp });
    });
    if (withoutId.length > 0) {
      const sorted = [...withoutId].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      let group: LLMRequest[] = [];
      sorted.forEach((req, i) => {
        if (!group.length) { group.push(req); }
        else {
          const diff = Math.abs(new Date(group[0].timestamp).getTime() - new Date(req.timestamp).getTime());
          if (diff < 3_600_000) group.push(req);
          else { conversations.push({ id: `legacy_${group[0].id}`, lastReq: group[0], count: group.length, timestamp: group[0].timestamp }); group = [req]; }
        }
        if (i === sorted.length - 1) conversations.push({ id: `legacy_${group[0].id}`, lastReq: group[0], count: group.length, timestamp: group[0].timestamp });
      });
    }
    const now = new Date();
    const groups: Record<string, any[]> = { 'Today': [], 'Yesterday': [], 'Previous 7 Days': [], 'Previous 30 Days': [], 'Older': [] };
    conversations.forEach(conv => {
      const d = new Date(conv.timestamp);
      if      (isToday(d))                              groups['Today'].push(conv);
      else if (isYesterday(d))                          groups['Yesterday'].push(conv);
      else if (isAfter(d, subDays(startOfDay(now), 6))) groups['Previous 7 Days'].push(conv);
      else if (isAfter(d, subDays(startOfDay(now),29))) groups['Previous 30 Days'].push(conv);
      else                                              groups['Older'].push(conv);
    });
    return Object.entries(groups).filter(([,v]) => v.length > 0).map(([label, items]) => ({ label, items: items.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }));
  }, [history]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const safeFormatDate = (ts: any) => {
    if (!ts) return 'Just now';
    try { const d = new Date(ts); return isNaN(d.getTime()) ? 'Recently' : format(d, 'MMM d, HH:mm'); } catch { return 'Recently'; }
  };

  const setupVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const rec = new SR(); rec.continuous = false; rec.interimResults = false; rec.lang = 'en-US';
    rec.onresult = (e: any) => { setPrompt(e.results[0][0].transcript); setIsVoiceActive(false); };
    rec.onerror  = (e: any) => { if (e.error === 'not-allowed') showNotification('Microphone access denied.', 'error'); setIsVoiceActive(false); };
    rec.onend    = () => setIsVoiceActive(false);
    setRecognition(rec);
  };

  const toggleVoice = async () => {
    if (!recognition) { setError('Speech recognition not supported.'); return; }
    if (isVoiceActive) { recognition.stop(); return; }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognition.start(); setIsVoiceActive(true);
    } catch { showNotification('Could not access microphone.', 'error'); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(file => {
      const r = new FileReader();
      r.onloadend = () => setSelectedMedia(prev => [...prev, { file, preview: r.result as string, type: file.type }]);
      r.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => {
      if (activeTab === 'memory') { uploadMemoryFileDirect(file); }
      else {
        const r = new FileReader();
        r.onloadend = () => setSelectedMedia(prev => [...prev, { file, preview: r.result as string, type: file.type }]);
        r.readAsDataURL(file);
      }
    });
  };

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) { setCopiedIndex(index); setTimeout(() => setCopiedIndex(null), 2000); }
    showNotification('Copied!', 'success');
  };

  // ── Settings actions ────────────────────────────────────────────────────────

  const saveSystemPrompt = async (val: string) => {
    if (!user) return;
    setIsSavingSystemPrompt(true);
    try {
      const r = await fetch('/api/user-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemPrompt: val }) });
      showNotification(r.ok ? 'System Prompt Saved' : 'Failed to save', r.ok ? 'success' : 'error');
    } finally { setIsSavingSystemPrompt(false); }
  };

  const toggleMemory = async (type: 'use' | 'auto') => {
    const newUse  = type === 'use'  ? !useMemory  : useMemory;
    const newAuto = type === 'auto' ? !autoMemory : autoMemory;
    if (type === 'use')  setUseMemory(newUse);
    else                  setAutoMemory(newAuto);
    await fetch('/api/user-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useMemory: newUse, autoMemory: newAuto }) });
    showNotification('Memory settings updated', 'success');
  };

  const saveLocalUrl = async (url: string) => {
    await fetch('/api/user-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ localUrl: url }) });
    setLocalUrl(url); showNotification('Local LLM URL updated', 'success'); fetchAvailableProviders();
  };

  const saveKey = async (provider: string, key: string) => {
    if (!user) return;
    setIsSavingKey(provider);
    try {
      const r = await fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, key }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      showNotification(`${provider.toUpperCase()} Key saved!`, 'success');
      fetchApiKeys(); fetchAvailableProviders();
    } catch (e: any) { showNotification(e.message, 'error'); }
    finally { setIsSavingKey(null); }
  };

  const deleteKey = async (provider: string) => {
    await fetch(`/api/keys/${provider}`, { method: 'DELETE' });
    showNotification(`${provider.toUpperCase()} Key removed.`, 'success');
    fetchApiKeys(); fetchAvailableProviders();
  };

  // ── Memory actions ──────────────────────────────────────────────────────────

  const uploadMemoryFileDirect = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    try {
      // Netlify Functions don't support multipart — send as base64 JSON
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onloadend = () => res((r.result as string).split(',')[1]);
        r.onerror   = rej;
        r.readAsDataURL(file);
      });
      const r = await fetch('/api/memory-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type, data, isSkill: file.name.toLowerCase().endsWith('.md') })
      });
      const d = await r.json();
      showNotification(r.ok ? `"${file.name}" uploaded.` : (d.error ?? 'Upload failed'), r.ok ? 'success' : 'error');
      if (r.ok) fetchMemoryFiles();
    } finally { setIsUploading(false); }
  };

  const uploadMemoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) { await uploadMemoryFileDirect(file); e.target.value = ''; }
  };

  const deleteMemoryFile = async (id: string) => {
    await fetch(`/api/memory-files/${id}`, { method: 'DELETE' }); fetchMemoryFiles();
  };

  const toggleSkill = async (id: string, cur: boolean) => {
    const r = await fetch(`/api/memory-files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isSkill: !cur }) });
    showNotification(r.ok ? `File marked as ${!cur ? 'skill' : 'regular memory'}` : 'Failed to update', r.ok ? 'success' : 'error');
    if (r.ok) fetchMemoryFiles();
  };

  const addFact = async () => {
    if (!newFact.trim() || !user) return;
    await fetch('/api/facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newFact }) });
    setNewFact(''); fetchFacts();
  };

  const deleteFact = async (id: string) => { await fetch(`/api/facts/${id}`, { method: 'DELETE' }); fetchFacts(); };

  const addMemoryUrl = async () => {
    if (!newUrl.trim() || !user) return;
    setIsAddingUrl(true);
    try {
      const r = await fetch('/api/memory-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: newUrl }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Failed');
      setNewUrl(''); showNotification('Website added!', 'success'); fetchMemoryUrls();
    } catch (e: any) { showNotification(e.message, 'error'); }
    finally { setIsAddingUrl(false); }
  };

  const deleteMemoryUrl = async (id: string) => { await fetch(`/api/memory-urls/${id}`, { method: 'DELETE' }); fetchMemoryUrls(); };

  const cleanupFacts = async () => {
    if (!user) return;
    setIsCleaningFacts(true);
    try {
      const r = await fetch('/api/facts/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await r.json();
      if (r.ok) { showNotification(`Reduced ${data.originalCount} → ${data.newCount} facts.`, 'success'); fetchFacts(); }
      else throw new Error(data.error);
    } catch (e: any) { showNotification(e.message, 'error'); }
    finally { setIsCleaningFacts(false); }
  };

  // ── Chat actions ────────────────────────────────────────────────────────────

  const newChat = () => { setChatMessages([]); setCurrentConversationId(crypto.randomUUID()); setActiveTab('chat'); };

  const continueConversation = (req: LLMRequest) => {
    const msgs = history
      .filter(h => h.conversationId === req.conversationId || (!h.conversationId && h.id === req.id))
      .sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .flatMap(m => [{ role: 'user' as const, content: m.prompt }, { role: 'assistant' as const, content: m.response, model: m.model }]);
    setChatMessages(msgs.length ? msgs : [{ role: 'user', content: req.prompt }, { role: 'assistant', content: req.response, model: req.model }]);
    setCurrentConversationId(req.conversationId ?? req.id);
    setActiveTab('chat');
    showNotification('Conversation loaded.', 'success');
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const r = await fetch(`/api/history/group/${id}`, { method: 'DELETE' });
    const data = await r.json();
    showNotification(r.ok ? 'Conversation deleted.' : (data.error ?? 'Failed'), r.ok ? 'success' : 'error');
    if (r.ok) fetchHistory();
  };

  const generateSummary = async () => {
    if (!chatMessages.length) { showNotification('No messages to summarise.', 'error'); return; }
    setIsSummarizing(true);
    try {
      const r = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: chatMessages }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSummary(data.summary); setShowSummaryModal(true);
    } catch (e: any) { showNotification(e.message, 'error'); }
    finally { setIsSummarizing(false); }
  };

  const sendEmail = async () => {
    if (!user?.email || !chatMessages.length) { showNotification(!user?.email ? 'Must be signed in.' : 'No messages.', 'error'); return; }
    setIsSendingEmail(true);
    try {
      const body = `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px"><h2>Chat Summary</h2><p style="color:#666;font-size:14px">Sent from LLM Router on ${new Date().toLocaleString()}</p><div style="margin-top:20px">${chatMessages.map(m=>`<b>${m.role.toUpperCase()}:</b><br/>${m.content.replace(/\n/g,'<br/>')}`).join('<br/><br/><hr/><br/>')}</div></div>`;
      const r = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: user.email, subject: `Chat Summary: ${chatMessages[0].content.substring(0,30)}...`, body }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      showNotification(`Email sent to ${user.email}`, 'success');
    } catch (e: any) { showNotification(e.message, 'error'); }
    finally { setIsSendingEmail(false); }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    if (availableProviders.length === 0) { setError('No API keys configured. Please add a key in Settings.'); return; }

    const currentPrompt = prompt;
    const currentMedia  = [...selectedMedia];
    const convId        = currentConversationId ?? crypto.randomUUID();
    if (!currentConversationId) setCurrentConversationId(convId);

    setChatMessages(prev => [...prev, { role: 'user', content: currentPrompt, media: currentMedia.map(m => ({ preview: m.preview, type: m.type })) }]);
    setPrompt(''); setSelectedMedia([]); setIsLoading(true); setError(null);

    let targetModel    = '';
    let targetProvider = '';
    let attempts       = 0;
    const maxAttempts  = 10;
    const triedModels: string[] = [];

    try {
      while (attempts < maxAttempts) {
        try {
          if (selectedModelId === 'auto' || attempts > 0) {
            const routeRes = await fetch('/api/smart-route', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: currentPrompt, hasMedia: currentMedia.length > 0, excludeModels: triedModels }) });
            if (!routeRes.ok) { const d = await routeRes.json().catch(() => ({})); throw new Error((d as any).error ?? `Routing failed (${routeRes.status})`); }
            const route = await routeRes.json();
            targetModel    = route.model;
            targetProvider = route.provider;
            if (triedModels.includes(targetModel)) {
              const fb = MODELS.find(m => m.id !== 'auto' && m.id !== 'ollama' && !triedModels.includes(m.id) && availableProviders.includes(m.provider));
              if (fb) { targetModel = fb.id; targetProvider = fb.provider; }
            }
          } else {
            const mc = MODELS.find(m => m.id === selectedModelId);
            targetModel    = mc?.id ?? '';
            targetProvider = mc?.provider ?? '';
          }
          triedModels.push(targetModel);

          const validateRes = await fetch('/api/validate-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: targetProvider, model: targetModel }) });
          if (!validateRes.ok) { const d = await validateRes.json().catch(() => ({})); throw new Error((d as any).error ?? 'Validation failed'); }

          const proxyRes = await fetch('/api/proxy-request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: currentPrompt, provider: targetProvider, model: targetModel, messages: chatMessages.slice(-10), sandboxed: isSandboxed, systemPrompt,
              media: currentMedia.map(m => ({ inlineData: { mimeType: m.type, data: m.preview.split(',')[1] } })) })
          });

          if (!proxyRes.ok) {
            const d = await proxyRes.json().catch(() => ({}));
            const msg = (d as any).error ?? `Server error (${proxyRes.status})`;
            if (proxyRes.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('limit')) {
              attempts++;
              if (attempts < maxAttempts) { showNotification(`${targetModel} quota hit. Retrying…`, 'error'); await new Promise(r => setTimeout(r, 1000)); continue; }
            }
            throw new Error(msg);
          }

          const data = await proxyRes.json();
          const text       = data.text ?? 'No response.';
          const tokensUsed = typeof data.tokensUsed === 'number' ? data.tokensUsed : 0;

          setChatMessages(prev => [...prev, { role: 'assistant', content: text, model: targetModel }]);

          if (user) {
            await fetch('/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: currentPrompt, response: text, model: `${targetProvider}:${targetModel}`, tokens_used: tokensUsed, status: 'success', conversationId: convId }) });
            setDailyTokens(prev => prev + tokensUsed);
            const sk = `${targetProvider}:${targetModel}`.replace(/\./g, '_');
            setModelUsage(prev => ({ ...prev, [sk]: (prev[sk] ?? 0) + tokensUsed }));
            fetchUsage();

            fetch('/api/extract-facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: currentPrompt, response: text }) })
              .then(r => { if (r.status === 429) console.warn('Fact extraction skipped (quota).'); else if (r.ok) fetchFacts(); })
              .catch(e => console.error('Fact extraction error:', e));
          }
          break;

        } catch (err: any) {
          attempts++;
          const msg = err?.message ?? String(err ?? 'Unknown');
          if (attempts >= maxAttempts) {
            setError(msg.substring(0, 1000));
            const isQuota = msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('limit');
            setChatMessages(prev => [...prev, { role: 'assistant', content: `### ⚠️ Error\n${msg.substring(0,1000)}${isQuota ? '\n\n**Tip:** Quota reached. Switch providers in Settings.' : '\n\n**Tip:** All retry attempts failed.'}`, isError: true }]);
          } else {
            showNotification(`${targetModel || 'Model'} failed. Retrying…`, 'error');
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    } finally { setIsLoading(false); }
  };

  const handleTabChange = (tab: 'chat' | 'history' | 'settings' | 'memory') => {
    setActiveTab(tab); if (window.innerWidth < 768) setIsMobileMenuOpen(false);
  };

  const usagePercentage = Math.min((dailyTokens / DAILY_TOKEN_LIMIT) * 100, 100);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
    <div className="flex h-screen bg-white text-[#0d0d0d] relative">

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
            className={cn("fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px]",
              notification.type === 'success' ? "bg-black text-white" : "bg-red-500 text-white")}>
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] md:hidden" />}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={isMobile ? { x: -280 } : false}
        animate={{ width: isMobile ? 280 : (isSidebarCollapsed ? 0 : 280), x: (isMobile && !isMobileMenuOpen) ? -280 : 0 }}
        className="bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col z-[70] overflow-hidden shrink-0 fixed md:relative top-0 left-0 h-full"
      >
        <div className="w-[280px] h-full flex flex-col">
          <div className="flex items-center justify-between p-4">
            {!isSidebarCollapsed && !isMobile && (
              <button onClick={newChat} className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#f0f0f0] transition-all text-sm font-medium shadow-sm truncate">
                <Plus className="w-4 h-4 shrink-0" /><span className="truncate">New Chat</span>
              </button>
            )}
            <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="hidden md:flex p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5 ml-2"><PanelLeft className="w-5 h-5" /></button>
            {isMobile && <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5 ml-2"><X className="w-5 h-5" /></button>}
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
            <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Navigation</div>
            {(['chat','history','memory','settings'] as const).map(tab => (
              <button key={tab} onClick={() => handleTabChange(tab)} className={cn("sidebar-item w-full", activeTab === tab && "active")}>
                {tab === 'chat' && <MessageSquare className="w-4 h-4" />}
                {tab === 'history' && <History className="w-4 h-4" />}
                {tab === 'memory' && <Brain className="w-4 h-4" />}
                {tab === 'settings' && <Settings className="w-4 h-4" />}
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="p-4 border-t border-[#e5e5e5] space-y-3">
            {isAuthLoading ? (
              <div className="flex items-center justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : user ? (
              <div className="flex items-center justify-between px-3 py-2 bg-white border border-[#e5e5e5] rounded-xl shadow-sm">
                <div className="flex items-center gap-2 overflow-hidden">
                  {user.photoURL && <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />}
                  <div className="overflow-hidden">
                    <p className="text-[11px] font-semibold truncate">{user.displayName ?? user.email}</p>
                    <p className="text-[9px] text-gray-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 transition-all"><LogOut className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} disabled={isSigningIn}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-black text-white hover:opacity-80 transition-all text-sm disabled:opacity-50">
                {isSigningIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>{isSigningIn ? 'Redirecting…' : 'Sign in with Google'}</span>
              </button>
            )}

            <div className="px-3">
              <button onClick={() => setIsSandboxed(!isSandboxed)}
                className={cn("w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all",
                  isSandboxed ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" : "bg-white border-[#e5e5e5] text-gray-500 hover:bg-gray-50")}>
                <div className="flex items-center gap-2">
                  {isSandboxed ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                  <span className="text-xs font-semibold">Sandboxed Mode</span>
                </div>
                <div className={cn("w-8 h-4 rounded-full relative transition-colors", isSandboxed ? "bg-emerald-500" : "bg-gray-200")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isSandboxed ? "left-4.5" : "left-0.5")} />
                </div>
              </button>
              <p className="text-[9px] text-gray-400 mt-1.5 px-1 leading-relaxed">
                {isSandboxed ? "LLM strictly uses your facts and files only." : "LLM uses full knowledge + your memory."}
              </p>
            </div>

            <div className="px-3 pt-1 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">Server Active</span>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main */}
      <main className="flex-1 flex flex-col relative overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-[#e5e5e5] bg-white z-50">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5"><Menu className="w-6 h-6" /></button>
          {activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col items-center px-2">
              <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}
                className="bg-[#f4f4f4] border border-[#e5e5e5] rounded-lg text-[11px] font-medium px-2 py-1 outline-none w-full max-w-[180px]">
                {MODELS.filter(m => m.id === 'auto' ? availableProviders.length > 0 : availableProviders.includes(m.provider)).map(m => <option key={m.id+m.provider} value={m.id}>{m.name}</option>)}
                {availableProviders.length === 0 && <option value="none" disabled>No models available</option>}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-500" /><span className="font-semibold text-sm">AI Assistant</span></div>
          )}
          <div className="flex items-center gap-1">
            {user && chatMessages.length > 0 && activeTab === 'chat' && (
              <button onClick={sendEmail} disabled={isSendingEmail} className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5">
                {isSendingEmail ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Mail className="w-5 h-5" />}
              </button>
            )}
            <button onClick={newChat} className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5"><Plus className="w-5 h-5" /></button>
          </div>
        </div>

        {isSidebarCollapsed && (
          <motion.button initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} onClick={() => setIsSidebarCollapsed(false)}
            className="hidden md:flex absolute top-4 left-4 z-50 p-2 text-gray-400 hover:text-black rounded-lg hover:bg-black/5 bg-white/50 backdrop-blur-sm border border-[#e5e5e5] shadow-sm">
            <PanelLeft className="w-5 h-5" />
          </motion.button>
        )}

        {isDragging && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center"><FileUp className="w-8 h-8" /></div>
              <p className="text-lg font-semibold">Drop files to upload</p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-start justify-between z-50 max-h-[150px] overflow-y-auto">
              <div className="flex items-start gap-2 text-red-600 text-sm flex-1 min-w-0"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span className="break-words">{error}</span></div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0"><X className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Chat Tab ── */}
        {activeTab === 'chat' && (
          <>
            <div className="hidden md:flex absolute top-0 left-0 right-0 p-4 justify-center z-10 bg-white/80 backdrop-blur-md">
              <div className="flex bg-[#f4f4f4] p-1.5 rounded-xl shadow-sm border border-[#e5e5e5] items-center gap-2">
                <div className="pl-2 flex items-center gap-2 text-gray-400"><Cpu className="w-3.5 h-3.5" /><span className="text-[10px] font-semibold uppercase tracking-wider">Model</span></div>
                <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value)}
                  className="bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium px-3 py-1.5 outline-none min-w-[160px]">
                  {MODELS.filter(m => m.id === 'auto' ? availableProviders.length > 0 : availableProviders.includes(m.provider)).map(m => <option key={m.id+m.provider} value={m.id}>{m.name}</option>)}
                  {availableProviders.length === 0 && <option value="none" disabled>No models available</option>}
                </select>
                <div className="h-4 w-px bg-gray-300 mx-1" />
                {user && chatMessages.length > 0 && (
                  <button onClick={sendEmail} disabled={isSendingEmail} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                    {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}<span>Email Chat</span>
                  </button>
                )}
                {chatMessages.length > 0 && (
                  <button onClick={generateSummary} disabled={isSummarizing} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                    {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}<span>Summarise</span>
                  </button>
                )}
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto pt-20 pb-32 px-4">
              <div className="max-w-3xl mx-auto space-y-8">
                {availableProviders.length === 0 && !isAuthLoading && user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center max-w-md mx-auto">
                    <AlertCircle className="w-6 h-6 text-amber-600 mx-auto mb-4" />
                    <h3 className="text-amber-900 font-semibold mb-1">No LLM Providers</h3>
                    <p className="text-amber-700 text-sm mb-4">Add an API key in Settings to get started.</p>
                    <button onClick={() => setActiveTab('settings')} className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700">
                      <Settings className="w-4 h-4" />Configure Settings
                    </button>
                  </div>
                )}
                {chatMessages.length === 0 && availableProviders.length > 0 && (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center"><Bot className="w-6 h-6" /></div>
                    <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full border border-[#e5e5e5] flex items-center justify-center flex-shrink-0 bg-white"><Bot className="w-4 h-4" /></div>}
                    <div className={cn(msg.role === 'user' ? "chat-bubble-user" : msg.isError ? "chat-bubble-error" : "chat-bubble-ai", "group relative")}>
                      {msg.role === 'assistant' && (
                        <button onClick={() => copyToClipboard(msg.content, i)}
                          className="absolute -top-2 -right-2 p-2 bg-white border border-[#e5e5e5] text-gray-400 hover:text-black rounded-xl shadow-sm opacity-40 hover:opacity-100 transition-all z-10">
                          {copiedIndex === i ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                      <div className="markdown-body">
                        <Markdown components={{ pre({ children }: any) { return <CodeBlock onCopy={() => showNotification('Code copied!', 'success')}>{children}</CodeBlock>; }, code({ className, children, ...props }: any) { return <code className={className} {...props}>{children}</code>; } }}>{msg.content}</Markdown>
                      </div>
                      {msg.media?.map((m, idx) => (
                        <div key={idx} className="mt-3">
                          {m.type.startsWith('image/') ? <img src={m.preview} alt="" className="max-w-[240px] max-h-[240px] rounded-lg border border-black/5 shadow-sm cursor-zoom-in" onClick={() => window.open(m.preview, '_blank')} /> : <div className="flex items-center gap-2 p-2 bg-black/5 rounded-lg"><FileText className="w-4 h-4 text-gray-500" /><span className="text-[10px] text-gray-500">Attached File</span></div>}
                        </div>
                      ))}
                      {msg.model && <div className="mt-2 text-[10px] text-gray-400 font-mono">Generated by {msg.model}</div>}
                    </div>
                    {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-[#10a37f] text-white flex items-center justify-center flex-shrink-0"><User className="w-4 h-4" /></div>}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full border border-[#e5e5e5] flex items-center justify-center flex-shrink-0 bg-white"><Bot className="w-4 h-4" /></div>
                    <div className="chat-bubble-ai flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin opacity-40" /><span className="text-gray-400 italic">Thinking…</span></div>
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
              <div className="max-w-3xl mx-auto relative">
                {selectedMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                    {selectedMedia.map((m, i) => (
                      <div key={i} className="relative group">
                        {m.type.startsWith('image/') ? <img src={m.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" /> : <div className="w-16 h-16 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center text-[8px] text-gray-400 p-1"><FileText className="w-6 h-6 mb-1 text-gray-300" /><span className="truncate w-full">{m.file.name}</span></div>}
                        <button onClick={() => setSelectedMedia(prev => prev.filter((_,j) => j !== i))} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="relative">
                  <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { if (enterToSend ? !e.shiftKey : (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(e as any); } } }}
                    placeholder={enterToSend ? "Message LLM Router… (Shift+Enter for new line)" : "Message LLM Router… (Cmd/Ctrl+Enter to send)"}
                    className="w-full bg-white border border-[#e5e5e5] rounded-2xl py-4 pl-12 md:pl-20 pr-16 md:pr-24 shadow-lg focus:ring-1 focus:ring-black/10 outline-none resize-none min-h-[56px] max-h-[200px] text-[15px]" />
                  <div className="absolute left-2 md:left-3 bottom-3 flex items-center gap-1">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-black"><Paperclip className="w-5 h-5" /></button>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" multiple accept="image/*,video/*,audio/*,application/pdf" />
                    <button type="button" onClick={toggleVoice} className={cn("p-2 rounded-full relative", isVoiceActive ? "text-[var(--color-accent)]" : "text-gray-400 hover:text-black")}>
                      {isVoiceActive && <div className="voice-active-ring" />}
                      {isVoiceActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="absolute right-2 md:right-3 bottom-3">
                    <button type="submit" disabled={!prompt.trim() || isLoading} className="p-2 bg-black text-white rounded-xl disabled:opacity-20 hover:opacity-80"><Send className="w-5 h-5" /></button>
                  </div>
                </form>
                <p className="text-center text-[11px] text-gray-400 mt-2">LLM Router can make mistakes. Check important info.</p>
              </div>
            </div>
          </>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-semibold">Chat History</h2>
                <button onClick={newChat} className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:opacity-80 w-full md:w-auto"><Plus className="w-4 h-4" />New Chat</button>
              </div>
              <div className="space-y-8">
                {groupedHistory.map(group => (
                  <div key={group.label}>
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">{group.label}</h3>
                    <div className="space-y-4">
                      {group.items.map((conv: any) => (
                        <div key={conv.id} onClick={() => continueConversation(conv.lastReq)} className="group p-5 border border-[#e5e5e5] rounded-2xl hover:bg-[#f9f9f9] transition-all cursor-pointer relative bg-white shadow-sm hover:shadow-md">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center"><MessageSquare className="w-4 h-4 text-gray-600" /></div>
                              <div><span className="text-[10px] font-mono text-gray-400 block">#{conv.id.substring(0,8)}</span><span className="text-[10px] text-gray-500">{safeFormatDate(conv.timestamp)}</span></div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-gray-100 text-[10px] font-bold text-gray-600 rounded-lg uppercase">{conv.count} {conv.count === 1 ? 'Message' : 'Messages'}</span>
                              {!conv.id.startsWith('legacy_') && <button onClick={e => deleteChat(e, conv.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate pr-24">{conv.lastReq.prompt}</h3>
                          <p className="text-xs text-gray-500 line-clamp-2 mb-4 pr-10">{conv.lastReq.response}</p>
                          <div className="flex items-center gap-4 text-[10px] text-gray-400 border-t border-gray-50 pt-3">
                            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" />{conv.lastReq.model}</span>
                            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />{conv.lastReq.tokens_used} tokens</span>
                          </div>
                          <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all">
                            <button className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-medium rounded-xl">Continue Chat<ChevronRight className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-24 border-2 border-dashed border-[#e5e5e5] rounded-3xl text-gray-400">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-500 mb-1">No history yet</p>
                    <p className="text-sm">Your conversations will appear here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold mb-8">Settings</h2>
              <div className="space-y-8">

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Local LLM</h3>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Endpoint URL (e.g. Ollama)</label>
                    <div className="flex gap-2">
                      <input type="text" value={localUrl} onChange={e => setLocalUrl(e.target.value)} placeholder="http://localhost:11434" className="flex-1 bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none focus:border-black/20" />
                      <button onClick={() => saveLocalUrl(localUrl)} className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium">Save</button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Interface</h3>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                    <div className="flex items-center justify-between">
                      <div><h4 className="text-sm font-medium">Enter to Send</h4><p className="text-xs text-gray-500">Shift+Enter for new line. Disabled = Cmd/Ctrl+Enter.</p></div>
                      <button onClick={() => setEnterToSend(!enterToSend)} className={`w-12 h-6 rounded-full relative ${enterToSend ? 'bg-black' : 'bg-gray-200'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enterToSend ? 'left-7' : 'left-1'}`} /></button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Memory & Personalisation</h3>
                  <div className="space-y-4">
                    {[{ label: 'Enable Personalisation', desc: 'AI uses saved facts and files.', key: 'use' as const, val: useMemory }, { label: 'Auto-Extract Facts', desc: 'AI learns facts from conversations.', key: 'auto' as const, val: autoMemory }].map(item => (
                      <div key={item.key} className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9] flex items-center justify-between">
                        <div><h4 className="text-sm font-medium">{item.label}</h4><p className="text-xs text-gray-500">{item.desc}</p></div>
                        <button onClick={() => toggleMemory(item.key)} className={`w-12 h-6 rounded-full relative ${item.val ? 'bg-black' : 'bg-gray-200'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${item.val ? 'left-7' : 'left-1'}`} /></button>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">AI Configuration</h3>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-2">System Prompt</label>
                    <textarea placeholder="e.g. You are a helpful assistant that speaks like a pirate." className="w-full bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none min-h-[100px] resize-none" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} />
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => saveSystemPrompt(systemPrompt)} disabled={isSavingSystemPrompt} className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2">
                        {isSavingSystemPrompt && <Loader2 className="w-3 h-3 animate-spin" />}Save System Prompt
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">API Keys</h3>
                    <button onClick={fetchAvailableProviders} disabled={isRefreshingProviders} className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest disabled:opacity-50">
                      <RefreshCw className={`w-3 h-3 ${isRefreshingProviders ? 'animate-spin' : ''}`} />Refresh
                    </button>
                  </div>
                  <div className="space-y-4">
                    {['google','openai','anthropic','xai','groq','deepseek','mistral','hypereal','github'].map(provider => {
                      const existing = apiKeys.find(k => k.provider === provider);
                      const isActive = availableProviders.includes(provider);
                      return (
                        <div key={provider} className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-500 uppercase">{provider}</label>
                            {isActive && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /><span className="text-[10px] font-medium text-emerald-600 uppercase">Active</span></div>}
                          </div>
                          <div className="flex gap-2">
                            <input type="password" placeholder={existing?.key ? `Saved: ${existing.key}` : 'Enter API Key'} className="flex-1 bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none"
                              onKeyDown={e => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value; if (v) { saveKey(provider, v); (e.target as HTMLInputElement).value = ''; } } }} />
                            <button onClick={e => { const inp = (e.currentTarget.previousElementSibling as HTMLInputElement); if (inp.value) { saveKey(provider, inp.value); inp.value = ''; } }} disabled={isSavingKey === provider} className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50 min-w-[80px]">
                              {isSavingKey === provider ? 'Checking…' : 'Save'}
                            </button>
                            {existing && <button onClick={() => deleteKey(provider)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Integrations</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                      <div className="flex items-center gap-2 mb-4"><Send className="w-4 h-4 text-blue-500" /><h4 className="text-sm font-medium">Telegram Bot</h4></div>
                      {tgBotInfo && (
                        <div className="mb-4 p-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">{tgBotInfo.first_name[0]}</div>
                          <div><h5 className="text-xs font-semibold text-emerald-900">{tgBotInfo.first_name}</h5><a href={`https://t.me/${tgBotInfo.username}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-600 hover:underline">@{tgBotInfo.username}</a></div>
                          <span className="ml-auto px-1.5 py-0.5 bg-emerald-200 text-emerald-700 text-[8px] font-bold rounded-full">Active</span>
                        </div>
                      )}
                      <div>
                        <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Bot Token</label>
                        <input type="password" placeholder="Enter Token" className="w-full bg-white border border-[#e5e5e5] rounded-lg px-2 py-1.5 text-xs outline-none"
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value;
                              if (!val) return;
                              const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'telegram_token', value: val }) });
                              const d = await r.json();
                              showNotification(r.ok ? 'Telegram Token Saved' : (d.error ?? 'Failed'), r.ok ? 'success' : 'error');
                              if (r.ok) { fetchBotInfo(); (e.target as HTMLInputElement).value = ''; }
                            }
                          }} />
                      </div>
                      {user && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                          <h5 className="text-[10px] font-bold text-blue-900 uppercase mb-1">Link your account</h5>
                          <p className="text-[10px] text-blue-700 mb-2">Send this to your bot:</p>
                          <div className="flex items-center justify-between bg-white p-2 rounded border border-blue-200">
                            <code className="text-[10px] font-mono text-blue-800">/link {user.uid}</code>
                            <button onClick={() => { navigator.clipboard.writeText(`/link ${user.uid}`); showNotification('Command copied!', 'success'); }} className="text-[10px] text-blue-500 hover:text-blue-700">Copy</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                      <div className="flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-emerald-500" /><h4 className="text-sm font-medium">Background Persistence</h4></div>
                      <p className="text-xs text-gray-500 mb-4">The server and Telegram Bot run 24/7. Close this window and your bot keeps responding.</p>
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wider">Server Engine Active</span>
                      </div>
                    </div>
                  </div>
                </section>

              </div>
            </div>
          </div>
        )}

        {/* ── Memory Tab ── */}
        {activeTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <h2 className="text-2xl font-semibold">Memory</h2>
                <button onClick={cleanupFacts} disabled={isCleaningFacts || facts.length < 2} className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-xs font-medium rounded-xl hover:opacity-80 disabled:opacity-20 w-full md:w-auto">
                  {isCleaningFacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}Clean Up Memory
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-8">Facts and files the assistant remembers across chats.</p>

              <section className="mb-12">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Facts</h3>
                <div className="flex gap-2 mb-6">
                  <input value={newFact} onChange={e => setNewFact(e.target.value)} placeholder="Add a new fact…" className="flex-1 border border-[#e5e5e5] rounded-xl px-4 py-2 text-sm outline-none" />
                  <button onClick={addFact} className="p-2 bg-black text-white rounded-xl hover:opacity-80"><Plus className="w-5 h-5" /></button>
                </div>
                <div className="space-y-3">
                  {facts.map(fact => (
                    <div key={fact.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 gap-3">
                      <p className="text-sm flex-1 break-words min-w-0">{fact.content}</p>
                      <button onClick={() => deleteFact(fact.id)} className="p-1.5 text-gray-400 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 opacity-100 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {facts.length === 0 && <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">No facts saved yet.</div>}
                </div>
              </section>

              <section className="mb-12">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Websites</h3>
                <div className="flex gap-2 mb-6">
                  <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com" className="flex-1 border border-[#e5e5e5] rounded-xl px-4 py-2 text-sm outline-none" />
                  <button onClick={addMemoryUrl} disabled={isAddingUrl} className="p-2 bg-black text-white rounded-xl hover:opacity-80 disabled:opacity-50">
                    {isAddingUrl ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                  </button>
                </div>
                <div className="space-y-3">
                  {memoryUrls.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 gap-3">
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{u.title}</p><p className="text-[10px] text-gray-400 truncate">{u.url}</p></div>
                      <button onClick={() => deleteMemoryUrl(u.id)} className="p-1.5 text-gray-400 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 opacity-100 shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                  {memoryUrls.length === 0 && <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">No websites saved yet.</div>}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Files</h3>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#e5e5e5] rounded-2xl cursor-pointer hover:bg-[#f9f9f9] group mb-6">
                  <div className="flex flex-col items-center justify-center">
                    {isUploading ? <Loader2 className="w-8 h-8 text-gray-400 animate-spin" /> : <><FileUp className="w-8 h-8 text-gray-400 group-hover:text-black mb-2" /><p className="text-xs text-gray-500">Click to upload or drag and drop</p><p className="text-[10px] text-gray-400 mt-1">TXT, MD, JSON, etc.</p></>}
                  </div>
                  <input type="file" className="hidden" onChange={uploadMemoryFile} disabled={isUploading} />
                </label>
                <div className="space-y-3">
                  {memoryFiles.map(file => (
                    <div key={file.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-[#f4f4f4] rounded-lg flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-gray-500" /></div>
                        <div className="min-w-0"><p className="text-sm font-medium truncate">{file.name}</p><p className="text-[10px] text-gray-400">{Math.round(file.size / 1024)} KB · {safeFormatDate(file.timestamp)}</p></div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleSkill(file.id, !!file.isSkill)} className={`p-1.5 rounded-lg ${file.isSkill ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500'}`} title={file.isSkill ? 'Marked as Skill' : 'Mark as Skill'}><Zap className={`w-4 h-4 ${file.isSkill ? 'fill-current' : ''}`} /></button>
                        <button onClick={() => deleteMemoryFile(file.id)} className="p-1.5 text-gray-400 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 opacity-100"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                  {memoryFiles.length === 0 && <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">No files uploaded yet.</div>}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* Summary Modal */}
        <AnimatePresence>
          {showSummaryModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-6 border-b border-[#e5e5e5] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center"><Sparkles className="w-5 h-5 text-amber-500" /></div>
                    <div><h2 className="text-lg font-semibold">Conversation Summary</h2><p className="text-xs text-gray-500">AI-generated overview</p></div>
                  </div>
                  <button onClick={() => setShowSummaryModal(false)} className="p-2 hover:bg-[#f4f4f4] rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 bg-[#fafafa]">
                  <div className="bg-white p-6 rounded-2xl border border-[#e5e5e5] shadow-sm prose prose-sm max-w-none">
                    <Markdown components={{ pre({ children }: any) { return <CodeBlock>{children}</CodeBlock>; }, code({ className, children, ...props }: any) { return <code className={className} {...props}>{children}</code>; } }}>{summary ?? ''}</Markdown>
                  </div>
                </div>
                <div className="p-6 border-t border-[#e5e5e5] flex items-center justify-end gap-3">
                  <button onClick={() => setShowSummaryModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#f4f4f4] rounded-xl">Close</button>
                  <button onClick={() => summary && copyToClipboard(summary)} className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/80"><Copy className="w-4 h-4" />Copy</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
    </div>
    </ErrorBoundary>
  );
}

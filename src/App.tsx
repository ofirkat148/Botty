import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Send, 
  History, 
  Cpu, 
  Zap, 
  Clock, 
  BarChart3, 
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Terminal,
  Database as DbIcon,
  Settings,
  Sparkles,
  Plus,
  Mic,
  MicOff,
  Brain,
  Trash2,
  Globe,
  Key,
  MessageSquare,
  User,
  Bot,
  X,
  FileUp,
  FileText,
  Paperclip,
  LogOut,
  LogIn,
  Mail,
  ShieldCheck,
  ShieldOff,
  PanelLeft,
  Copy,
  Menu,
  RefreshCw
} from 'lucide-react';
import { format, isToday, isYesterday, subDays, startOfDay, isAfter } from 'date-fns';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { auth, googleProvider, db } from './firebase';

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-[#e5e5e5] p-8 text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-500 mb-6">The application encountered an unexpected error. Please try refreshing the page.</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              Refresh Application
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-6 p-4 bg-gray-50 rounded-lg text-left text-xs overflow-auto max-h-40 text-red-600">
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Code Block Component with Copy Button
const CodeBlock = ({ children, onCopy }: { children: any, onCopy?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = () => {
    if (preRef.current) {
      const code = preRef.current.innerText;
      navigator.clipboard.writeText(code);
      setCopied(true);
      if (onCopy) onCopy();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group/code my-4 rounded-xl overflow-hidden border border-white/5 shadow-2xl">
      <div className="absolute top-2 left-4 flex items-center gap-2 z-20">
        <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-mono uppercase tracking-widest">
          <Terminal className="w-3 h-3" />
          <span>Snippet</span>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-2 z-20">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/90 hover:text-white rounded-lg transition-all border border-white/10 backdrop-blur-md shadow-lg text-[10px] font-medium uppercase tracking-wider"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre ref={preRef} className="bg-[#0d0d0d] text-white p-5 pt-12 rounded-xl overflow-x-auto font-mono text-xs m-0 selection:bg-emerald-500/30">
        {children}
      </pre>
    </div>
  );
};

// Firestore Error Handler
const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it properly
};
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, collection, query, where, onSnapshot, orderBy, limit, getDoc, or } from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface LLMRequest {
  id: string;
  prompt: string;
  response: string;
  model: string;
  tokens_used: number;
  status: string;
  timestamp: any;
  conversationId?: string;
  uid?: string;
}

interface Fact {
  id: string;
  content: string;
  timestamp: any;
}

interface MemoryFile {
  id: string;
  name: string;
  type: string;
  size: number;
  timestamp: any;
  isSkill?: boolean;
}

interface ApiKey {
  provider: string;
  key: string;
}

const MODELS = [
  { id: 'gemini-3-flash-preview', provider: 'google', name: 'Gemini 3 Flash', type: 'Speed', icon: Zap, description: 'Optimized for speed and efficiency.' },
  { id: 'gemini-3.1-pro-preview', provider: 'google', name: 'Gemini 3.1 Pro', type: 'Reasoning', icon: ShieldCheck, description: 'Best for complex reasoning and coding.' },
  { id: 'gemini-3.1-flash-lite-preview', provider: 'google', name: 'Gemini 3.1 Flash Lite', type: 'Lite', icon: Zap, description: 'Ultra-fast, lightweight model for simple tasks.' },
  { id: 'gemini-flash-latest', provider: 'google', name: 'Gemini Flash (Stable)', type: 'Balanced', icon: Zap, description: 'Stable version of Gemini Flash.' },
  { id: 'gpt-4o', provider: 'openai', name: 'GPT-4o', type: 'Balanced', icon: Cpu, description: 'OpenAI flagship model.' },
  { id: 'gpt-4o-mini', provider: 'openai', name: 'GPT-4o Mini', type: 'Speed', icon: Zap, description: 'Fast and affordable OpenAI model.' },
  { id: 'claude-3-5-sonnet-20240620', provider: 'anthropic', name: 'Claude 3.5 Sonnet', type: 'Creative', icon: ShieldCheck, description: 'Anthropic high-intelligence model.' },
  { id: 'claude-3-5-haiku-20241022', provider: 'anthropic', name: 'Claude 3.5 Haiku', type: 'Speed', icon: Zap, description: 'Fastest Anthropic model.' },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', name: 'Llama 3.3 70B', type: 'Versatile', icon: Cpu, description: 'Meta high-performance model (via Groq).' },
  { id: 'deepseek-chat', provider: 'deepseek', name: 'DeepSeek V3', type: 'Reasoning', icon: Brain, description: 'Powerful open-weights model from DeepSeek.' },
  { id: 'mistral-large-latest', provider: 'mistral', name: 'Mistral Large', type: 'Balanced', icon: ShieldCheck, description: 'Mistral flagship model.' },
  { id: 'grok-beta', provider: 'xai', name: 'Grok Beta', type: 'Real-time', icon: Zap, description: 'xAI model with real-time access.' },
  { id: 'hypereal', provider: 'hypereal', name: 'Hypereal', type: 'Experimental', icon: Sparkles, description: 'Experimental high-performance model.' },
  { id: 'gpt-4o', provider: 'github', name: 'GitHub Copilot (GPT-4o)', type: 'Balanced', icon: Cpu, description: 'GitHub Copilot powered by GPT-4o.' },
  { id: 'claude-3-5-sonnet', provider: 'github', name: 'GitHub Copilot (Claude 3.5)', type: 'Creative', icon: ShieldCheck, description: 'GitHub Copilot powered by Claude 3.5 Sonnet.' },
  { id: 'ollama', provider: 'local', name: 'Ollama / Local', type: 'Local', icon: Cpu, description: 'Connect to a local LLM via custom endpoint.' },
  { id: 'auto', provider: 'auto', name: 'Smart Router', type: 'Dynamic', icon: Cpu, description: 'Automatically selects the best model for your prompt.' }
];

const DAILY_TOKEN_LIMIT = 500000;

export default function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [prompt, setPrompt] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(() => localStorage.getItem('selectedModel') || 'auto');
  const [history, setHistory] = useState<LLMRequest[]>([]);
  
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModelId);
  }, [selectedModelId]);

  const [dailyTokens, setDailyTokens] = useState(() => {
    const savedDate = localStorage.getItem('usageDate');
    const today = new Date().toISOString().split('T')[0];
    
    // If it's a new day according to local clock, we start with 0
    // but we don't clear localStorage yet, fetchUsage will handle that
    if (savedDate && savedDate < today) {
      return 0;
    }
    
    const saved = localStorage.getItem('dailyTokens');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'settings' | 'memory'>('chat');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string, model?: string, isError?: boolean, media?: { preview: string, type: string }[] }[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Daily reset logic
  useEffect(() => {
    const checkDate = () => {
      const savedDate = localStorage.getItem('usageDate');
      const today = new Date().toISOString().split('T')[0];
      
      // If our local clock says it's a new day, we should check with the server
      if (savedDate && savedDate < today) {
        fetchUsage();
      }
    };

    checkDate(); // Check immediately on mount
    const interval = setInterval(checkDate, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const [modelUsage, setModelUsage] = useState<Record<string, number>>(() => {
    const savedDate = localStorage.getItem('usageDate');
    const today = new Date().toISOString().split('T')[0];
    if (savedDate && savedDate < today) return {};
    const saved = localStorage.getItem('modelUsage');
    return saved ? JSON.parse(saved) : {};
  });
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);

  const getTokensLeft = () => Math.max(0, DAILY_TOKEN_LIMIT - dailyTokens);

  const groupedHistory = useMemo(() => {
    // 1. Separate messages into those with and without conversationId
    const withId: Record<string, LLMRequest[]> = {};
    const withoutId: LLMRequest[] = [];

    history.forEach(req => {
      if (req.conversationId) {
        if (!withId[req.conversationId]) withId[req.conversationId] = [];
        withId[req.conversationId].push(req);
      } else {
        withoutId.push(req);
      }
    });

    const conversations: any[] = [];

    // 2. Process those with IDs
    Object.entries(withId).forEach(([id, msgs]) => {
      const sorted = [...msgs].sort((a, b) => {
        const tA = a.timestamp?.toMillis?.() || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const tB = b.timestamp?.toMillis?.() || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return tB - tA;
      });
      conversations.push({
        id,
        lastReq: sorted[0],
        count: msgs.length,
        timestamp: sorted[0].timestamp
      });
    });

    // 3. Process those without IDs (group by 1-hour proximity)
    if (withoutId.length > 0) {
      const sortedWithout = [...withoutId].sort((a, b) => {
        const tA = a.timestamp?.toMillis?.() || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        const tB = b.timestamp?.toMillis?.() || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
        return tB - tA;
      });
      
      let currentGroup: LLMRequest[] = [];
      
      sortedWithout.forEach((req, index) => {
        if (currentGroup.length === 0) {
          currentGroup.push(req);
        } else {
          const lastTime = currentGroup[0].timestamp?.toMillis?.() || (currentGroup[0].timestamp ? new Date(currentGroup[0].timestamp).getTime() : 0);
          const currentTime = req.timestamp?.toMillis?.() || (req.timestamp ? new Date(req.timestamp).getTime() : 0);
          
          if (Math.abs(lastTime - currentTime) < 3600000) {
            currentGroup.push(req);
          } else {
            conversations.push({
              id: `legacy_${currentGroup[0].id}`,
              lastReq: currentGroup[0],
              count: currentGroup.length,
              timestamp: currentGroup[0].timestamp
            });
            currentGroup = [req];
          }
        }
        
        if (index === sortedWithout.length - 1) {
          conversations.push({
            id: `legacy_${currentGroup[0].id}`,
            lastReq: currentGroup[0],
            count: currentGroup.length,
            timestamp: currentGroup[0].timestamp
          });
        }
      });
    }

    // 4. Group by time periods
    const now = new Date();
    const groups: Record<string, any[]> = {
      'Today': [],
      'Yesterday': [],
      'Previous 7 Days': [],
      'Previous 30 Days': [],
      'Older': []
    };

    conversations.forEach(conv => {
      const date = conv.timestamp?.toDate?.() || (conv.timestamp ? new Date(conv.timestamp) : new Date());
      
      if (isToday(date)) {
        groups['Today'].push(conv);
      } else if (isYesterday(date)) {
        groups['Yesterday'].push(conv);
      } else if (isAfter(date, subDays(startOfDay(now), 6))) {
        groups['Previous 7 Days'].push(conv);
      } else if (isAfter(date, subDays(startOfDay(now), 29))) {
        groups['Previous 30 Days'].push(conv);
      } else {
        groups['Older'].push(conv);
      }
    });

    // 5. Convert to sorted array of groups
    return Object.entries(groups)
      .filter(([_, items]) => items.length > 0)
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => {
          const tA = a.timestamp?.toMillis?.() || (a.timestamp ? new Date(a.timestamp).getTime() : 0);
          const tB = b.timestamp?.toMillis?.() || (b.timestamp ? new Date(b.timestamp).getTime() : 0);
          return tB - tA;
        })
      }));
  }, [history]);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [hasFirestoreToken, setHasFirestoreToken] = useState(false);
  
  // Settings & Memory
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>(() => {
    const saved = localStorage.getItem('availableProviders');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('availableProviders', JSON.stringify(availableProviders));
  }, [availableProviders]);
  const [localUrl, setLocalUrl] = useState('http://localhost:11434');
  const [tgBotInfo, setTgBotInfo] = useState<any>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [memoryFiles, setMemoryFiles] = useState<MemoryFile[]>([]);
  const [memoryUrls, setMemoryUrls] = useState<{ id: string, url: string, title: string, timestamp: any }[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File, preview: string, type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newFact, setNewFact] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isSandboxed, setIsSandboxed] = useState(false);
  const [useMemory, setUseMemory] = useState(true);
  const [autoMemory, setAutoMemory] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  
  const safeFormatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    try {
      // Handle Firestore Timestamp
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        return format(timestamp.toDate(), 'MMM d, HH:mm');
      }
      // Handle seconds/nanoseconds object
      if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        return format(new Date(timestamp.seconds * 1000), 'MMM d, HH:mm');
      }
      // Handle Date or string/number
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Recently';
      return format(date, 'MMM d, HH:mm');
    } catch (e) {
      return 'Recently';
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthLoading(false);
    });

    setupVoice();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        lastLogin: new Date().toISOString()
      }, { merge: true }).catch(err => console.error("Error syncing user:", err));

      // Check if token exists in Firestore
      const tokenRef = doc(db, "user_tokens", user.uid);
      const unsubToken = onSnapshot(tokenRef, (doc) => {
        setHasFirestoreToken(doc.exists() && !!doc.data()?.google_access_token);
      });

      // Also sync token if we have it in localStorage but it might be missing in Firestore
      const token = localStorage.getItem('google_access_token');
      if (token) {
        setDoc(doc(db, "user_tokens", user.uid), {
          google_access_token: token,
          updatedAt: new Date()
        }, { merge: true }).catch(e => console.error("Error syncing token:", e));
      }

      return () => unsubToken();
    }
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, isLoading]);

  const setupVoice = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPrompt(transcript);
        setIsVoiceActive(false);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          showNotification('Microphone access denied. Please check your browser permissions.', 'error');
        } else {
          showNotification(`Speech recognition error: ${event.error}`, 'error');
        }
        setIsVoiceActive(false);
      };

      rec.onend = () => {
        setIsVoiceActive(false);
      };

      setRecognition(rec);
    }
  };

  const sendEmail = async () => {
    if (!user || !user.email) {
      showNotification("You must be signed in to send emails.", 'error');
      return;
    }
    
    if (!googleAccessToken) {
      showNotification("Google access token missing. Please sign out and sign in again to authorize email sending.", 'error');
      return;
    }

    if (chatMessages.length === 0) {
      showNotification("No messages to send.", 'error');
      return;
    }

    setIsSendingEmail(true);
    try {
      const chatContent = chatMessages.map(m => `<b>${m.role.toUpperCase()}:</b><br/>${m.content.replace(/\n/g, '<br/>')}`).join('<br/><br/><hr/><br/>');
      const body = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">Chat Summary</h2>
          <p style="color: #666; font-size: 14px;">Sent from LLM Router on ${new Date().toLocaleString()}</p>
          <div style="margin-top: 20px;">
            ${chatContent}
          </div>
        </div>
      `;

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: googleAccessToken,
          to: user.email,
          subject: `Chat Summary: ${chatMessages[0].content.substring(0, 30)}...`,
          body,
          uid: user.uid
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send email");
      }

      showNotification("Email sent successfully to " + user.email, 'success');
    } catch (err: any) {
      console.error("Email error:", err);
      showNotification(err.message, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedMedia(prev => [...prev, { 
          file, 
          preview: reader.result as string,
          type: file.type
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (index: number) => {
    setSelectedMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (activeTab === 'memory') {
        files.forEach(file => uploadMemoryFileDirect(file));
      } else {
        files.forEach(file => {
          const reader = new FileReader();
          reader.onloadend = () => {
            setSelectedMedia(prev => [...prev, { 
              file, 
              preview: reader.result as string,
              type: file.type
            }]);
          };
          reader.readAsDataURL(file);
        });
      }
    }
  };

  const toggleVoice = async () => {
    if (!recognition) {
      setError("Speech recognition not supported in this browser.");
      return;
    }

    if (isVoiceActive) {
      recognition.stop();
    } else {
      try {
        // Explicitly request microphone access to trigger permission prompt if needed
        await navigator.mediaDevices.getUserMedia({ audio: true });
        recognition.start();
        setIsVoiceActive(true);
      } catch (err: any) {
        console.error('Microphone access error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          showNotification('Microphone access denied. Please allow microphone access in your browser settings.', 'error');
        } else {
          showNotification('Could not access microphone. Please ensure it is connected and not in use.', 'error');
        }
      }
    }
  };

  const signInWithGoogle = async () => {
    if (isSigningIn) return;
    try {
      setIsSigningIn(true);
      setError(null);
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      if (token) {
        setGoogleAccessToken(token);
        localStorage.setItem('google_access_token', token);
        // Store in Firestore for Telegram bot access
        if (result.user) {
          await setDoc(doc(db, "user_tokens", result.user.uid), {
            google_access_token: token,
            updatedAt: new Date()
          }, { merge: true });
          setHasFirestoreToken(true);
        }
      }
      showNotification("Signed in with Google!", 'success');
    } catch (err: any) {
      console.error("Auth error:", err);
      
      let message = err?.message || String(err || 'Unknown error');
      if (err.code === 'auth/popup-closed-by-user') {
        message = "Sign-in popup was closed before completion. If you didn't close it, please try opening the app in a new tab (icon at top right) as popups are often blocked in iframes.";
      } else if (err.code === 'auth/cancelled-popup-request') {
        message = "A previous sign-in request is still pending. Please wait or refresh the page.";
      } else if (err.code === 'auth/popup-blocked') {
        message = "Sign-in popup was blocked by your browser. Please allow popups or open the app in a new tab.";
      }
      
      setError(message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setGoogleAccessToken(null);
      localStorage.removeItem('google_access_token');
      showNotification("Signed out successfully", 'success');
    } catch (err: any) {
      setError(err?.message || String(err || 'Unknown error'));
    }
  };

  const [isSavingKey, setIsSavingKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: any, type: 'success' | 'error' = 'success') => {
    const messageString = typeof message === 'string' ? message : String(message || 'Unknown notification');
    setNotification({ message: messageString, type });
  };

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index?: number) => {
    navigator.clipboard.writeText(text);
    if (index !== undefined) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    }
    showNotification("Copied to clipboard!", "success");
  };

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setFacts([]);
      setMemoryFiles([]);
      setApiKeys([]);
      return;
    }

    // Real-time History
    const qHistory = query(
      collection(db, "history"), 
      or(where("uid", "==", user.uid), where("uid", "==", "telegram_bot")),
      limit(50)
    );
    const unsubHistory = onSnapshot(qHistory, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any;
      // Sort client-side to avoid index requirement for now
      docs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis?.() || 0;
        const tB = b.timestamp?.toMillis?.() || 0;
        return tB - tA;
      });
      setHistory(docs);
    }, (error) => handleFirestoreError(error, 'list', 'history'));

    // Real-time Facts
    const qFacts = query(collection(db, "facts"), where("uid", "==", user.uid));
    const unsubFacts = onSnapshot(qFacts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any;
      docs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis?.() || 0;
        const tB = b.timestamp?.toMillis?.() || 0;
        return tB - tA;
      });
      setFacts(docs);
    }, (error) => handleFirestoreError(error, 'list', 'facts'));

    // Real-time Memory Files
    const qFiles = query(collection(db, "memoryFiles"), where("uid", "==", user.uid));
    const unsubFiles = onSnapshot(qFiles, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any;
      docs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis?.() || 0;
        const tB = b.timestamp?.toMillis?.() || 0;
        return tB - tA;
      });
      setMemoryFiles(docs);
    }, (error) => handleFirestoreError(error, 'list', 'memoryFiles'));

    // Real-time Memory URLs
    const qUrls = query(collection(db, "memoryUrls"), where("uid", "==", user.uid));
    const unsubUrls = onSnapshot(qUrls, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any;
      docs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis?.() || 0;
        const tB = b.timestamp?.toMillis?.() || 0;
        return tB - tA;
      });
      setMemoryUrls(docs);
    }, (error) => handleFirestoreError(error, 'list', 'memoryUrls'));

    // Real-time API Keys
    const qKeys = query(collection(db, "apiKeys"), where("uid", "==", user.uid));
    const unsubKeys = onSnapshot(qKeys, (snapshot) => {
      const rows = snapshot.docs.map(doc => doc.data());
      setApiKeys(rows.map((r: any) => ({
        provider: r.provider,
        key: r.key ? `${r.key.substring(0, 4)}...${r.key.substring(r.key.length - 4)}` : ""
      })));
      fetchAvailableProviders();
    }, (error) => handleFirestoreError(error, 'list', 'apiKeys'));

    // Real-time Settings
    const unsubSettings = onSnapshot(doc(db, "settings", user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.localUrl) setLocalUrl(data.localUrl);
        fetchAvailableProviders();
      }
    });

    // Fetch Usage
    fetchUsage();
    fetchBotInfo();
    fetchUserSettings();
    fetchAvailableProviders();

    // Migration logic for kofir2007@gmail.com
    if (user.email === 'kofir2007@gmail.com') {
      const checkMigration = async () => {
        const migratedFlag = localStorage.getItem(`migrated_${user.uid}`);
        if (!migratedFlag) {
          setIsMigrating(true);
          try {
            const res = await fetch('/api/migrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uid: user.uid, email: user.email })
            });
            if (res.ok) {
              const data = await res.json();
              showNotification(`Migrated ${data.migrated.history} history items and ${data.migrated.facts} facts to your account!`, 'success');
              localStorage.setItem(`migrated_${user.uid}`, 'true');
            }
          } catch (err) {
            console.error("Migration failed:", err);
          } finally {
            setIsMigrating(false);
          }
        }
      };
      checkMigration();
    }

    return () => {
      unsubHistory();
      unsubFacts();
      unsubFiles();
      unsubUrls();
      unsubKeys();
      unsubSettings();
    };
  }, [user]);

  useEffect(() => {
    if (availableProviders.length > 0) {
      const isCurrentModelAvailable = MODELS.some(m => 
        m.id === selectedModelId && 
        (m.id === 'auto' || availableProviders.includes(m.provider))
      );
      
      if (!isCurrentModelAvailable) {
        setSelectedModelId('auto');
      }
    }
  }, [availableProviders, selectedModelId]);

  const fetchAvailableProviders = async () => {
    if (!user) return;
    setIsRefreshingProviders(true);
    try {
      const res = await fetch(`/api/available-providers?uid=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Available providers fetched:", data.providers);
        setAvailableProviders(data.providers || []);
      } else {
        console.error("Failed to fetch available providers:", res.status);
      }
    } catch (err) {
      console.error("Error fetching available providers:", err);
    } finally {
      setIsRefreshingProviders(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('dailyTokens', dailyTokens.toString());
  }, [dailyTokens]);

  useEffect(() => {
    localStorage.setItem('modelUsage', JSON.stringify(modelUsage));
  }, [modelUsage]);

  const fetchUsage = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/usage?uid=${user.uid}&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const savedDate = localStorage.getItem('usageDate');
        
        // If the server's date is different from our stored date
        if (data.date && data.date !== savedDate) {
          // If the server date has advanced, we reset local state
          if (!savedDate || data.date > savedDate) {
            setDailyTokens(data.tokens || 0);
            setModelUsage(data.modelUsage || {});
            localStorage.setItem('usageDate', data.date);
            localStorage.setItem('lastResetTime', Date.now().toString());
          } else {
            // Server is behind client, but we should still trust server's usage data
            // for the date it provides.
            setDailyTokens(data.tokens || 0);
            setModelUsage(data.modelUsage || {});
            localStorage.setItem('usageDate', data.date);
          }
        } else {
          setDailyTokens(data.tokens || 0);
          setModelUsage(data.modelUsage || {});
        }
      }
    } catch (err) {
      console.error("Error fetching usage:", err);
    }
  };

  const deleteKey = async (provider: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/keys/${provider}?uid=${user.uid}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification(`${provider.toUpperCase()} Key removed. Falling back to default.`, 'success');
        fetchAvailableProviders();
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const fetchBotInfo = async () => {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setTgBotInfo(data.bot);
  };

  const fetchUserSettings = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/user-settings?uid=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setSystemPrompt(data.systemPrompt || '');
      }
      
      const settingsRes = await fetch(`/api/settings?uid=${user.uid}`);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.localUrl) setLocalUrl(data.localUrl);
        if (data.useMemory !== undefined) setUseMemory(data.useMemory);
        if (data.autoMemory !== undefined) setAutoMemory(data.autoMemory);
      }
    } catch (err) {
      console.error("Error fetching user settings:", err);
    }
  };

  const saveSystemPrompt = async (val: string) => {
    if (!user) return;
    setIsSavingSystemPrompt(true);
    try {
      const res = await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, systemPrompt: val })
      });
      if (res.ok) {
        showNotification("System Prompt Saved", 'success');
      } else {
        showNotification("Failed to save system prompt", 'error');
      }
    } catch (err) {
      showNotification("Network error", 'error');
    } finally {
      setIsSavingSystemPrompt(false);
    }
  };

  const toggleMemory = async (type: 'use' | 'auto') => {
    if (!user) return;
    const newUse = type === 'use' ? !useMemory : useMemory;
    const newAuto = type === 'auto' ? !autoMemory : autoMemory;
    
    if (type === 'use') setUseMemory(newUse);
    else setAutoMemory(newAuto);

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, useMemory: newUse, autoMemory: newAuto, localUrl })
      });
      showNotification("Memory settings updated", 'success');
    } catch (err) {
      showNotification("Failed to update memory settings", 'error');
    }
  };

  const uploadMemoryFileDirect = async (file: File) => {
    if (!file || !user) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('uid', user.uid);
    if (file.name.toLowerCase().endsWith('.md')) {
      formData.append('isSkill', 'true');
    }

    try {
      const res = await fetch('/api/memory-files', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        showNotification(`File "${file.name}" uploaded to memory.`, 'success');
      } else {
        const data = await res.json();
        showNotification(data.error || "Failed to upload file", 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const uploadMemoryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadMemoryFileDirect(file);
      e.target.value = '';
    }
  };

  const deleteMemoryFile = async (id: string) => {
    await fetch(`/api/memory-files/${id}`, { method: 'DELETE' });
  };

  const toggleSkill = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/memory-files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSkill: !currentStatus })
      });
      if (res.ok) {
        showNotification(`File marked as ${!currentStatus ? 'skill' : 'regular memory'}`, 'success');
      } else {
        showNotification('Failed to update file status', 'error');
      }
    } catch (err) {
      showNotification('Error updating file status', 'error');
    }
  };

  const saveLocalUrl = async (url: string) => {
    if (!user) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, localUrl: url, useMemory, autoMemory })
      });
      setLocalUrl(url);
      showNotification('Local LLM URL updated', 'success');
      fetchAvailableProviders();
    } catch (err) {
      showNotification('Failed to update URL', 'error');
    }
  };

  const saveKey = async (provider: string, key: string) => {
    if (!user) return;
    setIsSavingKey(provider);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key, uid: user.uid })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to save key");
      }
      
      showNotification(`${provider.toUpperCase()} API Key validated and saved successfully!`, 'success');
      fetchAvailableProviders();
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsSavingKey(null);
    }
  };

  const [isCleaningFacts, setIsCleaningFacts] = useState(false);
  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem('enter_to_send');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved !== null ? JSON.parse(saved) : (window.innerWidth < 768);
  });
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('enter_to_send', JSON.stringify(enterToSend));
  }, [enterToSend]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const cleanupFacts = async () => {
    if (!user) return;
    setIsCleaningFacts(true);
    try {
      const res = await fetch('/api/facts/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid })
      });
      if (res.ok) {
        const data = await res.json();
        showNotification(`Memory cleaned! Reduced ${data.originalCount} facts to ${data.newCount}.`, 'success');
      } else {
        throw new Error("Failed to cleanup memory");
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsCleaningFacts(false);
    }
  };

  const addFact = async () => {
    if (!newFact.trim() || !user) return;
    await fetch('/api/facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newFact, uid: user.uid })
    });
    setNewFact('');
  };

  const addMemoryUrl = async () => {
    if (!newUrl.trim() || !user) return;
    setIsAddingUrl(true);
    try {
      const res = await fetch('/api/memory-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, url: newUrl })
      });
      if (res.ok) {
        setNewUrl('');
        showNotification('Website added to memory!', 'success');
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add website');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsAddingUrl(false);
    }
  };

  const deleteFact = async (id: string) => {
    await fetch(`/api/facts/${id}`, { method: 'DELETE' });
  };

  const deleteMemoryUrl = async (id: string) => {
    await fetch(`/api/memory-urls/${id}`, { method: 'DELETE' });
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;
    
    try {
      const res = await fetch(`/api/history/group/${id}?uid=${user.uid}`, { method: 'DELETE' });
      if (res.ok) {
        showNotification('Conversation deleted.', 'success');
      } else {
        const data = await res.json();
        showNotification(data.error || 'Failed to delete conversation', 'error');
      }
    } catch (err: any) {
      showNotification(err.message, 'error');
    }
  };

  const newChat = () => {
    setChatMessages([]);
    setCurrentConversationId(crypto.randomUUID());
    setActiveTab('chat');
  };

  const continueConversation = (req: LLMRequest) => {
    const conversationMessages = history
      .filter(h => h.conversationId === req.conversationId || (!h.conversationId && h.id === req.id))
      .sort((a, b) => {
        const tA = a.timestamp?.toMillis?.() || 0;
        const tB = b.timestamp?.toMillis?.() || 0;
        return tA - tB;
      });

    if (conversationMessages.length > 0) {
      const msgs = conversationMessages.flatMap(m => [
        { role: 'user' as const, content: m.prompt },
        { role: 'assistant' as const, content: m.response, model: m.model }
      ]);
      setChatMessages(msgs);
      setCurrentConversationId(req.conversationId || req.id);
    } else {
      setChatMessages([
        { role: 'user', content: req.prompt },
        { role: 'assistant', content: req.response, model: req.model }
      ]);
      setCurrentConversationId(req.conversationId || req.id);
    }
    setActiveTab('chat');
    showNotification("Conversation loaded. You can now continue.", 'success');
  };

  const generateSummary = async () => {
    if (chatMessages.length === 0) {
      showNotification("No messages to summarize.", 'error');
      return;
    }

    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: chatMessages,
          uid: user?.uid
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary);
      setShowSummaryModal(true);
    } catch (err: any) {
      showNotification(err.message, 'error');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    if (availableProviders.length === 0) {
      setError("No API keys configured. Please add a key in Settings.");
      setIsLoading(false);
      return;
    }

    const currentPrompt = prompt;
    const currentMedia = [...selectedMedia];
    const convId = currentConversationId || crypto.randomUUID();
    if (!currentConversationId) setCurrentConversationId(convId);

    setChatMessages(prev => [...prev, { role: 'user', content: currentPrompt, media: currentMedia.map(m => ({ preview: m.preview, type: m.type })) }]);
    setPrompt('');
    setSelectedMedia([]);
    setIsLoading(true);
    setError(null);
    
    let targetModel = '';
    let targetProvider = '';
    let attempts = 0;
    const maxAttempts = 10;
    const triedModels: string[] = [];

    try {
      while (attempts < maxAttempts) {
        try {
          if (selectedModelId === 'auto' || attempts > 0) {
            // In retry mode, we force a different model if possible
            const routeRes = await fetch('/api/smart-route', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                prompt: currentPrompt, 
                uid: user?.uid,
                hasMedia: currentMedia.length > 0,
                excludeModels: triedModels
              })
            });
            
            if (!routeRes.ok) {
              let errorMsg = `Routing failed (${routeRes.status})`;
              try {
                const errData = await routeRes.json();
                errorMsg = errData.error || errorMsg;
              } catch (e) {
                // Not JSON
              }
              throw new Error(errorMsg);
            }
            
            let route;
            try {
              route = await routeRes.json();
            } catch (e) {
              throw new Error("Server returned an invalid response during routing. Please try again.");
            }
            targetModel = route.model;
            targetProvider = route.provider;
            
            // If we already tried this model, pick a safe fallback
            if (triedModels.includes(targetModel)) {
              const fallback = MODELS.find(m => m.id !== 'auto' && m.id !== 'ollama' && !triedModels.includes(m.id) && (availableProviders.includes(m.provider) || m.provider === 'google'));
              if (fallback) {
                targetModel = fallback.id;
                targetProvider = fallback.provider;
              }
            }
            
            console.log(`[ROUTER] Attempt ${attempts + 1}: Selected ${targetModel} (${route.reason || 'Fallback'})`);
          } else {
            const modelConfig = MODELS.find(m => m.id === selectedModelId);
            targetModel = modelConfig?.id || '';
            targetProvider = modelConfig?.provider || '';
          }
          
          triedModels.push(targetModel);

          // Limit history to last 10 messages to avoid token limits
          const limitedMessages = chatMessages.slice(-10);

          // Pre-check LLM health before sending full query
          const validateRes = await fetch('/api/validate-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: targetProvider,
              model: targetModel,
              uid: user?.uid
            })
          });

          if (!validateRes.ok) {
            let errorMsg = `Provider validation failed for ${targetProvider}`;
            try {
              const errData = await validateRes.json();
              errorMsg = errData.error || errorMsg;
            } catch (e) {
              // Not JSON
            }
            throw new Error(errorMsg);
          }

          const proxyRes = await fetch('/api/proxy-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: currentPrompt,
              provider: targetProvider,
              model: targetModel,
              messages: limitedMessages,
              uid: user?.uid,
              sandboxed: isSandboxed,
              systemPrompt: systemPrompt,
              media: currentMedia.map(m => ({
                inlineData: {
                  mimeType: m.type,
                  data: m.preview.split(',')[1]
                }
              }))
            })
          });

          if (!proxyRes.ok) {
            let errorMsg = 'Request failed';
            try {
              const errData = await proxyRes.json();
              errorMsg = errData.error || errorMsg;
            } catch (e) {
              errorMsg = `Server error (${proxyRes.status}): ${proxyRes.statusText || 'Unknown Error'}`;
            }
            
            // If it's a quota error or token limit error, we should definitely try another model
            const lowerErr = errorMsg.toLowerCase();
            if (proxyRes.status === 429 || lowerErr.includes('quota') || lowerErr.includes('limit') || lowerErr.includes('token')) {
              console.warn(`[ROUTER] Quota/Limit hit for ${targetModel}. Retrying with another model...`);
              attempts++;
              const retriesLeft = maxAttempts - attempts;
              if (retriesLeft > 0) {
                showNotification(`Model ${targetModel} hit a limit. Retrying with another... (${retriesLeft} retries left)`, 'error');
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
            }
            
            throw new Error(errorMsg);
          }

          let data;
          try {
            data = await proxyRes.json();
          } catch (e) {
            throw new Error("Server returned an invalid response. This might be due to a temporary server issue or quota exhaustion.");
          }
          
          if (!data) throw new Error("Empty response from server.");
      
      const text = data.text || "No response text received from the model.";
      const tokensUsed = typeof data.tokensUsed === 'number' ? data.tokensUsed : 0;

      if (tokensUsed === 0 && !data.text) {
        throw new Error("Model returned no content and 0 tokens. This might be a quota issue or a temporary provider failure.");
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: text, model: targetModel }]);
          
          if (user) {
            await fetch('/api/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: currentPrompt,
                response: text,
                model: `${targetProvider}:${targetModel}`,
                tokens_used: tokensUsed,
                status: 'success',
                uid: user.uid,
                conversationId: convId
              })
            });
            // Update usage optimistically for snappier UI
            setDailyTokens(prev => prev + tokensUsed);
            const sanitizedModel = `${targetProvider}:${targetModel}`.replace(/\./g, '_');
            setModelUsage(prev => ({
              ...prev,
              [sanitizedModel]: (prev[sanitizedModel] || 0) + tokensUsed
            }));

            // Sync with server
            await fetchUsage();
            
            // Extract facts for memory
            fetch('/api/extract-facts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: currentPrompt,
                response: text,
                uid: user.uid
              })
            }).then(res => {
              if (res.status === 429) {
                console.warn("Fact extraction skipped due to quota limits.");
              }
            }).catch(err => {
              console.error("Fact extraction error:", err);
            });
          }
          
          // If we reached here, it's a success
          break;

        } catch (err: any) {
          attempts++;
          const errorString = err?.message || String(err || 'Unknown error');
          console.error(`Attempt ${attempts} failed: ${errorString}`);
          
          if (attempts >= maxAttempts) {
            const truncatedError = errorString.substring(0, 1000);
            setError(truncatedError);
            const isQuota = truncatedError.toLowerCase().includes('quota') || truncatedError.toLowerCase().includes('limit');
            const retryHint = isQuota 
              ? "\n\n**Tip:** You've reached the quota for this model. Try switching to a different provider (like OpenAI or Groq) in the settings, or wait for the quota to reset."
              : "\n\n**Tip:** All retry attempts failed. You might want to check your API keys or try a different model.";
            
            setChatMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `### ⚠️ Error\n${truncatedError}${retryHint}`,
              isError: true 
            }]);
          } else {
            // Show a subtle notification that we're retrying
            const msg = errorString.toLowerCase();
            const isBalanceError = msg.includes('insufficient balance') || 
                                 msg.includes('quota') || 
                                 msg.includes('credit') || 
                                 msg.includes('balance') || 
                                 msg.includes('funds') ||
                                 msg.includes('limit');
            
            const modelName = targetModel || 'selected model';
            const displayMsg = isBalanceError 
              ? `Model ${modelName} has insufficient balance/quota. Trying another...` 
              : `Model ${modelName} failed (${errorString}). Retrying with another...`;
            
            showNotification(displayMsg, 'error');
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: 'chat' | 'history' | 'settings' | 'memory') => {
    setActiveTab(tab);
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(false);
    }
  };

  const usagePercentage = Math.min((dailyTokens / DAILY_TOKEN_LIMIT) * 100, 100);
  const tokensLeftPercent = Math.max(100 - Math.round(usagePercentage), 0);

  return (
    <div className="flex h-screen bg-white text-[#0d0d0d] relative">
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className={cn(
              "fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px]",
              notification.type === 'success' ? "bg-black text-white" : "bg-red-500 text-white"
            )}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5" />}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-auto opacity-50 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60] md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={isMobile ? { x: -280 } : false}
        animate={{ 
          width: isMobile ? 280 : (isSidebarCollapsed ? 0 : 280),
          x: (isMobile && !isMobileMenuOpen) ? -280 : 0
        }}
        className={cn(
          "bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col z-[70] overflow-hidden shrink-0",
          "fixed md:relative top-0 left-0 h-full"
        )}
      >
        <div className="w-[280px] h-full flex flex-col">
          <div className="flex items-center justify-between p-4">
            {!isSidebarCollapsed && !isMobile && (
              <button 
                onClick={newChat}
                className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#e5e5e5] bg-white hover:bg-[#f0f0f0] transition-all text-sm font-medium shadow-sm truncate"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="truncate">New Chat</span>
              </button>
            )}
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:flex p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5 ml-2"
              title="Collapse Sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            {isMobile && (
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5 ml-2"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          <div className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Navigation</div>
          <button onClick={() => handleTabChange('chat')} className={cn("sidebar-item w-full", activeTab === 'chat' && "active")}>
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          <button onClick={() => handleTabChange('history')} className={cn("sidebar-item w-full", activeTab === 'history' && "active")}>
            <History className="w-4 h-4" />
            History
          </button>
          <button onClick={() => handleTabChange('memory')} className={cn("sidebar-item w-full", activeTab === 'memory' && "active")}>
            <Brain className="w-4 h-4" />
            Memory
          </button>
          <button onClick={() => handleTabChange('settings')} className={cn("sidebar-item w-full", activeTab === 'settings' && "active")}>
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>

        <div className="p-4 border-t border-[#e5e5e5] space-y-3">
          {isAuthLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : user ? (
            <div className="flex items-center justify-between px-3 py-2 bg-white border border-[#e5e5e5] rounded-xl shadow-sm">
              <div className="flex items-center gap-2 overflow-hidden">
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full" />
                <div className="overflow-hidden">
                  <p className="text-[11px] font-semibold truncate">{user.displayName}</p>
                  <p className="text-[9px] text-gray-400 truncate">{user.email}</p>
                </div>
              </div>
              <button onClick={logout} className="p-1.5 text-gray-400 hover:text-red-500 transition-all">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              disabled={isSigningIn}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-black text-white hover:opacity-80 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          )}
          <div className="px-3">
            <button
              onClick={() => setIsSandboxed(!isSandboxed)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all duration-200",
                isSandboxed 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm" 
                  : "bg-white border-[#e5e5e5] text-gray-500 hover:bg-gray-50"
              )}
            >
              <div className="flex items-center gap-2">
                {isSandboxed ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                <span className="text-xs font-semibold">Sandboxed Mode</span>
              </div>
              <div className={cn(
                "w-8 h-4 rounded-full relative transition-colors duration-200",
                isSandboxed ? "bg-emerald-500" : "bg-gray-200"
              )}>
                <div className={cn(
                  "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-200",
                  isSandboxed ? "left-4.5" : "left-0.5"
                )} />
              </div>
            </button>
            <p className="text-[9px] text-gray-400 mt-1.5 px-1 leading-relaxed">
              {isSandboxed 
                ? "LLM will strictly use only your provided facts and files. No outside knowledge." 
                : "LLM uses its full knowledge base alongside your provided memory."}
            </p>
          </div>

          <div className="px-3 pt-1 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">Server Active (Background Mode)</span>
          </div>
        </div>
      </div>
      </motion.aside>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col relative overflow-hidden"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-[#e5e5e5] bg-white z-50">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5"
          >
            <Menu className="w-6 h-6" />
          </button>
          
          {activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col items-center justify-center px-2">
              <select 
                value={selectedModelId} 
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="bg-[#f4f4f4] border border-[#e5e5e5] rounded-lg text-[11px] font-medium text-black px-2 py-1 outline-none focus:ring-2 focus:ring-black/5 transition-all w-full max-w-[180px]"
              >
                {MODELS.filter(m => (m.id === 'auto' && availableProviders.length > 0) || availableProviders.includes(m.provider)).map(m => {
                  const sanitizedModel = `${m.provider}:${m.id}`.replace(/\./g, '_');
                  const usage = modelUsage[sanitizedModel] || 0;
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  );
                })}
                {availableProviders.length === 0 && (
                  <option value="none" disabled>No models available</option>
                )}
              </select>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
                  AI Ready
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span className="font-semibold text-sm">AI Assistant</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            {user && chatMessages.length > 0 && activeTab === 'chat' && (
              <button
                onClick={sendEmail}
                disabled={isSendingEmail}
                className="p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5"
                title="Send chat to email"
              >
                {isSendingEmail ? (
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <Mail className="w-5 h-5" />
                )}
              </button>
            )}
            <button 
              onClick={newChat}
              className="p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isSidebarCollapsed && (
          <motion.button 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            onClick={() => setIsSidebarCollapsed(false)}
            className="hidden md:flex absolute top-4 left-4 z-50 p-2 text-gray-400 hover:text-black transition-all rounded-lg hover:bg-black/5 bg-white/50 backdrop-blur-sm border border-[#e5e5e5] shadow-sm"
            title="Expand Sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </motion.button>
        )}
        {isDragging && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
              <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center">
                <FileUp className="w-8 h-8" />
              </div>
              <p className="text-lg font-semibold">Drop files to upload</p>
              <p className="text-sm text-gray-500">Images, PDFs, and more</p>
            </div>
          </div>
        )}
        {/* Error Banner */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 border-b border-red-100 px-4 py-2 flex items-start justify-between z-50 max-h-[150px] overflow-y-auto"
            >
              <div className="flex items-start gap-2 text-red-600 text-sm flex-1 min-w-0">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="break-words">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'chat' && (
          <>
            {/* Chat Header / Model Selector */}
            <div className="hidden md:flex absolute top-0 left-0 right-0 p-4 justify-center z-10 bg-white/80 backdrop-blur-md">
              <div className="flex bg-[#f4f4f4] p-1.5 rounded-xl shadow-sm border border-[#e5e5e5] items-center gap-2">
                <div className="pl-2 flex items-center gap-2 text-gray-400">
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Model</span>
                </div>
                <select 
                  value={selectedModelId} 
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium text-black px-3 py-1.5 outline-none focus:ring-2 focus:ring-black/5 transition-all min-w-[160px]"
                >
                  {MODELS.filter(m => (m.id === 'auto' && availableProviders.length > 0) || availableProviders.includes(m.provider)).map(m => {
                    const sanitizedModel = `${m.provider}:${m.id}`.replace(/\./g, '_');
                    const usage = modelUsage[sanitizedModel] || 0;
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    );
                  })}
                  {availableProviders.length === 0 && (
                    <option value="none" disabled>No models available</option>
                  )}
                </select>
                <div className="h-4 w-px bg-gray-300 mx-1" />
                {user && chatMessages.length > 0 && (
                  <button
                    onClick={sendEmail}
                    disabled={isSendingEmail}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                    title="Send chat summary to your email"
                  >
                    {isSendingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    <span>Email Chat</span>
                  </button>
                )}
                {chatMessages.length > 0 && (
                  <button
                    onClick={generateSummary}
                    disabled={isSummarizing}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#e5e5e5] rounded-lg text-xs font-medium hover:bg-gray-50 transition-all disabled:opacity-50"
                    title="Generate a summary of this conversation"
                  >
                    {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                    <span>Summarize</span>
                  </button>
                )}
              </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto pt-20 pb-32 px-4">
              <div className="max-w-3xl mx-auto space-y-8">
                {availableProviders.length === 0 && !isAuthLoading && user && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-8 text-center max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                    </div>
                    <h3 className="text-amber-900 font-semibold mb-1">No LLM Providers Available</h3>
                    <p className="text-amber-700 text-sm mb-6 leading-relaxed">
                      You haven't configured any API keys or local LLM endpoints yet. 
                      Add a key in settings to start using the AI.
                    </p>
                    <button 
                      onClick={() => setActiveTab('settings')}
                      className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-all shadow-sm hover:shadow-md active:scale-95"
                    >
                      <Settings className="w-4 h-4" />
                      Configure Settings
                    </button>
                  </div>
                )}
                {chatMessages.length === 0 && availableProviders.length > 0 && (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center">
                      <Bot className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">How can I help you today?</h2>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full border border-[#e5e5e5] flex items-center justify-center flex-shrink-0 bg-white">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}
                    <div className={cn(
                      msg.role === 'user' ? "chat-bubble-user" : msg.isError ? "chat-bubble-error" : "chat-bubble-ai",
                      "group relative"
                    )}>
                      {msg.role === 'assistant' && (
                        <button 
                          onClick={() => copyToClipboard(msg.content, i)}
                          className="absolute -top-2 -right-2 p-2 bg-white border border-[#e5e5e5] text-gray-400 hover:text-black hover:bg-gray-50 rounded-xl shadow-sm opacity-40 hover:opacity-100 transition-all z-10"
                          title="Copy message"
                        >
                          {copiedIndex === i ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <div className="markdown-body">
                        <Markdown
                          components={{
                            pre({ node, children, ...props }: any) {
                              return (
                                <CodeBlock onCopy={() => showNotification("Code copied!", "success")}>
                                  {children}
                                </CodeBlock>
                              );
                            },
                            code({ node, className, children, ...props }: any) {
                              return (
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </div>
                      {msg.media && msg.media.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {msg.media.map((m, idx) => (
                            <div key={idx} className="relative group">
                              {m.type.startsWith('image/') ? (
                                <img 
                                  src={m.preview} 
                                  alt="" 
                                  className="max-w-[240px] max-h-[240px] rounded-lg border border-black/5 shadow-sm cursor-zoom-in" 
                                  onClick={() => window.open(m.preview, '_blank')}
                                />
                              ) : (
                                <div className="flex items-center gap-2 p-2 bg-black/5 rounded-lg border border-black/5">
                                  <FileText className="w-4 h-4 text-gray-500" />
                                  <span className="text-[10px] text-gray-500 truncate max-w-[120px]">Attached File</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.model && (
                        <div className="mt-2 text-[10px] text-gray-400 font-mono">
                          Generated by {msg.model}
                        </div>
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-[#10a37f] text-white flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-4 justify-start">
                    <div className="w-8 h-8 rounded-full border border-[#e5e5e5] flex items-center justify-center flex-shrink-0 bg-white">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="chat-bubble-ai flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin opacity-40" />
                      <span className="text-gray-400 italic">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
              <div className="max-w-3xl mx-auto relative">
                {selectedMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                    {selectedMedia.map((m, i) => (
                      <div key={i} className="relative group">
                        {m.type.startsWith('image/') ? (
                          <img src={m.preview} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        ) : (
                          <div className="w-16 h-16 bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center text-[8px] text-gray-400 p-1 text-center">
                            <FileText className="w-6 h-6 mb-1 text-gray-300" />
                            <span className="truncate w-full">{m.file.name}</span>
                          </div>
                        )}
                        <button 
                          onClick={() => removeMedia(i)}
                          className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (enterToSend) {
                          if (!e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                        } else {
                          if (e.metaKey || e.ctrlKey) {
                            e.preventDefault();
                            handleSubmit(e);
                          }
                        }
                      }
                    }}
                    placeholder={enterToSend ? "Message LLM Router... (Shift+Enter for new line)" : "Message LLM Router... (Cmd/Ctrl+Enter to send)"}
                    className="w-full bg-white border border-[#e5e5e5] rounded-2xl py-4 pl-12 md:pl-20 pr-16 md:pr-24 shadow-lg focus:ring-1 focus:ring-black/10 outline-none resize-none min-h-[56px] max-h-[200px] text-[15px]"
                  />
                  <div className="absolute left-2 md:left-3 bottom-3 flex items-center gap-1">
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 text-gray-400 hover:text-black transition-all"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileSelect} 
                      className="hidden" 
                      multiple
                      accept="image/*,video/*,audio/*,application/pdf"
                    />
                    <button 
                      type="button"
                      onClick={toggleVoice}
                      className={cn(
                        "p-2 rounded-full transition-all relative",
                        isVoiceActive ? "text-[var(--color-accent)]" : "text-gray-400 hover:text-black"
                      )}
                    >
                      {isVoiceActive && <div className="voice-active-ring" />}
                      {isVoiceActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="absolute right-2 md:right-3 bottom-3 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={!prompt.trim() || isLoading}
                      className="p-2 bg-black text-white rounded-xl disabled:opacity-20 transition-all hover:opacity-80"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </form>
                <p className="text-center text-[11px] text-gray-400 mt-2">
                  LLM Router can make mistakes. Check important info.
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <h2 className="text-2xl font-semibold">Chat History</h2>
                <button 
                  onClick={newChat}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-sm font-medium rounded-xl hover:opacity-80 transition-all w-full md:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  New Chat
                </button>
              </div>
              
              <div className="space-y-8">
                {groupedHistory.map(group => (
                  <div key={group.label}>
                    <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">
                      {group.label}
                    </h3>
                    <div className="space-y-4">
                      {group.items.map(conv => (
                        <div 
                          key={conv.id} 
                          onClick={() => continueConversation(conv.lastReq)}
                          className="group p-5 border border-[#e5e5e5] rounded-2xl hover:bg-[#f9f9f9] transition-all cursor-pointer relative bg-white shadow-sm hover:shadow-md"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center">
                                <MessageSquare className="w-4 h-4 text-gray-600" />
                              </div>
                              <div>
                                <span className="text-[10px] font-mono text-gray-400 block">#{conv.id.substring(0, 8)}</span>
                                <span className="text-[10px] text-gray-500">{safeFormatDate(conv.timestamp)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-gray-100 text-[10px] font-bold text-gray-600 rounded-lg uppercase">
                                {conv.count} {conv.count === 1 ? 'Message' : 'Messages'}
                              </span>
                              {!conv.id.startsWith('legacy_') && (
                                <button 
                                  onClick={(e) => deleteChat(e, conv.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                  title="Delete Conversation"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate pr-24">
                            {conv.lastReq.prompt}
                          </h3>
                          <p className="text-xs text-gray-500 line-clamp-2 mb-4 pr-10">
                            {conv.lastReq.response}
                          </p>
                          
                          <div className="flex items-center gap-4 text-[10px] text-gray-400 border-t border-gray-50 pt-3">
                            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5" /> {conv.lastReq.model}</span>
                            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> {conv.lastReq.tokens_used} tokens</span>
                          </div>
                          
                          <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                            <button className="flex items-center gap-2 px-4 py-2 bg-black text-white text-xs font-medium rounded-xl shadow-lg hover:bg-gray-800">
                              Continue Chat
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
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

        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold mb-8">Settings</h2>
              <div className="space-y-8">
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Local LLM Configuration</h3>
                    {availableProviders.includes('local') && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Active</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Endpoint URL (e.g. Ollama)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={localUrl}
                        onChange={(e) => setLocalUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                        className="flex-1 bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none focus:border-black/20"
                      />
                      <button 
                        onClick={() => saveLocalUrl(localUrl)}
                        className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium"
                      >
                        Save
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] text-gray-400">
                      Note: If using the cloud version, you must use a tunnel (like Ngrok) to expose your local port.
                    </p>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Interface Settings</h3>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Enter to Send</h4>
                        <p className="text-xs text-gray-500">Press Enter to send message, Shift+Enter for new line. If disabled, use Cmd/Ctrl+Enter to send.</p>
                      </div>
                      <button 
                        onClick={() => setEnterToSend(!enterToSend)}
                        className={`w-12 h-6 rounded-full transition-all relative ${enterToSend ? 'bg-black' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enterToSend ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Memory & Personalization</h3>
                  <div className="space-y-4">
                    <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9] flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Enable Personalization</h4>
                        <p className="text-xs text-gray-500">AI will use your saved facts and files to personalize responses.</p>
                      </div>
                      <button 
                        onClick={() => toggleMemory('use')}
                        className={`w-12 h-6 rounded-full transition-all relative ${useMemory ? 'bg-black' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${useMemory ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    
                    <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9] flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Auto-Extract Facts</h4>
                        <p className="text-xs text-gray-500">AI will automatically learn new facts about you from your conversations.</p>
                      </div>
                      <button 
                        onClick={() => toggleMemory('auto')}
                        className={`w-12 h-6 rounded-full transition-all relative ${autoMemory ? 'bg-black' : 'bg-gray-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoMemory ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">AI Configuration</h3>
                  <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9] space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase mb-2">System Prompt</label>
                      <textarea 
                        placeholder="e.g. You are a helpful assistant that speaks like a pirate."
                        className="w-full bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none focus:border-black/20 min-h-[100px] resize-none"
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                      />
                      <div className="mt-2 flex justify-end">
                        <button 
                          onClick={() => saveSystemPrompt(systemPrompt)}
                          disabled={isSavingSystemPrompt}
                          className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSavingSystemPrompt && <Loader2 className="w-3 h-3 animate-spin" />}
                          Save System Prompt
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Quota & Usage Section Removed */}

                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">API Keys</h3>
                  <button 
                    onClick={fetchAvailableProviders}
                    disabled={isRefreshingProviders}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-black transition-all uppercase tracking-widest disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshingProviders ? 'animate-spin' : ''}`} />
                    Refresh Providers
                  </button>
                </div>
                <div className="space-y-4">
                    {['google', 'openai', 'anthropic', 'xai', 'groq', 'deepseek', 'mistral', 'hypereal', 'github'].map(provider => {
                      const existing = apiKeys.find(k => k.provider === provider);
                      const isSaving = isSavingKey === provider;
                      const isActive = availableProviders.includes(provider);
                      return (
                        <div key={provider} className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-medium text-gray-500 uppercase">{provider}</label>
                            {isActive && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">Active</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input 
                              type="password" 
                              placeholder={existing?.key ? `Saved: ${existing.key}` : "Enter API Key"}
                              className="flex-1 bg-white border border-[#e5e5e5] rounded-lg px-3 py-2 text-sm outline-none focus:border-black/20"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const val = (e.target as HTMLInputElement).value;
                                  if (val) {
                                    saveKey(provider, val);
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }
                              }}
                            />
                            <button 
                              onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                if (input.value) {
                                  saveKey(provider, input.value);
                                  input.value = '';
                                }
                              }}
                              disabled={isSaving}
                              className="px-4 py-2 bg-black text-white rounded-lg text-xs font-medium disabled:opacity-50 min-w-[80px]"
                            >
                              {isSaving ? 'Checking...' : 'Save'}
                            </button>
                            <div className="w-8 flex items-center justify-center">
                              {existing && (
                                <button 
                                  onClick={() => deleteKey(provider)}
                                  className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Remove Key"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
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
                      <div className="flex items-center gap-2 mb-4">
                        <Send className="w-4 h-4 text-blue-500" />
                        <h4 className="text-sm font-medium">Telegram Bot</h4>
                      </div>
                      <p className="text-xs text-gray-500 mb-4">
                        Connect your Telegram Bot to interact with the LLM Router on the go.
                      </p>
                      <div className="space-y-4">
                        <div className="p-3 border border-[#e5e5e5] rounded-xl bg-white">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-red-500" />
                              <h4 className="text-sm font-medium">Google Auth</h4>
                            </div>
                            {hasFirestoreToken ? (
                              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] font-bold rounded-full uppercase">Authorized</span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-bold rounded-full uppercase">Missing</span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500 mb-3">
                            Required for the Telegram bot to send chat summaries to your email.
                          </p>
                          <button 
                            onClick={signInWithGoogle}
                            disabled={isSigningIn}
                            className="w-full py-1.5 bg-white border border-[#e5e5e5] rounded-lg text-[10px] font-semibold hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                          >
                            {isSigningIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                            {googleAccessToken ? 'Refresh Authorization' : 'Authorize Google'}
                          </button>
                        </div>

                        {tgBotInfo && (
                          <div className="p-2 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2">
                            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {tgBotInfo.first_name[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h5 className="text-xs font-semibold text-emerald-900 truncate">{tgBotInfo.first_name}</h5>
                              <a 
                                href={`https://t.me/${tgBotInfo.username}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[9px] text-emerald-600 hover:underline flex items-center gap-1"
                              >
                                @{tgBotInfo.username} <ChevronRight className="w-2 h-2" />
                              </a>
                            </div>
                            <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-700 text-[8px] font-bold rounded-full uppercase">Active</span>
                          </div>
                        )}
                        <div>
                          <label className="block text-[9px] font-semibold text-gray-400 uppercase mb-1">Bot Token</label>
                          <div className="flex gap-2">
                            <input 
                              type="password" 
                              placeholder="Enter Token"
                              className="flex-1 bg-white border border-[#e5e5e5] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-black/20"
                              onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                  const val = (e.target as HTMLInputElement).value;
                                  if (val) {
                                    setIsSavingKey('telegram');
                                    try {
                                      const res = await fetch('/api/settings', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ key: 'telegram_token', value: val })
                                      });
                                      if (res.ok) {
                                        showNotification("Telegram Token Saved", 'success');
                                        fetchBotInfo();
                                        (e.target as HTMLInputElement).value = '';
                                      } else {
                                        const data = await res.json();
                                        showNotification(data.error || "Failed to save Telegram token", 'error');
                                      }
                                    } catch (err) {
                                      showNotification("Network error", 'error');
                                    } finally {
                                      setIsSavingKey(null);
                                    }
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>

                        {user && (
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <h5 className="text-[10px] font-bold text-blue-900 uppercase mb-1">Link your account</h5>
                            <p className="text-[10px] text-blue-700 mb-2">
                              To see your Telegram conversations in this history, send this command to your bot:
                            </p>
                            <div className="flex items-center justify-between bg-white p-2 rounded border border-blue-200">
                              <code className="text-[10px] font-mono text-blue-800">/link {user.uid}</code>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(`/link ${user.uid}`);
                                  showNotification("Command copied to clipboard", 'success');
                                }}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4 border border-[#e5e5e5] rounded-xl bg-[#f9f9f9]">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-sm font-medium">Background Persistence</h4>
                      </div>
                      <p className="text-xs text-gray-500 mb-4">
                        The LLM Router and Telegram Bot run 24/7 on our servers. You can close this window and your bot will continue to respond.
                      </p>
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

        {activeTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                <h2 className="text-2xl font-semibold">Memory</h2>
                <button 
                  onClick={cleanupFacts}
                  disabled={isCleaningFacts || facts.length < 2}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-black text-white text-xs font-medium rounded-xl hover:opacity-80 transition-all disabled:opacity-20 w-full md:w-auto"
                >
                  {isCleaningFacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Clean Up Memory
                </button>
              </div>
              <p className="text-sm text-gray-500 mb-8">Facts and files the assistant will remember across chats.</p>
              
              <section className="mb-12">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Facts</h3>
                <div className="mb-6">
                  <div className="flex gap-2">
                    <input 
                      value={newFact}
                      onChange={(e) => setNewFact(e.target.value)}
                      placeholder="Add a new fact to remember..."
                      className="flex-1 border border-[#e5e5e5] rounded-xl px-4 py-2 text-sm outline-none focus:border-black/20"
                    />
                    <button 
                      onClick={addFact}
                      className="p-2 bg-black text-white rounded-xl hover:opacity-80 transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {facts.map(fact => (
                    <div key={fact.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 transition-all gap-3">
                      <p className="text-sm flex-1 break-words min-w-0">{fact.content}</p>
                      <button 
                        onClick={() => deleteFact(fact.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-all md:opacity-0 md:group-hover:opacity-100 opacity-100 shrink-0"
                        title="Delete fact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {facts.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">
                      No facts saved yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="mb-12">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Websites</h3>
                <div className="mb-6">
                  <div className="flex gap-2">
                    <input 
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="Enter a website URL (e.g., https://example.com)..."
                      className="flex-1 border border-[#e5e5e5] rounded-xl px-4 py-2 text-sm outline-none focus:border-black/20"
                    />
                    <button 
                      onClick={addMemoryUrl}
                      disabled={isAddingUrl}
                      className="p-2 bg-black text-white rounded-xl hover:opacity-80 transition-all disabled:opacity-50"
                    >
                      {isAddingUrl ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {memoryUrls.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 transition-all gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.title}</p>
                        <p className="text-[10px] text-gray-400 truncate">{u.url}</p>
                      </div>
                      <button 
                        onClick={() => deleteMemoryUrl(u.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-all md:opacity-0 md:group-hover:opacity-100 opacity-100 shrink-0"
                        title="Delete URL"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {memoryUrls.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">
                      No websites saved yet.
                    </div>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Files</h3>
                <div className="mb-6">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#e5e5e5] rounded-2xl cursor-pointer hover:bg-[#f9f9f9] transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {isUploading ? (
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                      ) : (
                        <>
                          <FileUp className="w-8 h-8 text-gray-400 group-hover:text-black transition-all mb-2" />
                          <p className="text-xs text-gray-500">Click to upload or drag and drop</p>
                          <p className="text-[10px] text-gray-400 mt-1">TXT, MD, JSON, etc.</p>
                        </>
                      )}
                    </div>
                    <input type="file" className="hidden" onChange={uploadMemoryFile} disabled={isUploading} />
                  </label>
                </div>

                <div className="space-y-3">
                  {memoryFiles.map(file => (
                    <div key={file.id} className="flex items-center justify-between p-4 border border-[#e5e5e5] rounded-xl group hover:border-black/10 transition-all gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-[#f4f4f4] rounded-lg flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">{Math.round(file.size / 1024)} KB • {safeFormatDate(file.timestamp)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={() => toggleSkill(file.id, !!file.isSkill)}
                          className={`p-1.5 rounded-lg transition-all ${file.isSkill ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:text-amber-500'}`}
                          title={file.isSkill ? "Marked as Skill" : "Mark as Skill"}
                        >
                          <Zap className={`w-4 h-4 ${file.isSkill ? 'fill-current' : ''}`} />
                        </button>
                        <button 
                          onClick={() => deleteMemoryFile(file.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-all md:opacity-0 md:group-hover:opacity-100 opacity-100"
                          title="Delete file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {memoryFiles.length === 0 && (
                    <div className="text-center py-8 border border-dashed border-[#e5e5e5] rounded-xl text-gray-400 text-sm">
                      No files uploaded yet.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
        {/* Summary Modal */}
        <AnimatePresence>
          {showSummaryModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-6 border-b border-[#e5e5e5] flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Conversation Summary</h2>
                      <p className="text-xs text-gray-500">AI-generated overview of your chat</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSummaryModal(false)}
                    className="p-2 hover:bg-[#f4f4f4] rounded-full transition-all"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 bg-[#fafafa]">
                  <div className="bg-white p-6 rounded-2xl border border-[#e5e5e5] shadow-sm prose prose-sm max-w-none">
                    <Markdown
                      components={{
                        pre({ node, children, ...props }: any) {
                          return (
                            <CodeBlock onCopy={() => showNotification("Code copied!", "success")}>
                              {children}
                            </CodeBlock>
                          );
                        },
                        code({ node, className, children, ...props }: any) {
                          return (
                            <code className={className} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {summary || ""}
                    </Markdown>
                  </div>
                </div>

                <div className="p-6 border-t border-[#e5e5e5] flex items-center justify-end gap-3 bg-white">
                  <button
                    onClick={() => setShowSummaryModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#f4f4f4] rounded-xl transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => summary && copyToClipboard(summary)}
                    className="flex items-center gap-2 px-6 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/80 transition-all shadow-lg shadow-black/10"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Summary
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

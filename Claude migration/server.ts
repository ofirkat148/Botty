import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import Database from "better-sqlite3";
import fs from "fs";
import { randomUUID } from "crypto";

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = "server-debug.log";
const log = (msg: string) => {
  const entry = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, entry); } catch {}
  console.log(msg);
};

log("Server starting…");

// ─── SQLite DB init ──────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, "llm-router.db");
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid          TEXT PRIMARY KEY,
      email        TEXT NOT NULL,
      display_name TEXT,
      photo_url    TEXT,
      last_login   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      uid      TEXT NOT NULL,
      provider TEXT NOT NULL,
      key      TEXT NOT NULL,
      PRIMARY KEY (uid, provider)
    );

    CREATE TABLE IF NOT EXISTS settings (
      uid  TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      uid           TEXT PRIMARY KEY,
      system_prompt TEXT NOT NULL DEFAULT '',
      local_url     TEXT NOT NULL DEFAULT 'http://localhost:11434',
      use_memory    INTEGER NOT NULL DEFAULT 1,
      auto_memory   INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS history (
      id              TEXT PRIMARY KEY,
      uid             TEXT NOT NULL,
      prompt          TEXT NOT NULL,
      response        TEXT NOT NULL,
      model           TEXT,
      tokens_used     INTEGER DEFAULT 0,
      status          TEXT DEFAULT 'success',
      conversation_id TEXT,
      created_at      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_uid    ON history(uid);
    CREATE INDEX IF NOT EXISTS idx_history_convid ON history(conversation_id);

    CREATE TABLE IF NOT EXISTS facts (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_facts_uid ON facts(uid);

    CREATE TABLE IF NOT EXISTS memory_files (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      name       TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      mime_type  TEXT,
      size       INTEGER DEFAULT 0,
      is_skill   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_files_uid ON memory_files(uid);

    CREATE TABLE IF NOT EXISTS memory_urls (
      id         TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      url        TEXT NOT NULL,
      title      TEXT,
      content    TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_urls_uid ON memory_urls(uid);

    CREATE TABLE IF NOT EXISTS daily_usage (
      uid         TEXT NOT NULL,
      date        TEXT NOT NULL,
      tokens      INTEGER NOT NULL DEFAULT 0,
      model_usage TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (uid, date)
    );

    CREATE TABLE IF NOT EXISTS telegram_links (
      chat_id    TEXT PRIMARY KEY,
      uid        TEXT NOT NULL,
      username   TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_state (
      chat_id           TEXT PRIMARY KEY,
      session_id        TEXT,
      last_seen         INTEGER DEFAULT 0,
      selected_model    TEXT,
      selected_provider TEXT,
      system_prompt     TEXT,
      sandbox_enabled   INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_tokens (
      uid                 TEXT PRIMARY KEY,
      google_access_token TEXT,
      updated_at          TEXT NOT NULL
    );
  `);
  log("SQLite schema initialised.");
}

initDb();

// ─── SQLite helpers ───────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function upsertUser(profile: { id: string; email: string; displayName?: string; photoURL?: string }) {
  db.prepare(`
    INSERT INTO users (uid, email, display_name, photo_url, last_login)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET
      email        = excluded.email,
      display_name = excluded.display_name,
      photo_url    = excluded.photo_url,
      last_login   = excluded.last_login
  `).run(profile.id, profile.email, profile.displayName ?? null, profile.photoURL ?? null, now());
}

function getSettings(uid: string): Record<string, any> {
  const row = db.prepare("SELECT data FROM settings WHERE uid = ?").get(uid) as any;
  if (!row) return {};
  try { return JSON.parse(row.data); } catch { return {}; }
}

function setSettings(uid: string, patch: Record<string, any>) {
  const existing = getSettings(uid);
  const merged = { ...existing, ...patch };
  db.prepare(`
    INSERT INTO settings (uid, data) VALUES (?, ?)
    ON CONFLICT(uid) DO UPDATE SET data = excluded.data
  `).run(uid, JSON.stringify(merged));
}

function incrementDailyUsage(uid: string, tokensUsed: number, modelKey: string) {
  const date = new Date().toISOString().split("T")[0];
  const row = db.prepare("SELECT tokens, model_usage FROM daily_usage WHERE uid=? AND date=?").get(uid, date) as any;
  const modelUsage: Record<string, number> = row ? JSON.parse(row.model_usage) : {};
  modelUsage[modelKey] = (modelUsage[modelKey] || 0) + tokensUsed;
  db.prepare(`
    INSERT INTO daily_usage (uid, date, tokens, model_usage) VALUES (?, ?, ?, ?)
    ON CONFLICT(uid, date) DO UPDATE SET
      tokens      = tokens + excluded.tokens,
      model_usage = excluded.model_usage
  `).run(uid, date, tokensUsed, JSON.stringify(modelUsage));
}

// ─── Passport / Auth setup ───────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const SESSION_SECRET       = process.env.SESSION_SECRET       ?? "change-me-in-production";
const BASE_URL             = process.env.BASE_URL             ?? "http://localhost:3000";

passport.use(new GoogleStrategy(
  {
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL:  `${BASE_URL}/auth/google/callback`,
    scope:        ["profile", "email", "https://www.googleapis.com/auth/gmail.send"],
  },
  (_accessToken, _refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value ?? "";
    upsertUser({
      id:          profile.id,
      email,
      displayName: profile.displayName,
      photoURL:    profile.photos?.[0]?.value,
    });
    // Persist access token so Telegram bot can use Gmail on behalf of user
    db.prepare(`
      INSERT INTO user_tokens (uid, google_access_token, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(uid) DO UPDATE SET
        google_access_token = excluded.google_access_token,
        updated_at          = excluded.updated_at
    `).run(profile.id, _accessToken, now());

    done(null, { uid: profile.id, email, displayName: profile.displayName, photoURL: profile.photos?.[0]?.value });
  }
));

passport.serializeUser((user: any, done) => done(null, user.uid));
passport.deserializeUser((uid: string, done) => {
  const row = db.prepare("SELECT uid, email, display_name, photo_url FROM users WHERE uid=?").get(uid) as any;
  if (!row) return done(null, false);
  done(null, { uid: row.uid, email: row.email, displayName: row.display_name, photoURL: row.photo_url });
});

// ─── Provider / Model registry ────────────────────────────────────────────────

interface ModelMetrics {
  id: string; provider: string;
  costWeight: number; reasoningScore: number; speedScore: number;
  creativeScore: number; codingScore: number; visionScore: number;
}

const MODEL_REGISTRY: ModelMetrics[] = [
  { id: "gemini-3-flash-preview",        provider: "google",    costWeight: 1,   reasoningScore: 6,  speedScore: 10, creativeScore: 6,  codingScore: 6,  visionScore: 8  },
  { id: "gemini-3.1-pro-preview",        provider: "google",    costWeight: 3,   reasoningScore: 9,  speedScore: 7,  creativeScore: 8,  codingScore: 8,  visionScore: 9  },
  { id: "gemini-3.1-flash-lite-preview", provider: "google",    costWeight: 0.5, reasoningScore: 5,  speedScore: 10, creativeScore: 5,  codingScore: 4,  visionScore: 7  },
  { id: "gemini-flash-latest",           provider: "google",    costWeight: 1,   reasoningScore: 6,  speedScore: 10, creativeScore: 6,  codingScore: 6,  visionScore: 8  },
  { id: "gpt-4o",                        provider: "openai",    costWeight: 8,   reasoningScore: 9,  speedScore: 8,  creativeScore: 9,  codingScore: 8,  visionScore: 9  },
  { id: "gpt-4o-mini",                   provider: "openai",    costWeight: 1,   reasoningScore: 7,  speedScore: 9,  creativeScore: 7,  codingScore: 7,  visionScore: 8  },
  { id: "claude-3-5-sonnet-20240620",    provider: "anthropic", costWeight: 8,   reasoningScore: 9,  speedScore: 6,  creativeScore: 9,  codingScore: 10, visionScore: 9  },
  { id: "claude-3-5-haiku-20241022",     provider: "anthropic", costWeight: 2,   reasoningScore: 7,  speedScore: 9,  creativeScore: 7,  codingScore: 7,  visionScore: 8  },
  { id: "llama-3.3-70b-versatile",       provider: "groq",      costWeight: 1,   reasoningScore: 8,  speedScore: 10, creativeScore: 7,  codingScore: 8,  visionScore: 5  },
  { id: "deepseek-chat",                 provider: "deepseek",  costWeight: 1,   reasoningScore: 9,  speedScore: 8,  creativeScore: 8,  codingScore: 9,  visionScore: 5  },
  { id: "mistral-large-latest",          provider: "mistral",   costWeight: 6,   reasoningScore: 9,  speedScore: 7,  creativeScore: 8,  codingScore: 8,  visionScore: 8  },
  { id: "grok-beta",                     provider: "xai",       costWeight: 6,   reasoningScore: 8,  speedScore: 8,  creativeScore: 7,  codingScore: 7,  visionScore: 7  },
  { id: "hypereal",                      provider: "hypereal",  costWeight: 1,   reasoningScore: 8,  speedScore: 10, creativeScore: 9,  codingScore: 7,  visionScore: 5  },
  { id: "gpt-4o",                        provider: "github",    costWeight: 1,   reasoningScore: 9,  speedScore: 8,  creativeScore: 8,  codingScore: 9,  visionScore: 8  },
  { id: "claude-3-5-sonnet",             provider: "github",    costWeight: 1,   reasoningScore: 9,  speedScore: 7,  creativeScore: 9,  codingScore: 10, visionScore: 9  },
  { id: "ollama",                        provider: "local",     costWeight: 0,   reasoningScore: 5,  speedScore: 5,  creativeScore: 5,  codingScore: 5,  visionScore: 5  },
];

function getAvailableProviders(uid: string): string[] {
  const providers = new Set<string>();
  if (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY) providers.add("google");
  if (process.env.OPENAI_API_KEY)   providers.add("openai");
  if (process.env.ANTHROPIC_API_KEY) providers.add("anthropic");
  if (process.env.GROQ_API_KEY)     providers.add("groq");
  if (process.env.DEEPSEEK_API_KEY) providers.add("deepseek");
  if (process.env.MISTRAL_API_KEY)  providers.add("mistral");
  if (process.env.XAI_API_KEY)      providers.add("xai");
  if (process.env.HYPEREAL_API_KEY) providers.add("hypereal");
  if (process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN) providers.add("github");

  const rows = db.prepare("SELECT provider FROM api_keys WHERE uid=?").all(uid) as any[];
  rows.forEach(r => providers.add(r.provider));

  const s = getSettings(uid);
  if (s.localUrl) providers.add("local");

  log(`[AUTH] Available providers for ${uid}: ${[...providers].join(", ")}`);
  return [...providers];
}

function getAPIKey(uid: string, provider: string): { apiKey: string; keySource: string } {
  const row = db.prepare("SELECT key FROM api_keys WHERE uid=? AND provider=?").get(uid, provider) as any;
  let apiKey = row?.key?.trim();
  let keySource = "sqlite";

  if (!apiKey) {
    apiKey = process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
    keySource = "env";
  }
  if (provider === "google" && (!apiKey || apiKey.startsWith("MY_"))) {
    const sys = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    if (sys) { apiKey = sys; keySource = "env-system"; }
  }
  return { apiKey: apiKey ?? "", keySource };
}

// ─── Smart Router ─────────────────────────────────────────────────────────────

function getSmartRoute(
  prompt: string, usagePct: number,
  hasMedia = false, excludeModels: string[] = [], availableProviders: string[] = []
) {
  const lower = prompt.toLowerCase();
  const isCoding   = /code|program|function|class|interface|api|sql|react|typescript|javascript|python|java|rust|golang|css|html|json/.test(lower) || (/[{}[\];]/.test(prompt) && prompt.length > 50);
  const isCreative = /story|poem|creative|imagine|fiction|lyrics|song|script|novel|describe/.test(lower);
  const isReasoning= /solve|math|logic|calculate|proof|theorem|physics|chemistry|complex|analyze|explain in detail|why|how does|compare/.test(lower) || /\d+[+\-*/]\d+/.test(prompt);

  const scored = MODEL_REGISTRY
    .filter(m => !excludeModels.includes(m.id))
    .filter(m => availableProviders.length === 0 || availableProviders.includes(m.provider))
    .map(m => {
      let score = m.reasoningScore * 2;
      if (isCoding)   score += m.codingScore   * 5;
      if (isCreative) score += m.creativeScore  * 4;
      if (isReasoning)score += m.reasoningScore * 5;
      if (hasMedia)   score += m.visionScore    * 10;
      if (prompt.length < 200) score += m.speedScore * 2;
      const penaltyMult = usagePct > 80 ? 3 : 1;
      score -= m.costWeight * penaltyMult * 2;
      if (prompt.length > 10000 && m.id === "gemini-3-flash-preview") score -= 50;
      return { ...m, score };
    });

  scored.sort((a, b) => b.score - a.score);
  let winner = scored[0];
  if (!winner && availableProviders.length > 0) {
    const found = MODEL_REGISTRY.find(m => availableProviders.includes(m.provider));
    if (found) winner = { ...found, score: 0 };
  }
  if (!winner) winner = { ...MODEL_REGISTRY[0], score: 0 };

  log(`[ROUTER] "${prompt.substring(0, 30)}…" → ${winner.id} (score ${winner.score})`);
  return {
    model: winner.id, provider: winner.provider,
    reason: `Optimised for ${isCoding ? "Coding" : isReasoning ? "Reasoning" : isCreative ? "Creativity" : "General"} with ${usagePct > 80 ? "Cost-Saving" : "Performance"} priority.`
  };
}

// ─── Memory context ───────────────────────────────────────────────────────────

function getLLMContext(uid: string): string {
  let context = "";
  try {
    const facts = db.prepare("SELECT content FROM facts WHERE uid=? LIMIT 20").all(uid) as any[];
    if (facts.length > 0)
      context += `\n\n[USER PERSONALIZATION DATA]\n${facts.map(f => `- ${f.content}`).join("\n")}`;

    const files = db.prepare("SELECT name, file_path, is_skill FROM memory_files WHERE uid=? LIMIT 5").all(uid) as any[];
    const skills  = files.filter(f => f.is_skill);
    const regular = files.filter(f => !f.is_skill);

    const readFile = (fp: string) => {
      try { return fs.readFileSync(path.join(UPLOADS_DIR, fp), "utf-8").substring(0, 4000); } catch { return ""; }
    };

    if (skills.length > 0)
      context += `\n\n[USER SKILLS/INSTRUCTIONS]\n${skills.map(f => `--- SKILL: ${f.name} ---\n${readFile(f.file_path)}`).join("\n\n")}`;
    if (regular.length > 0)
      context += `\n\n[USER FILES]\n${regular.map(f => `--- FILE: ${f.name} ---\n${readFile(f.file_path)}`).join("\n\n")}`;

    const urls = db.prepare("SELECT url, content FROM memory_urls WHERE uid=? LIMIT 5").all(uid) as any[];
    if (urls.length > 0)
      context += `\n\n[USER SAVED URLS]\n${urls.map(u => `--- URL: ${u.url} ---\n${(u.content ?? "").substring(0, 4000)}`).join("\n\n")}`;
  } catch (e: any) {
    log(`[CONTEXT] Error: ${e.message}`);
  }
  return context;
}

// ─── LLM caller ──────────────────────────────────────────────────────────────

async function callLLM(params: {
  prompt: string; provider: string; model: string;
  messages?: any[]; apiKey: string; systemPrompt: string;
  media?: any[]; localUrl?: string; maxTokens?: number;
}) {
  const { prompt, provider, model, messages, systemPrompt, media, localUrl, maxTokens = 2048 } = params;
  const apiKey = params.apiKey?.trim();
  if (!apiKey && provider !== "local") throw new Error(`${provider.toUpperCase()} API Key is required.`);

  const history = messages || [];
  let responseText = "";
  let tokensUsed   = 0;
  log(`[LLM] ${provider}:${model} prompt=${prompt.length}ch history=${history.length}`);

  try {
    if (provider === "google") {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const contents: any[] = [];
      let lastRole: string | null = null;

      history.forEach((m: any) => {
        const role = m.role === "assistant" ? "model" : "user";
        if (role === lastRole && contents.length > 0) {
          const lp = contents[contents.length - 1].parts[0];
          if (lp && typeof lp.text === "string") lp.text += `\n\n${m.content}`;
          else contents[contents.length - 1].parts.push({ text: m.content });
        } else {
          contents.push({ role, parts: [{ text: m.content }] });
          lastRole = role;
        }
      });

      const currentParts: any[] = [{ text: prompt }];
      (media ?? []).forEach((m: any) => {
        if (m.inlineData) currentParts.push({ inlineData: { mimeType: m.inlineData.mimeType, data: m.inlineData.data } });
      });

      if (lastRole === "user" && contents.length > 0)
        contents[contents.length - 1].parts.push(...currentParts);
      else
        contents.push({ role: "user", parts: currentParts });

      const result = await ai.models.generateContent({
        model, contents,
        config: { systemInstruction: systemPrompt || "You are a helpful assistant.", maxOutputTokens: maxTokens }
      });
      if (!result.candidates?.length) throw new Error("Gemini returned no candidates.");
      responseText = result.text || "";
      tokensUsed   = result.usageMetadata?.totalTokenCount ?? 0;

    } else if (["openai","xai","groq","deepseek","mistral","hypereal","github"].includes(provider)) {
      const baseUrls: Record<string,string> = {
        openai:   "https://api.openai.com/v1/chat/completions",
        xai:      "https://api.x.ai/v1/chat/completions",
        groq:     "https://api.groq.com/openai/v1/chat/completions",
        deepseek: "https://api.deepseek.com/chat/completions",
        mistral:  "https://api.mistral.ai/v1/chat/completions",
        hypereal: "https://api.hypereal.tech/api/v1/chat/completions",
        github:   "https://models.inference.ai.azure.com/chat/completions",
      };
      const apiMessages: any[] = [
        { role: "system", content: systemPrompt || "You are a helpful assistant." },
        ...history.map((m: any) => ({ role: m.role === "model" || m.role === "assistant" ? "assistant" : "user", content: m.content }))
      ];
      if (media?.length) {
        const content: any[] = [{ type: "text", text: prompt }];
        media.forEach((m: any) => {
          if (m.inlineData) content.push({ type: "image_url", image_url: { url: `data:${m.inlineData.mimeType};base64,${m.inlineData.data}` } });
        });
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: "user", content: prompt });
      }

      const response = await fetch(baseUrls[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: apiMessages, temperature: 0.7, max_tokens: maxTokens })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error(`QUOTA_EXCEEDED: ${provider.toUpperCase()} quota exceeded.`);
        throw new Error(`${provider.toUpperCase()} API Error: ${(err as any).error?.message || response.statusText}`);
      }
      const data: any = await response.json();
      responseText = data.choices?.[0]?.message?.content ?? "";
      tokensUsed   = data.usage?.total_tokens ?? 0;

    } else if (provider === "anthropic") {
      const apiMessages: any[] = [];
      let lastRole: string | null = null;
      history.forEach((m: any) => {
        const role = m.role === "model" || m.role === "assistant" ? "assistant" : "user";
        if (role === lastRole && apiMessages.length > 0) {
          const last = apiMessages[apiMessages.length - 1];
          if (typeof last.content === "string") last.content += `\n\n${m.content}`;
        } else {
          apiMessages.push({ role, content: m.content });
          lastRole = role;
        }
      });
      if (apiMessages[0]?.role === "assistant") apiMessages.shift();

      if (media?.length) {
        const content: any[] = [];
        media.forEach((m: any) => {
          if (m.inlineData) content.push({ type: "image", source: { type: "base64", media_type: m.inlineData.mimeType, data: m.inlineData.data } });
        });
        content.push({ type: "text", text: prompt });
        apiMessages.push({ role: "user", content });
      } else {
        if (lastRole === "user" && apiMessages.length > 0 && typeof apiMessages[apiMessages.length - 1].content === "string")
          apiMessages[apiMessages.length - 1].content += `\n\n${prompt}`;
        else
          apiMessages.push({ role: "user", content: prompt });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt || "You are a helpful assistant.", messages: apiMessages })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error("QUOTA_EXCEEDED: Anthropic quota exceeded.");
        throw new Error(`Anthropic API Error: ${(err as any).error?.message || response.statusText}`);
      }
      const data: any = await response.json();
      responseText = data.content?.[0]?.text ?? "";
      tokensUsed   = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);

    } else if (provider === "local") {
      const endpoint = `${(localUrl || "http://localhost:11434").replace(/\/$/, "")}/v1/chat/completions`;
      const apiMessages: any[] = [
        { role: "system", content: systemPrompt || "You are a helpful assistant." },
        ...history.map((m: any) => ({ role: m.role === "model" || m.role === "assistant" ? "assistant" : "user", content: m.content }))
      ];
      if (media?.length) {
        const content: any[] = [{ type: "text", text: prompt }];
        media.forEach((m: any) => {
          if (m.inlineData) content.push({ type: "image_url", image_url: { url: `data:${m.inlineData.mimeType};base64,${m.inlineData.data}` } });
        });
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: "user", content: prompt });
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "local-model", messages: apiMessages, stream: false, temperature: 0.7, max_tokens: maxTokens })
      });
      if (!response.ok) throw new Error(`Local LLM Error (${response.status}): ${response.statusText}`);
      const data: any = await response.json();
      responseText = data.choices?.[0]?.message?.content ?? "";
      tokensUsed   = data.usage?.total_tokens ?? 0;
    }

    if (!tokensUsed && responseText) {
      const estIn  = Math.ceil((prompt.length + (systemPrompt?.length ?? 0) + history.reduce((a: number, m: any) => a + (m.content?.length ?? 0), 0)) / 4);
      const estOut = Math.ceil(responseText.length / 4);
      tokensUsed   = estIn + estOut;
    }

    return { responseText, tokensUsed };
  } catch (err: any) {
    let msg = err.message || String(err || "Unknown error");
    try {
      if (msg.startsWith("{") || msg.includes('{"error":')) {
        const parsed = JSON.parse(msg.substring(msg.indexOf("{")));
        msg = parsed.error?.message || parsed.message || msg;
      }
    } catch {}
    log(`[LLM] Error: ${msg}`);
    throw new Error(msg);
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = 3000;

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Session store backed by SQLite
  const ConnectSQLite = (await import("connect-sqlite3")).default;
  const SQLiteStore = ConnectSQLite(session);

  app.use(session({
    store: new SQLiteStore({ db: "sessions.db", dir: __dirname }) as any,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // ── Auth guard helper ───────────────────────────────────────────────────────
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: "Unauthorised. Please sign in." });
  };

  // ── Google OAuth routes ─────────────────────────────────────────────────────
  app.get("/auth/google",
    passport.authenticate("google", { scope: ["profile", "email", "https://www.googleapis.com/auth/gmail.send"] })
  );

  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?auth=failed" }),
    (req, res) => res.redirect("/?auth=success")
  );

  app.post("/auth/logout", (req: any, res) => {
    req.logout(() => res.json({ success: true }));
  });

  app.get("/auth/me", (req: any, res) => {
    if (!req.isAuthenticated()) return res.json({ user: null });
    res.json({ user: req.user });
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: process.uptime(), bot: !!tgBot }));
  app.get("/api/keep-alive", (req, res) => res.json({ status: "alive", timestamp: Date.now() }));
  app.get("/api/debug-logs", (req, res) => {
    try { res.send(`<pre>${fs.readFileSync(LOG_FILE, "utf-8")}</pre>`); } catch { res.send("No logs."); }
  });

  // ── Memory files ────────────────────────────────────────────────────────────
  const multer = await import("multer");
  const upload = multer.default({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename:    (_req, file,  cb) => cb(null, `${randomUUID()}-${file.originalname}`)
    })
  });

  app.get("/api/memory-files", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const rows = db.prepare("SELECT id, uid, name, mime_type AS type, size, is_skill AS isSkill, created_at AS timestamp FROM memory_files WHERE uid=? ORDER BY created_at DESC").all(uid);
    res.json(rows);
  });

  app.post("/api/memory-files", requireAuth, upload.single("file"), (req: any, res) => {
    const uid = req.user.uid;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { originalname, mimetype, size, filename } = req.file;
    const isSkill = req.body.isSkill === "true" || originalname.toLowerCase().endsWith(".md") ? 1 : 0;
    const id = randomUUID();
    db.prepare("INSERT INTO memory_files (id,uid,name,file_path,mime_type,size,is_skill,created_at) VALUES (?,?,?,?,?,?,?,?)").run(id, uid, originalname, filename, mimetype, size, isSkill, now());
    res.json({ id, name: originalname });
  });

  app.delete("/api/memory-files/:id", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const row = db.prepare("SELECT file_path FROM memory_files WHERE id=? AND uid=?").get(req.params.id, uid) as any;
    if (row) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, row.file_path)); } catch {}
      db.prepare("DELETE FROM memory_files WHERE id=?").run(req.params.id);
    }
    res.json({ success: true });
  });

  app.patch("/api/memory-files/:id", requireAuth, (req: any, res) => {
    db.prepare("UPDATE memory_files SET is_skill=? WHERE id=?").run(req.body.isSkill ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  // ── Memory URLs ─────────────────────────────────────────────────────────────
  app.get("/api/memory-urls", requireAuth, (req: any, res) => {
    const rows = db.prepare("SELECT id, uid, url, title, created_at AS timestamp FROM memory_urls WHERE uid=? ORDER BY created_at DESC").all(req.user.uid);
    res.json(rows);
  });

  app.post("/api/memory-urls", requireAuth, async (req: any, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL required" });
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);
      const html = await response.text();
      const TurndownService = (await import("turndown")).default;
      const markdown = new TurndownService().turndown(html);
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch?.[1] ?? url;
      const id = randomUUID();
      db.prepare("INSERT INTO memory_urls (id,uid,url,title,content,created_at) VALUES (?,?,?,?,?,?)").run(id, req.user.uid, url, title, markdown, now());
      res.json({ id, url, title });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/memory-urls/:id", requireAuth, (req: any, res) => {
    db.prepare("DELETE FROM memory_urls WHERE id=? AND uid=?").run(req.params.id, (req as any).user.uid);
    res.json({ success: true });
  });

  // ── Facts ───────────────────────────────────────────────────────────────────
  app.get("/api/facts", requireAuth, (req: any, res) => {
    const rows = db.prepare("SELECT id, uid, content, created_at AS timestamp FROM facts WHERE uid=? ORDER BY created_at DESC").all(req.user.uid);
    res.json(rows);
  });

  app.post("/api/facts", requireAuth, (req: any, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    const id = randomUUID();
    db.prepare("INSERT INTO facts (id,uid,content,created_at) VALUES (?,?,?,?)").run(id, req.user.uid, content, now());
    res.json({ id });
  });

  app.delete("/api/facts/:id", requireAuth, (req: any, res) => {
    db.prepare("DELETE FROM facts WHERE id=? AND uid=?").run(req.params.id, (req as any).user.uid);
    res.json({ success: true });
  });

  // ── Facts cleanup ───────────────────────────────────────────────────────────
  app.post("/api/facts/cleanup", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const facts = db.prepare("SELECT id, content FROM facts WHERE uid=?").all(uid) as any[];
    if (!facts.length) return res.json({ success: true, count: 0 });
    try {
      const { apiKey } = getAPIKey(uid, "google");
      if (!apiKey) throw new Error("Missing Gemini API Key for cleanup");
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const cleanupPrompt = `You are a data cleaning assistant. Merge duplicate/similar facts.\nFACTS:\n${facts.map((f,i) => `${i}: ${f.content}`).join("\n")}\nReturn JSON: {"merged":["..."],"toDelete":[0,1,...]}`;
      const result = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: cleanupPrompt, config: { responseMimeType: "application/json" } });
      const data = JSON.parse(result.text ?? "{}");
      if (Array.isArray(data.merged)) {
        const del = db.prepare("DELETE FROM facts WHERE uid=?");
        const ins = db.prepare("INSERT INTO facts (id,uid,content,created_at) VALUES (?,?,?,?)");
        db.transaction(() => {
          del.run(uid);
          data.merged.forEach((c: string) => ins.run(randomUUID(), uid, c, now()));
        })();
        res.json({ success: true, originalCount: facts.length, newCount: data.merged.length });
      } else {
        res.json({ success: true, count: 0 });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── History ─────────────────────────────────────────────────────────────────
  app.get("/api/history", requireAuth, (req: any, res) => {
    const rows = db.prepare(`
      SELECT id, uid, prompt, response, model, tokens_used, status, conversation_id AS conversationId, created_at AS timestamp
      FROM history WHERE uid=? ORDER BY created_at DESC LIMIT 50
    `).all(req.user.uid);
    res.json(rows);
  });

  app.post("/api/history", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const { prompt, response, model, tokens_used = 0, status = "success", conversationId } = req.body;
    const id = randomUUID();
    db.prepare("INSERT INTO history (id,uid,prompt,response,model,tokens_used,status,conversation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(id, uid, prompt, response, model, tokens_used, status, conversationId ?? null, now());
    const sanitizedModel = (model || "").replace(/\./g, "_");
    incrementDailyUsage(uid, tokens_used, sanitizedModel);
    res.json({ id });
  });

  app.delete("/api/history/group/:id", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const { id } = req.params;
    if (id.startsWith("legacy_")) return res.status(400).json({ error: "Deleting legacy groups is not supported." });
    const result = db.prepare("DELETE FROM history WHERE conversation_id=? AND uid=?").run(id, uid);
    res.json({ status: "ok", deleted: result.changes });
  });

  // ── Usage ────────────────────────────────────────────────────────────────────
  app.get("/api/usage", requireAuth, (req: any, res) => {
    const date = new Date().toISOString().split("T")[0];
    const row = db.prepare("SELECT tokens, model_usage FROM daily_usage WHERE uid=? AND date=?").get(req.user.uid, date) as any;
    res.json({ tokens: row?.tokens ?? 0, modelUsage: row ? JSON.parse(row.model_usage) : {}, date });
  });

  // ── Smart route ──────────────────────────────────────────────────────────────
  app.post("/api/smart-route", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const { prompt, hasMedia, excludeModels } = req.body;
    const date = new Date().toISOString().split("T")[0];
    const row = db.prepare("SELECT tokens FROM daily_usage WHERE uid=? AND date=?").get(uid, date) as any;
    const usagePct = ((row?.tokens ?? 0) / 500000) * 100;
    const providers = getAvailableProviders(uid);
    res.json(getSmartRoute(prompt, usagePct, hasMedia, excludeModels ?? [], providers));
  });

  // ── Available providers ──────────────────────────────────────────────────────
  app.get("/api/available-providers", requireAuth, (req: any, res) => {
    res.json({ providers: getAvailableProviders(req.user.uid) });
  });

  // ── API Keys ─────────────────────────────────────────────────────────────────
  app.get("/api/keys", requireAuth, (req: any, res) => {
    const rows = db.prepare("SELECT provider, key FROM api_keys WHERE uid=?").all(req.user.uid) as any[];
    res.json(rows.map(r => ({ provider: r.provider, key: r.key ? `${r.key.substring(0,4)}...${r.key.slice(-4)}` : "" })));
  });

  app.post("/api/keys", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { provider } = req.body;
    const key = req.body.key?.trim();
    if (!key) return res.status(400).json({ error: "API key required" });
    try {
      // Validate key
      if (provider === "google") {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: key });
        await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: "hi" });
      } else if (["openai","xai","groq","deepseek","mistral","hypereal","github"].includes(provider)) {
        const testUrls: Record<string,string> = {
          openai:   "https://api.openai.com/v1/models",
          xai:      "https://api.x.ai/v1/models",
          groq:     "https://api.groq.com/openai/v1/models",
          deepseek: "https://api.deepseek.com/models",
          mistral:  "https://api.mistral.ai/v1/models",
          github:   "https://models.inference.ai.azure.com/models",
          hypereal: "https://api.hypereal.tech/api/v1/models",
        };
        const r = await fetch(testUrls[provider], { headers: { Authorization: `Bearer ${key}` } });
        if (!r.ok && r.status === 401) throw new Error(`Invalid ${provider.toUpperCase()} API Key.`);
      } else if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: "claude-3-haiku-20240307", max_tokens: 5, messages: [{ role: "user", content: "hi" }] })
        });
        if (!r.ok) { const d: any = await r.json().catch(() => ({})); throw new Error(d.error?.message || `HTTP ${r.status}`); }
      }
      db.prepare("INSERT INTO api_keys (uid,provider,key) VALUES (?,?,?) ON CONFLICT(uid,provider) DO UPDATE SET key=excluded.key").run(uid, provider, key);
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(400).json({ error: `Validation failed: ${err.message}` });
    }
  });

  app.delete("/api/keys/:provider", requireAuth, (req: any, res) => {
    db.prepare("DELETE FROM api_keys WHERE uid=? AND provider=?").run((req as any).user.uid, req.params.provider);
    res.json({ status: "ok" });
  });

  // ── User settings ────────────────────────────────────────────────────────────
  app.get("/api/user-settings", requireAuth, (req: any, res) => {
    const row = db.prepare("SELECT system_prompt, local_url, use_memory, auto_memory FROM user_settings WHERE uid=?").get(req.user.uid) as any;
    if (!row) return res.json({});
    res.json({ systemPrompt: row.system_prompt, localUrl: row.local_url, useMemory: !!row.use_memory, autoMemory: !!row.auto_memory });
  });

  app.post("/api/user-settings", requireAuth, (req: any, res) => {
    const uid = req.user.uid;
    const { systemPrompt, localUrl, useMemory, autoMemory } = req.body;
    db.prepare(`
      INSERT INTO user_settings (uid, system_prompt, local_url, use_memory, auto_memory) VALUES (?,?,?,?,?)
      ON CONFLICT(uid) DO UPDATE SET
        system_prompt = COALESCE(excluded.system_prompt, system_prompt),
        local_url     = COALESCE(excluded.local_url,     local_url),
        use_memory    = COALESCE(excluded.use_memory,    use_memory),
        auto_memory   = COALESCE(excluded.auto_memory,   auto_memory)
    `).run(uid, systemPrompt ?? null, localUrl ?? null, useMemory != null ? (useMemory ? 1 : 0) : null, autoMemory != null ? (autoMemory ? 1 : 0) : null);
    res.json({ status: "ok" });
  });

  // ── Settings (global/Telegram) ───────────────────────────────────────────────
  app.get("/api/settings", (req, res) => {
    const s = getSettings("global");
    res.json({ settings: s, bot: tgBotInfo });
  });

  app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body;
    if (key === "telegram_token" && value) {
      const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenRegex.test(value)) return res.status(400).json({ error: "Invalid Telegram token format." });
      try {
        const r = await fetch(`https://api.telegram.org/bot${value}/getMe`);
        if (!r.ok) { const d: any = await r.json().catch(() => ({})); throw new Error(d.description || "Invalid token"); }
      } catch (e: any) {
        return res.status(400).json({ error: `Token validation failed: ${e.message}` });
      }
    }
    setSettings("global", { [key]: value });
    if (key === "telegram_token") initTelegram();
    res.json({ status: "ok" });
  });

  // ── Validate provider ────────────────────────────────────────────────────────
  app.post("/api/validate-provider", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { provider, model } = req.body;
    const { apiKey } = getAPIKey(uid, provider);
    if (!apiKey && provider !== "local") return res.status(400).json({ error: `API Key for ${provider} not found.` });
    try {
      if (provider === "google") {
        const { GoogleGenAI } = await import("@google/genai");
        await new GoogleGenAI({ apiKey }).models.generateContent({ model, contents: [{ role: "user", parts: [{ text: "ping" }] }], config: { maxOutputTokens: 1 } });
      } else if (["openai","xai","groq","deepseek","mistral","hypereal"].includes(provider)) {
        const baseUrls: Record<string,string> = { openai:"https://api.openai.com/v1/chat/completions", xai:"https://api.x.ai/v1/chat/completions", groq:"https://api.groq.com/openai/v1/chat/completions", deepseek:"https://api.deepseek.com/chat/completions", mistral:"https://api.mistral.ai/v1/chat/completions", hypereal:"https://api.hypereal.tech/api/v1/chat/completions" };
        const r = await fetch(baseUrls[provider], { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`}, body: JSON.stringify({ model, messages:[{role:"user",content:"ping"}], max_tokens:1 }) });
        if (!r.ok) { const d:any=await r.json().catch(()=>({})); throw new Error(d.error?.message||r.statusText); }
      } else if (provider === "anthropic") {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"}, body: JSON.stringify({ model, max_tokens:1, messages:[{role:"user",content:"ping"}] }) });
        if (!r.ok) { const d:any=await r.json().catch(()=>({})); throw new Error(d.error?.message||r.statusText); }
      }
      res.json({ success: true });
    } catch (err: any) {
      const msg = err.message || "Unknown";
      const lower = msg.toLowerCase();
      if (lower.includes("quota") || lower.includes("429")) return res.status(429).json({ error: msg });
      if (lower.includes("api key") || lower.includes("401"))  return res.status(401).json({ error: msg });
      res.status(500).json({ error: msg });
    }
  });

  // ── Proxy request ────────────────────────────────────────────────────────────
  app.post("/api/proxy-request", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { prompt, provider, model, messages, media, sandboxed, systemPrompt } = req.body;
    try {
      const { apiKey, keySource } = getAPIKey(uid, provider);
      log(`[PROXY] ${provider} key source: ${keySource}`);
      if (!apiKey && provider !== "local") return res.status(400).json({ error: `API Key for ${provider} not found.` });

      const userSettings = db.prepare("SELECT use_memory, local_url FROM user_settings WHERE uid=?").get(uid) as any;
      const useMemory = userSettings?.use_memory !== 0;
      const localUrl  = userSettings?.local_url ?? "http://localhost:11434";
      const context   = useMemory ? getLLMContext(uid) : "";

      const base  = sandboxed ? "You are in a sandboxed environment. Only use provided context." : "You are a highly capable AI assistant.";
      const full  = `${systemPrompt ? systemPrompt + "\n\n" : ""}${base}${context}`;

      const result = await callLLM({ prompt, provider, model, messages, apiKey, systemPrompt: full, media, localUrl });
      res.json({ text: result.responseText, tokensUsed: result.tokensUsed });
    } catch (err: any) {
      const msg   = err.message || String(err);
      const lower = msg.toLowerCase();
      if (lower.includes("api key") || lower.includes("401"))   return res.status(401).json({ error: msg });
      if (lower.includes("balance") || lower.includes("402"))   return res.status(402).json({ error: "Insufficient balance." });
      if (lower.includes("quota") || lower.includes("429"))     return res.status(429).json({ error: "Quota exceeded." });
      if (lower.includes("not found") || lower.includes("404")) return res.status(404).json({ error: `Model '${model}' not found.` });
      res.status(500).json({ error: `LLM Proxy Error: ${msg}` });
    }
  });

  // ── Summarize ────────────────────────────────────────────────────────────────
  app.post("/api/summarize", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { messages } = req.body;
    if (!messages?.length) return res.status(400).json({ error: "No messages" });
    try {
      const { apiKey } = getAPIKey(uid, "google");
      if (!apiKey) return res.status(400).json({ error: "Google API Key required for summarisation." });
      const histText = messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const { responseText } = await callLLM({ prompt: `Summarise this conversation:\n\n${histText}`, provider: "google", model: "gemini-3-flash-preview", messages: [], apiKey, systemPrompt: "You are a helpful summarisation assistant." });
      res.json({ summary: responseText });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Extract facts ────────────────────────────────────────────────────────────
  app.post("/api/extract-facts", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { prompt, response } = req.body;
    if (!prompt || !response) return res.status(400).json({ error: "Missing data" });

    try {
      const userSettings = db.prepare("SELECT auto_memory FROM user_settings WHERE uid=?").get(uid) as any;
      if (userSettings?.auto_memory === 0) return res.json({ success: true, skipped: true });

      const existing = (db.prepare("SELECT content FROM facts WHERE uid=?").all(uid) as any[]).map(r => r.content);
      const extractPrompt = `Extract short personal facts about the user from this interaction. Ignore existing facts:\nEXISTING:\n${existing.map(f => `- ${f}`).join("\n") || "None."}\nUSER: ${prompt}\nAI: ${response}\nReturn ONLY a JSON array of strings. If nothing new, return [].`;

      const { apiKey } = getAPIKey(uid, "google");
      if (!apiKey) throw new Error("Missing Gemini API Key");
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: extractPrompt });
      const text = result.text ?? "";
      let facts: string[] = [];
      const match = text.match(/\[.*\]/s);
      if (match) facts = JSON.parse(match[0]);

      if (facts.length) {
        const ins = db.prepare("INSERT INTO facts (id,uid,content,created_at) VALUES (?,?,?,?)");
        let added = 0;
        db.transaction(() => {
          facts.forEach(c => {
            if (!existing.some(e => e.toLowerCase().trim() === c.toLowerCase().trim())) {
              ins.run(randomUUID(), uid, c, now());
              added++;
            }
          });
        })();
        res.json({ success: true, count: added });
      } else {
        res.json({ success: true, count: 0 });
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes("quota")) return res.status(429).json({ error: "Quota exceeded", code: "QUOTA_EXHAUSTED" });
      res.status(500).json({ error: err.message });
    }
  });

  // ── Send email ───────────────────────────────────────────────────────────────
  app.post("/api/send-email", requireAuth, async (req: any, res) => {
    const uid = req.user.uid;
    const { to, subject, body } = req.body;
    const tokenRow = db.prepare("SELECT google_access_token FROM user_tokens WHERE uid=?").get(uid) as any;
    if (!tokenRow?.google_access_token) return res.status(400).json({ error: "Google access token not found. Please sign in again." });
    try {
      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
      const raw = Buffer.from([`To: ${to}`, "Content-Type: text/html; charset=utf-8", "MIME-Version: 1.0", `Subject: ${utf8Subject}`, "", body].join("\n"))
        .toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRow.google_access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw })
      });
      if (!r.ok) { const d: any = await r.json().catch(() => ({})); throw new Error(d.error?.message || "Gmail API failed"); }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Telegram Bot ─────────────────────────────────────────────────────────────
  let tgBot: any = null;
  let tgBotInfo: any = null;
  let isTgInitializing = false;

  const initTelegram = async (force = false) => {
    if (isTgInitializing) return;
    if (tgBot && !force) {
      try { const me = await tgBot.getMe(); if (me) return; } catch {}
    }
    isTgInitializing = true;
    log("initTelegram() called.");
    try {
      const s = getSettings("global");
      const token = s.telegram_token || process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return;

      if (tgBot) { try { await tgBot.stopPolling(); } catch {} }
      await new Promise(r => setTimeout(r, 5000));

      const TelegramBot = require("node-telegram-bot-api");
      tgBot     = new TelegramBot(token, { polling: true });
      tgBotInfo = await tgBot.getMe();
      log(`Telegram Bot: @${tgBotInfo.username}`);

      await tgBot.setMyCommands([
        { command: "start",   description: "Start the bot" },
        { command: "new",     description: "New chat session" },
        { command: "link",    description: "Link account (/link [UID])" },
        { command: "status",  description: "Check link status" },
        { command: "model",   description: "Select model" },
        { command: "system",  description: "Set system prompt" },
        { command: "sandbox", description: "Toggle Sandboxed Mode" },
        { command: "email",   description: "Email current chat history" },
      ]).catch(() => {});

      tgBot.on("polling_error", (e: any) => { if (!e.message?.includes("409 Conflict")) console.error("TG polling error:", e.code, e.message); });
      tgBot.on("error",         (e: any) => { console.error("TG error:", e.message); tgBot = null; });

      tgBot.on("message", async (msg: any) => {
        const chatId = String(msg.chat.id);
        const text   = msg.text;
        if (!text) return;

        const getTgState = () => db.prepare("SELECT * FROM telegram_state WHERE chat_id=?").get(chatId) as any ?? {};
        const setTgState = (patch: Record<string,any>) => {
          const cur = getTgState();
          const merged = { chat_id: chatId, session_id: null, last_seen: 0, selected_model: null, selected_provider: null, system_prompt: null, sandbox_enabled: 0, ...cur, ...patch };
          db.prepare(`INSERT INTO telegram_state (chat_id,session_id,last_seen,selected_model,selected_provider,system_prompt,sandbox_enabled) VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(chat_id) DO UPDATE SET session_id=excluded.session_id, last_seen=excluded.last_seen, selected_model=excluded.selected_model, selected_provider=excluded.selected_provider, system_prompt=excluded.system_prompt, sandbox_enabled=excluded.sandbox_enabled`
          ).run(merged.chat_id, merged.session_id, merged.last_seen, merged.selected_model, merged.selected_provider, merged.system_prompt, merged.sandbox_enabled);
        };

        if (text === "/start") {
          tgBot.sendMessage(chatId, "🤖 LLM Router Bot\n\n/new - New session\n/link [UID] - Link account\n/status - Check status\n/model - Select model\n/sandbox - Toggle sandbox\n/email - Email chat history");
          return;
        }

        if (text === "/new") {
          setTgState({ session_id: randomUUID().substring(0,8), last_seen: Date.now() });
          tgBot.sendMessage(chatId, "✨ New session started!");
          return;
        }

        if (text.startsWith("/link ")) {
          const uid = text.split(" ")[1];
          if (uid) {
            db.prepare(`INSERT INTO telegram_links (chat_id,uid,username,created_at) VALUES (?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET uid=excluded.uid`).run(chatId, uid, msg.from?.username ?? "unknown", now());
            tgBot.sendMessage(chatId, "✅ Account linked successfully!");
          }
          return;
        }

        if (text === "/status") {
          const link = db.prepare("SELECT uid FROM telegram_links WHERE chat_id=?").get(chatId) as any;
          if (!link) { tgBot.sendMessage(chatId, "❌ Not linked. Use /link [UID]."); return; }
          const user = db.prepare("SELECT email FROM users WHERE uid=?").get(link.uid) as any;
          const token = db.prepare("SELECT google_access_token FROM user_tokens WHERE uid=?").get(link.uid) as any;
          tgBot.sendMessage(chatId, `✅ Status\n👤 UID: ${link.uid}\n📧 ${user?.email ?? "?"}\n🔑 Google: ${token?.google_access_token ? "✅" : "❌"}`, { parse_mode: "HTML" });
          return;
        }

        if (text === "/sandbox") {
          const st  = getTgState();
          const cur = !!st.sandbox_enabled;
          setTgState({ sandbox_enabled: cur ? 0 : 1 });
          tgBot.sendMessage(chatId, `🛡️ Sandbox ${!cur ? "ENABLED" : "DISABLED"}`);
          return;
        }

        if (text.startsWith("/system")) {
          const arg = text.substring(7).trim();
          if (!arg) {
            const st = getTgState();
            tgBot.sendMessage(chatId, `Current prompt: ${st.system_prompt || "Default"}\nSet with /system [prompt] or /system reset`);
          } else if (arg === "reset") {
            setTgState({ system_prompt: null });
            tgBot.sendMessage(chatId, "✅ System prompt reset.");
          } else {
            setTgState({ system_prompt: arg });
            tgBot.sendMessage(chatId, `✅ Prompt set to: ${arg}`);
          }
          return;
        }

        // Regular message — route and call LLM
        const link = db.prepare("SELECT uid FROM telegram_links WHERE chat_id=?").get(chatId) as any;
        const linkedUid = link?.uid ?? "telegram_anonymous";

        try { await tgBot.sendChatAction(chatId, "typing"); } catch {}

        // Session management
        const st   = getTgState();
        const isExpired = !st.session_id || (Date.now() - (st.last_seen || 0) > 3600000);
        const sessionId = isExpired ? randomUUID().substring(0,8) : st.session_id;
        setTgState({ session_id: sessionId, last_seen: Date.now() });
        const conversationId = `tg_${chatId}_${sessionId}`;

        // Pick model
        let model = st.selected_model ?? "";
        let provider = st.selected_provider ?? "";
        if (!model) {
          const date = new Date().toISOString().split("T")[0];
          const usage = db.prepare("SELECT tokens FROM daily_usage WHERE uid=? AND date=?").get(linkedUid, date) as any;
          const route = getSmartRoute(text, ((usage?.tokens ?? 0) / 500000) * 100);
          model    = route.model;
          provider = route.provider;
        }

        try {
          const { apiKey } = getAPIKey(linkedUid, provider);
          if (!apiKey) throw new Error(`API Key for ${provider} not found.`);
          const context   = getLLMContext(linkedUid);
          const userSettings = db.prepare("SELECT system_prompt, local_url FROM user_settings WHERE uid=?").get(linkedUid) as any;
          const base      = st.sandbox_enabled ? "SANDBOXED MODE: Only answer from provided context." : "You are a helpful AI assistant.";
          const customSys = st.system_prompt ?? userSettings?.system_prompt ?? "";
          const fullSys   = `${customSys ? customSys + "\n\n" : ""}${base}${context}`;
          const { responseText, tokensUsed } = await callLLM({ prompt: text, provider, model, apiKey, systemPrompt: fullSys, localUrl: userSettings?.local_url });
          // Send in chunks if needed
          if (responseText.length > 4000) {
            for (const chunk of (responseText.match(/[\s\S]{1,4000}/g) ?? [])) await tgBot.sendMessage(chatId, chunk);
          } else {
            await tgBot.sendMessage(chatId, responseText);
          }
          incrementDailyUsage(linkedUid, tokensUsed, `${provider}:${model}`.replace(/\./g,"_"));
          db.prepare("INSERT INTO history (id,uid,prompt,response,model,tokens_used,status,conversation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(randomUUID(), linkedUid, text, responseText, `${provider}:${model}`, tokensUsed, "success", conversationId, now());
        } catch (err: any) {
          tgBot.sendMessage(chatId, `❌ Error: ${err.message}`);
        }
      });

      tgBot.on("callback_query", async (query: any) => {
        const chatId = String(query.message.chat.id);
        const data   = query.data;
        try {
          if (data.startsWith("set_model:")) {
            const modelId = data.split(":")[1];
            if (modelId === "auto") {
              db.prepare("UPDATE telegram_state SET selected_model=NULL, selected_provider=NULL WHERE chat_id=?").run(chatId);
              await tgBot.answerCallbackQuery(query.id, { text: "Smart Router enabled" });
            } else {
              const m = MODEL_REGISTRY.find(x => x.id === modelId);
              if (m) {
                db.prepare(`INSERT INTO telegram_state (chat_id, selected_model, selected_provider) VALUES (?,?,?) ON CONFLICT(chat_id) DO UPDATE SET selected_model=excluded.selected_model, selected_provider=excluded.selected_provider`).run(chatId, m.id, m.provider);
                await tgBot.answerCallbackQuery(query.id, { text: `Model set to ${m.id}` });
              }
            }
          }
        } catch (e: any) {
          await tgBot.answerCallbackQuery(query.id, { text: `Error: ${e.message}` });
        }
      });

    } catch (err: any) {
      log(`Telegram init error: ${err.message}`);
    } finally {
      isTgInitializing = false;
    }
  };

  try { initTelegram(); } catch (e: any) { log(`Telegram startup failed: ${e.message}`); }

  // ── Vite / Static ────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    log("Initialising Vite middleware…");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  // ── Global error handler ─────────────────────────────────────────────────────
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Global error:", err);
    res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    log(`Server running on http://localhost:${PORT}`);
    setInterval(() => initTelegram().catch(e => log(`Health check failed: ${e.message}`)), 5 * 60 * 1000);
  });
}

log("Calling startServer()…");
startServer().catch(err => log(`CRITICAL: ${err.message}`));

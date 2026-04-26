import { randomUUID, createHash, createDecipheriv } from 'crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { appSettings, history, users } from '../db/schema.js';
import { callLLM, getAvailableProviders, getDefaultModel, getProviderApiKey, getRuntimeSettings, reconcileFactsForUser, saveFactsWithConsolidation } from '../utils/llm.js';
import { runChatForUser } from './chat.js';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const APP_SETTINGS_ID = 'global';
const conversationByChatId = new Map<number, string>();
let pollingPromise: Promise<void> | null = null;
let pollingOffset = 0;
let pollingSessionId = 0;
let lastKnownUsername: string | null = null;
let lastTelegramError: string | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let reconnectAttemptCount = 0;
let lastReconnectLogSignature: string | null = null;

const TELEGRAM_RETRY_BASE_DELAY_MS = 30000;
const TELEGRAM_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

type TelegramRuntimeConfig = {
  token: string;
  enabled: boolean;
  allowedChatIdsRaw: string;
  requestedProvider: string;
  requestedModel: string;
};

type TelegramBotStatus = {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  username: string | null;
  error: string | null;
};


const _TOK_ALGORITHM = 'aes-256-gcm';
const _TOK_IV_LEN = 12;
const _TOK_TAG_LEN = 16;
const _TOK_VERSION_PREFIX = 'v1:';

function decryptValue(value: string): string {
  if (!value.startsWith(_TOK_VERSION_PREFIX)) {
    // Legacy base64 migration path
    return Buffer.from(value, 'base64').toString('utf8');
  }
  const _DEV_FALLBACK = 'botty-dev-only-insecure-secret-do-not-use-in-prod';
  const secret = process.env.KEY_ENCRYPTION_SECRET || (process.env.NODE_ENV !== 'production' ? _DEV_FALLBACK : undefined);
  if (!secret || secret.length < 16) {
    throw new Error('KEY_ENCRYPTION_SECRET env var must be set to decrypt the Telegram bot token');
  }
  const key = createHash('sha256').update(secret).digest();
  const raw = Buffer.from(value.slice(_TOK_VERSION_PREFIX.length), 'base64');
  const iv = raw.subarray(0, _TOK_IV_LEN);
  const tag = raw.subarray(_TOK_IV_LEN, _TOK_IV_LEN + _TOK_TAG_LEN);
  const ciphertext = raw.subarray(_TOK_IV_LEN + _TOK_TAG_LEN);
  const decipher = createDecipheriv(_TOK_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

function getTelegramApiUrl(token: string, method: string) {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

function parseAllowedChatIds(raw: string) {
  if (!raw) {
    return null;
  }

  const allowed = raw
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item));

  return allowed.length > 0 ? new Set(allowed) : null;
}

function clearReconnectTimeout() {
  if (!reconnectTimeout) {
    return;
  }

  clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
}

function resetReconnectState() {
  clearReconnectTimeout();
  reconnectAttemptCount = 0;
  lastReconnectLogSignature = null;
}

function getTelegramErrorMessage(error: unknown) {
  const fallbackMessage = error instanceof Error ? error.message : 'Unknown Telegram error';
  const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
    ? error.cause as NodeJS.ErrnoException
    : null;

  if (cause?.code === 'ECONNRESET') {
    return 'Network connection reset while reaching Telegram';
  }

  if (cause?.code === 'ENOTFOUND') {
    return 'Telegram hostname could not be resolved';
  }

  if (cause?.code === 'ETIMEDOUT') {
    return 'Telegram request timed out';
  }

  if (cause?.code === 'ECONNREFUSED') {
    return 'Telegram connection was refused';
  }

  if (fallbackMessage === 'fetch failed' && cause?.code) {
    return `Telegram fetch failed (${cause.code})`;
  }

  return fallbackMessage;
}

function getReconnectDelayMs() {
  const exponentialDelay = TELEGRAM_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, reconnectAttemptCount - 1));
  return Math.min(exponentialDelay, TELEGRAM_RETRY_MAX_DELAY_MS);
}

const TELEGRAM_MAX_RECONNECT_ATTEMPTS = 48; // ~4 hours at max delay before giving up

function scheduleTelegramReconnect() {
  if (reconnectTimeout || !activeConfig.enabled || !activeConfig.token) {
    return;
  }

  if (reconnectAttemptCount >= TELEGRAM_MAX_RECONNECT_ATTEMPTS) {
    console.error(`Telegram bot: giving up after ${TELEGRAM_MAX_RECONNECT_ATTEMPTS} reconnect attempts. Restart the server to retry.`);
    return;
  }

  reconnectAttemptCount += 1;
  const retryDelayMs = getReconnectDelayMs();
  const retryDelaySeconds = Math.floor(retryDelayMs / 1000);
  const retryReason = lastTelegramError || 'Unknown Telegram startup error';
  const logSignature = `${retryReason}|${retryDelaySeconds}`;

  if (lastReconnectLogSignature !== logSignature) {
    console.warn(`Telegram bot unavailable: ${retryReason}. Retrying in ${retryDelaySeconds}s.`);
    lastReconnectLogSignature = logSignature;
  }

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    refreshTelegramBot().catch(error => {
      const nextError = getTelegramErrorMessage(error);
      lastTelegramError = nextError;
      scheduleTelegramReconnect();
    });
  }, retryDelayMs);
}

async function loadTelegramConfig(): Promise<TelegramRuntimeConfig> {
  let token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  let enabled = process.env.TELEGRAM_BOT_ENABLED !== 'false';
  let allowedChatIdsRaw = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim() || '';
  let requestedProvider = process.env.TELEGRAM_PROVIDER?.trim() || 'auto';
  let requestedModel = process.env.TELEGRAM_MODEL?.trim() || '';

  try {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .limit(1);

    const row = rows[0];
    if (row) {
      token = row.telegramBotToken ? decryptValue(row.telegramBotToken) : '';
      enabled = row.telegramBotEnabled !== false;
      allowedChatIdsRaw = row.telegramAllowedChatIds?.trim() || '';
      requestedProvider = row.telegramProvider?.trim() || 'auto';
      requestedModel = row.telegramModel?.trim() || '';
    }
  } catch (error) {
    console.error('Failed to load Telegram settings from database, falling back to env:', error);
  }

  return {
    token,
    enabled,
    allowedChatIdsRaw,
    requestedProvider,
    requestedModel,
  };
}

async function telegramRequest<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;

  try {
    response = await fetch(getTelegramApiUrl(token, method), {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(getTelegramErrorMessage(error), {
      cause: error,
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Telegram request failed with ${response.status}`);
  }

  const payload = await response.json() as { ok: boolean; result: T; description?: string };
  if (!payload.ok) {
    throw new Error(payload.description || 'Telegram API returned an error');
  }

  return payload.result;
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
  });
}

async function sendTelegramTyping(token: string, chatId: number) {
  await telegramRequest(token, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  });
}

async function ensureTelegramUser(update: TelegramUpdate['message']) {
  if (!update) {
    throw new Error('Telegram message is required');
  }

  const chatId = update.chat.id;
  const uid = `telegram:${chatId}`;
  const email = `telegram-${chatId}@botty.local`;
  const displayName = [update.from?.first_name, update.from?.last_name].filter(Boolean).join(' ').trim()
    || update.from?.username
    || update.chat.username
    || `Telegram ${chatId}`;

  const db = getDatabase();
  const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);

  if (existing[0]) {
    await db.update(users).set({
      displayName,
      lastLogin: new Date().toISOString(),
    }).where(eq(users.id, existing[0].id));

    return existing[0].uid;
  }

  await db.insert(users).values({
    id: randomUUID(),
    uid,
    email,
    displayName,
    photoURL: null,
    lastLogin: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  return uid;
}

async function handleTelegramMessage(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text?.trim();

  if (!message || !text) {
    return;
  }

  const config = await loadTelegramConfig();
  if (!config.enabled || !config.token) {
    return;
  }

  const allowedChatIds = parseAllowedChatIds(config.allowedChatIdsRaw);
  if (allowedChatIds && !allowedChatIds.has(message.chat.id)) {
    await sendTelegramMessage(config.token, message.chat.id, 'This chat is not allowed to use this bot.');
    return;
  }

  if (text === '/start' || text === '/help') {
    await sendTelegramMessage(
      config.token,
      message.chat.id,
      'Botty is ready. Send a message to chat.\n\nCommands:\n/start\n/help\n/reset\n/remember <text> — save a fact to memory\n/summary — summarise today\'s conversations',
    );
    return;
  }

  if (text === '/reset') {
    conversationByChatId.delete(message.chat.id);
    await sendTelegramMessage(config.token, message.chat.id, 'Conversation reset.');
    return;
  }

  // /remember <text> — save a fact to memory
  if (text.startsWith('/remember ') || text === '/remember') {
    const factText = text.slice('/remember'.length).trim();
    if (!factText) {
      await sendTelegramMessage(config.token, message.chat.id, 'Usage: /remember <text to save>');
      return;
    }
    const uid = await ensureTelegramUser(message);
    await saveFactsWithConsolidation(uid, [{ content: factText, isSkill: false, timestamp: new Date() }]);
    await sendTelegramMessage(config.token, message.chat.id, `✓ Saved: “${factText.slice(0, 120)}”`);
    return;
  }

  // /summary — summarise today's conversations
  if (text === '/summary') {
    const uid = await ensureTelegramUser(message);
    await sendTelegramTyping(config.token, message.chat.id);
    try {
      const summary = await buildDailySummary(uid);
      await sendTelegramMessage(config.token, message.chat.id, summary);
    } catch (error) {
      await sendTelegramMessage(config.token, message.chat.id, 'Could not generate summary: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
    return;
  }

  const uid = await ensureTelegramUser(message);

  await sendTelegramTyping(config.token, message.chat.id);

  try {
    const result = await runChatForUser({
      uid,
      prompt: text,
      requestedProvider: config.requestedProvider,
      requestedModel: config.requestedModel,
      messages: [],
      incomingConversationId: conversationByChatId.get(message.chat.id) || null,
    });

    conversationByChatId.set(message.chat.id, result.conversationId);
    await sendTelegramMessage(config.token, message.chat.id, result.text);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    console.error('Telegram bot chat error:', error);
    await sendTelegramMessage(config.token, message.chat.id, `Botty error: ${messageText}`);
  }
}

async function pollTelegramUpdates(token: string, sessionId: number) {
  while (pollingSessionId === sessionId) {
    try {
      const updates = await telegramRequest<TelegramUpdate[]>(token, 'getUpdates', {
        offset: pollingOffset,
        timeout: 50,
        allowed_updates: ['message'],
      });
      lastTelegramError = null;
      reconnectAttemptCount = 0;
      lastReconnectLogSignature = null;

      for (const update of updates) {
        pollingOffset = update.update_id + 1;
        await handleTelegramMessage(update);
      }
    } catch (error) {
      const nextError = getTelegramErrorMessage(error);
      const shouldLog = nextError !== lastTelegramError;
      lastTelegramError = nextError;
      if (shouldLog) {
        console.error('Telegram polling error:', error);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

function sameConfig(left: TelegramRuntimeConfig, right: TelegramRuntimeConfig) {
  return left.token === right.token
    && left.enabled === right.enabled
    && left.allowedChatIdsRaw === right.allowedChatIdsRaw
    && left.requestedProvider === right.requestedProvider
    && left.requestedModel === right.requestedModel;
}

let activeConfig: TelegramRuntimeConfig = {
  token: '',
  enabled: true,
  allowedChatIdsRaw: '',
  requestedProvider: 'auto',
  requestedModel: '',
};

export async function refreshTelegramBot() {
  const nextConfig = await loadTelegramConfig();

  if (!nextConfig.enabled || !nextConfig.token) {
    resetReconnectState();
    if (pollingPromise) {
      pollingSessionId += 1;
      pollingPromise = null;
      console.log('Telegram bot disabled');
    }
    activeConfig = nextConfig;
    lastKnownUsername = null;
    lastTelegramError = null;
    return;
  }

  if (pollingPromise && sameConfig(activeConfig, nextConfig)) {
    return;
  }

  pollingSessionId += 1;
  const sessionId = pollingSessionId;
  activeConfig = nextConfig;
  clearReconnectTimeout();
  try {
    const me = await telegramRequest<{ username?: string }>(nextConfig.token, 'getMe');
    lastKnownUsername = me.username || null;
    lastTelegramError = null;
    reconnectAttemptCount = 0;
    lastReconnectLogSignature = null;
    console.log(`Telegram bot enabled${me.username ? ` as @${me.username}` : ''}`);

    // Register bot commands so Telegram clients show autocomplete suggestions
    await telegramRequest(nextConfig.token, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Start chatting with Botty' },
        { command: 'help', description: 'Show available commands' },
        { command: 'reset', description: 'Start a new conversation' },
        { command: 'remember', description: 'Save a fact to memory' },
        { command: 'summary', description: "Summarise today's conversations" },
      ],
    }).catch((error: unknown) => {
      // Non-fatal: autocomplete registration failure should not prevent the bot from running
      console.warn('Failed to register Telegram bot commands:', error instanceof Error ? error.message : error);
    });
    pollingPromise = pollTelegramUpdates(nextConfig.token, sessionId)
      .catch(error => {
        lastTelegramError = getTelegramErrorMessage(error);
        console.error('Telegram bot stopped:', error);
      })
      .finally(() => {
        if (pollingSessionId === sessionId) {
          pollingPromise = null;
        }
      });
  } catch (error) {
    lastKnownUsername = null;
    lastTelegramError = getTelegramErrorMessage(error);
    pollingPromise = null;
    scheduleTelegramReconnect();
    throw error;
  }
}

export async function startTelegramBot() {
  try {
    await refreshTelegramBot();
  } catch (error) {
    pollingPromise = null;
    const message = getTelegramErrorMessage(error);
    lastTelegramError = message;
    console.warn(`Telegram bot startup deferred: ${message}`);
  }
}

export async function getTelegramBotStatus(): Promise<TelegramBotStatus> {
  const config = await loadTelegramConfig();

  return {
    configured: Boolean(config.token),
    enabled: config.enabled,
    running: Boolean(pollingPromise) && !lastTelegramError,
    username: lastKnownUsername,
    error: lastTelegramError,
  };
}

// ── Daily summary / digest helpers ────────────────────────────────────────────

async function buildDailySummary(uid: string): Promise<string> {
  const db = getDatabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [todayHistory, userFacts] = await Promise.all([
    db.select({ prompt: history.prompt, response: history.response, timestamp: history.timestamp })
      .from(history)
      .where(and(eq(history.uid, uid), gte(history.timestamp, todayStart.toISOString())))
      .orderBy(desc(history.timestamp))
      .limit(20),
    reconcileFactsForUser(uid),
  ]);

  if (todayHistory.length === 0) {
    return 'No conversations today yet.';
  }

  const providers = await getAvailableProviders(uid);
  const providerName = providers[0];
  if (!providerName) {
    // No LLM available — return a plain list
    const items = todayHistory.slice(0, 5).map(h => `• ${h.prompt.slice(0, 80)}`).join('\n');
    return `Today's topics:\n${items}`;
  }
  const model = getDefaultModel(providerName);
  const apiKey = await getProviderApiKey(uid, providerName);
  const runtimeSettings = await getRuntimeSettings(uid);

  const factsSection = userFacts.length > 0
    ? `[YOUR MEMORY]\n${userFacts.slice(0, 10).map(f => `- ${f.content}`).join('\n')}`
    : '';

  const historySection = todayHistory.map(
    h => `Q: ${h.prompt.slice(0, 200)}\nA: ${h.response.slice(0, 300)}`
  ).join('\n\n');

  const summaryPrompt = [
    'Write a brief daily digest (3-6 bullet points) of what the user worked on today.',
    'Be concrete and specific. Use plain text (no markdown).',
    factsSection,
    '[TODAY\'S CONVERSATIONS]',
    historySection,
  ].filter(Boolean).join('\n\n');

  const { responseText } = await callLLM({
    prompt: summaryPrompt,
    provider: providerName,
    model,
    apiKey: apiKey || '',
    systemPrompt: 'You write brief daily digests. Be concise and specific. Plain text only.',
    localUrl: runtimeSettings.localUrl,
    messages: [],
  });

  return responseText.trim() || 'Nothing notable today.';
}

let digestInterval: ReturnType<typeof setInterval> | null = null;

export function startDigestScheduler(): void {
  if (digestInterval) return;

  digestInterval = setInterval(() => {
    sendScheduledDigestIfDue().catch(err => {
      console.error('Telegram digest scheduler error:', err);
    });
  }, 60 * 60 * 1000); // check every hour
}

async function sendScheduledDigestIfDue(): Promise<void> {
  const db = getDatabase();
  const rows = await db.select().from(appSettings).where(eq(appSettings.id, APP_SETTINGS_ID)).limit(1);
  const row = rows[0];
  if (!row?.telegramDigestEnabled || !row.telegramBotEnabled || !row.telegramBotToken) return;

  const digestHour = row.telegramDigestHour ?? 9;
  const nowUtcHour = new Date().getUTCHours();
  if (nowUtcHour !== digestHour) return;

  const todayDate = new Date().toISOString().slice(0, 10);
  if (row.telegramDigestLastSent === todayDate) return; // already sent today

  const token = decryptValue(row.telegramBotToken);
  const allowedChatIds = parseAllowedChatIds(row.telegramAllowedChatIds?.trim() || '');

  // Collect all Telegram users to send digest to
  const telegramUsers = await db.select({ uid: users.uid }).from(users)
    .where(eq(users.uid, users.uid)); // we filter below by uid prefix

  const allUsers = await db.select({ uid: users.uid }).from(users);
  const telegramUids = allUsers.filter(u => u.uid.startsWith('telegram:'));

  for (const { uid } of telegramUids) {
    const chatId = Number(uid.replace('telegram:', ''));
    if (!Number.isFinite(chatId)) continue;
    if (allowedChatIds && !allowedChatIds.has(chatId)) continue;

    try {
      const summary = await buildDailySummary(uid);
      await sendTelegramMessage(token, chatId, `🌅 Daily digest:\n\n${summary}`);
    } catch (err) {
      console.error(`Failed to send digest to ${uid}:`, err);
    }
  }

  // Mark as sent
  await db.update(appSettings)
    .set({ telegramDigestLastSent: todayDate, updatedAt: new Date().toISOString() })
    .where(eq(appSettings.id, APP_SETTINGS_ID));
}
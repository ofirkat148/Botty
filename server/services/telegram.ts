import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/index.js';
import { users } from '../db/schema.js';
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
const conversationByChatId = new Map<number, string>();
let pollingPromise: Promise<void> | null = null;
let pollingOffset = 0;

function getTelegramToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
}

function getTelegramApiUrl(method: string) {
  return `${TELEGRAM_API_BASE}/bot${getTelegramToken()}/${method}`;
}

function getAllowedChatIds() {
  const raw = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.trim();
  if (!raw) {
    return null;
  }

  const allowed = raw
    .split(',')
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item));

  return allowed.length > 0 ? new Set(allowed) : null;
}

async function telegramRequest<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(getTelegramApiUrl(method), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

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

async function sendTelegramMessage(chatId: number, text: string) {
  await telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
  });
}

async function sendTelegramTyping(chatId: number) {
  await telegramRequest('sendChatAction', {
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
      lastLogin: new Date(),
    }).where(eq(users.id, existing[0].id));

    return existing[0].uid;
  }

  await db.insert(users).values({
    id: randomUUID(),
    uid,
    email,
    displayName,
    photoURL: null,
    lastLogin: new Date(),
    createdAt: new Date(),
  });

  return uid;
}

async function handleTelegramMessage(update: TelegramUpdate) {
  const message = update.message;
  const text = message?.text?.trim();

  if (!message || !text) {
    return;
  }

  const allowedChatIds = getAllowedChatIds();
  if (allowedChatIds && !allowedChatIds.has(message.chat.id)) {
    await sendTelegramMessage(message.chat.id, 'This chat is not allowed to use this bot.');
    return;
  }

  if (text === '/start' || text === '/help') {
    await sendTelegramMessage(
      message.chat.id,
      'Botty is ready. Send a message to chat.\n\nCommands:\n/start\n/help\n/reset',
    );
    return;
  }

  if (text === '/reset') {
    conversationByChatId.delete(message.chat.id);
    await sendTelegramMessage(message.chat.id, 'Conversation reset.');
    return;
  }

  const uid = await ensureTelegramUser(message);
  const requestedProvider = process.env.TELEGRAM_PROVIDER?.trim() || 'auto';
  const requestedModel = process.env.TELEGRAM_MODEL?.trim() || '';

  await sendTelegramTyping(message.chat.id);

  try {
    const result = await runChatForUser({
      uid,
      prompt: text,
      requestedProvider,
      requestedModel,
      messages: [],
      incomingConversationId: conversationByChatId.get(message.chat.id) || null,
    });

    conversationByChatId.set(message.chat.id, result.conversationId);
    await sendTelegramMessage(message.chat.id, result.text);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    console.error('Telegram bot chat error:', error);
    await sendTelegramMessage(message.chat.id, `Botty error: ${messageText}`);
  }
}

async function pollTelegramUpdates() {
  while (true) {
    try {
      const updates = await telegramRequest<TelegramUpdate[]>('getUpdates', {
        offset: pollingOffset,
        timeout: 50,
        allowed_updates: ['message'],
      });

      for (const update of updates) {
        pollingOffset = update.update_id + 1;
        await handleTelegramMessage(update);
      }
    } catch (error) {
      console.error('Telegram polling error:', error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

export async function startTelegramBot() {
  if (process.env.TELEGRAM_BOT_ENABLED === 'false') {
    return;
  }

  const token = getTelegramToken();
  if (!token) {
    return;
  }

  if (pollingPromise) {
    return;
  }

  const me = await telegramRequest<{ username?: string }>('getMe');
  console.log(`Telegram bot enabled${me.username ? ` as @${me.username}` : ''}`);
  pollingPromise = pollTelegramUpdates();
}
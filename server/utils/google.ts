/**
 * Shared Google API helpers used by both the OAuth routes and the chat service.
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { apiKeys } from '../db/schema.js';

// ─── Encryption (same scheme as settings.ts / google routes) ─────────────────

const ENC_ALGORITHM = 'aes-256-gcm';
const ENC_IV_LEN = 12;
const ENC_TAG_LEN = 16;
const ENC_PREFIX = 'v1:';
const _DEV_FALLBACK = 'botty-dev-only-insecure-secret-do-not-use-in-prod';

function getEncKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET || (process.env.NODE_ENV !== 'production' ? _DEV_FALLBACK : undefined);
  if (!secret || secret.length < 16) throw new Error('KEY_ENCRYPTION_SECRET not set');
  return createHash('sha256').update(secret).digest();
}

export function encryptGoogleValue(value: string): string {
  const key = getEncKey();
  const iv = randomBytes(ENC_IV_LEN);
  const cipher = createCipheriv(ENC_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptGoogleValue(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return Buffer.from(stored, 'base64').toString('utf8');
  const key = getEncKey();
  const raw = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
  const iv = raw.subarray(0, ENC_IV_LEN);
  const tag = raw.subarray(ENC_IV_LEN, ENC_IV_LEN + ENC_TAG_LEN);
  const ciphertext = raw.subarray(ENC_IV_LEN + ENC_TAG_LEN);
  const decipher = createDecipheriv(ENC_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

export function getGoogleProviderValue(uid: string, provider: string): string | null {
  const db = getDatabase();
  const row = db.select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider)))
    .get();
  if (!row) return null;
  try { return decryptGoogleValue(row.encryptedKey); } catch { return null; }
}

export function setGoogleProviderValue(uid: string, provider: string, value: string): void {
  const db = getDatabase();
  const existing = db.select({ id: apiKeys.id }).from(apiKeys)
    .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).get();
  const encrypted = encryptGoogleValue(value);
  if (existing) {
    db.update(apiKeys).set({ encryptedKey: encrypted })
      .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).run();
  } else {
    db.insert(apiKeys).values({ id: randomUUID(), uid, provider, encryptedKey: encrypted }).run();
  }
}

export function deleteGoogleProviderValue(uid: string, provider: string): void {
  const db = getDatabase();
  db.delete(apiKeys).where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).run();
}

// ─── Token management ─────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  email?: string;
};

async function refreshAccessToken(uid: string, clientId: string, clientSecret: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const existing = getGoogleProviderValue(uid, 'google_tokens');
    if (existing) {
      const tokens: GoogleTokens = JSON.parse(existing);
      tokens.access_token = data.access_token;
      tokens.expiry_date = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
      setGoogleProviderValue(uid, 'google_tokens', JSON.stringify(tokens));
    }
    return data.access_token;
  } catch { return null; }
}

export async function getValidGoogleAccessToken(uid: string): Promise<string | null> {
  const clientId = getGoogleProviderValue(uid, 'google_client_id');
  const clientSecret = getGoogleProviderValue(uid, 'google_client_secret');
  const tokensRaw = getGoogleProviderValue(uid, 'google_tokens');
  if (!clientId || !clientSecret || !tokensRaw) return null;
  try {
    const tokens: GoogleTokens = JSON.parse(tokensRaw);
    if (tokens.expiry_date && Date.now() > tokens.expiry_date - 60_000 && tokens.refresh_token) {
      return await refreshAccessToken(uid, clientId, clientSecret, tokens.refresh_token);
    }
    return tokens.access_token || null;
  } catch { return null; }
}

export function getGoogleConnectionStatus(uid: string): { credentialsConfigured: boolean; connected: boolean; email: string | null } {
  const clientId = getGoogleProviderValue(uid, 'google_client_id');
  const clientSecret = getGoogleProviderValue(uid, 'google_client_secret');
  const tokensRaw = getGoogleProviderValue(uid, 'google_tokens');
  let email: string | null = null;
  let connected = false;
  if (tokensRaw) {
    try {
      const tokens: GoogleTokens = JSON.parse(tokensRaw);
      connected = !!tokens.access_token;
      email = tokens.email || null;
    } catch { /* noop */ }
  }
  return { credentialsConfigured: !!(clientId && clientSecret), connected, email };
}

// ─── Calendar API ─────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  htmlLink?: string;
};

export async function fetchCalendarEvents(accessToken: string, options: { maxResults?: number; timeMin?: string } = {}): Promise<CalendarEvent[]> {
  const maxResults = Math.min(options.maxResults || 10, 50);
  const timeMin = options.timeMin || new Date().toISOString();
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    timeMin,
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = await res.json() as { items?: CalendarEvent[] };
  return data.items || [];
}

export async function createCalendarEvent(accessToken: string, event: {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
}): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {
    summary: String(event.summary).slice(0, 500),
    description: event.description ? String(event.description).slice(0, 8000) : undefined,
    start: { dateTime: event.start, timeZone: 'UTC' },
    end: { dateTime: event.end, timeZone: 'UTC' },
  };
  if (Array.isArray(event.attendees) && event.attendees.length > 0) {
    body.attendees = event.attendees.slice(0, 20).map(email => ({ email }));
  }
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  return res.json() as Promise<CalendarEvent>;
}

// ─── Gmail API ────────────────────────────────────────────────────────────────

export type GmailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
};

export async function fetchGmailMessages(accessToken: string, options: { maxResults?: number; query?: string } = {}): Promise<GmailMessage[]> {
  const maxResults = Math.min(options.maxResults || 10, 50);
  const query = options.query || 'in:inbox';
  const listParams = new URLSearchParams({ maxResults: String(maxResults), q: query });
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Gmail API error: ${listRes.status}`);
  const listData = await listRes.json() as { messages?: Array<{ id: string }> };
  const ids = (listData.messages || []).slice(0, maxResults);

  const messages = await Promise.all(ids.map(async ({ id }) => {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) return null;
      const msg = await msgRes.json() as { id: string; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find(h => h.name === name)?.value || '';
      return { id: msg.id, subject: get('Subject'), from: get('From'), date: get('Date'), snippet: msg.snippet || '' };
    } catch { return null; }
  }));
  return messages.filter((m): m is GmailMessage => m !== null);
}

export async function sendGmail(accessToken: string, to: string, subject: string, body: string): Promise<{ messageId?: string }> {
  const raw = [
    `To: ${to}`,
    `Subject: ${String(subject).slice(0, 200)}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    String(body).slice(0, 50000),
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64url');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  });
  if (!res.ok) throw new Error(`Gmail send error: ${res.status}`);
  const sent = await res.json() as { id?: string };
  return { messageId: sent.id };
}

// ─── Context builder for chat service ────────────────────────────────────────

const CALENDAR_KEYWORDS = /\b(calendar|schedule|event|meeting|appointment|today|tomorrow|week|upcoming|agenda|busy|free|slot|remind)\b/i;
const EMAIL_KEYWORDS = /\b(email|mail|gmail|inbox|message|send|compose|reply|wrote|received|unread)\b/i;

function formatEventTime(dt?: string, d?: string): string {
  if (dt) {
    try { return new Date(dt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return dt; }
  }
  return d || '?';
}

/**
 * Builds a context string with live Google data to inject into the system prompt.
 * Only fetches if the prompt contains relevant keywords.
 */
export async function buildGoogleContext(uid: string, prompt: string): Promise<string> {
  const wantsCalendar = CALENDAR_KEYWORDS.test(prompt);
  const wantsEmail = EMAIL_KEYWORDS.test(prompt);
  if (!wantsCalendar && !wantsEmail) return '';

  const accessToken = await getValidGoogleAccessToken(uid);
  if (!accessToken) return '';

  const parts: string[] = ['[GOOGLE DATA — live, fetched just now]'];

  if (wantsCalendar) {
    try {
      const events = await fetchCalendarEvents(accessToken, { maxResults: 10 });
      if (events.length === 0) {
        parts.push('Google Calendar: No upcoming events found.');
      } else {
        parts.push('Google Calendar — upcoming events:');
        for (const e of events) {
          const start = formatEventTime(e.start?.dateTime, e.start?.date);
          const end = formatEventTime(e.end?.dateTime, e.end?.date);
          const attendees = e.attendees?.map(a => a.displayName || a.email).join(', ');
          parts.push(`• ${e.summary || '(No title)'} | ${start} → ${end}${attendees ? ` | With: ${attendees}` : ''}${e.location ? ` | @ ${e.location}` : ''}`);
        }
      }
    } catch (err) {
      parts.push(`Google Calendar: Failed to fetch (${err instanceof Error ? err.message : 'error'})`);
    }
  }

  if (wantsEmail) {
    try {
      const messages = await fetchGmailMessages(accessToken, { maxResults: 10 });
      if (messages.length === 0) {
        parts.push('Gmail: No messages found in inbox.');
      } else {
        parts.push('Gmail — recent inbox messages:');
        for (const m of messages) {
          parts.push(`• From: ${m.from} | Subject: ${m.subject} | ${m.date}\n  Preview: ${m.snippet}`);
        }
      }
    } catch (err) {
      parts.push(`Gmail: Failed to fetch (${err instanceof Error ? err.message : 'error'})`);
    }
  }

  if (parts.length === 1) return ''; // Only had the header line
  return parts.join('\n');
}

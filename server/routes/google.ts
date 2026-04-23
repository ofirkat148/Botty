/**
 * Google OAuth 2.0 integration — Calendar (read/write) + Gmail (read/send)
 *
 * Setup:
 *   1. Enter Client ID + Client Secret in Botty Settings → Google integration
 *   2. Click "Connect Google account" — authorises via OAuth
 *   3. Tokens are stored encrypted per-user in the google_tokens table
 *
 * Endpoints:
 *   GET  /api/google/status          — connection status for the logged-in user
 *   POST /api/google/credentials     — save client ID + secret (Settings)
 *   GET  /api/google/auth            — redirect to Google consent screen
 *   GET  /api/google/callback        — OAuth callback; stores tokens; redirects to /?google=connected
 *   DELETE /api/google/disconnect    — revoke + remove stored tokens
 *   GET  /api/google/calendar/events — list upcoming events
 *   POST /api/google/calendar/events — create an event
 *   GET  /api/google/gmail/messages  — list recent email threads
 *   POST /api/google/gmail/send      — send an email
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { apiKeys } from '../db/schema.js';
import { randomUUID } from 'crypto';

const router = Router();

// ─── Encryption helpers (same scheme as settings.ts) ─────────────────────────

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

function encrypt(value: string): string {
  const key = getEncKey();
  const iv = randomBytes(ENC_IV_LEN);
  const cipher = createCipheriv(ENC_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(stored: string): string {
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

function getProviderValue(uid: string, provider: string): string | null {
  const db = getDatabase();
  const row = db.select({ encryptedKey: apiKeys.encryptedKey })
    .from(apiKeys)
    .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider)))
    .get();
  if (!row) return null;
  try { return decrypt(row.encryptedKey); } catch { return null; }
}

function setProviderValue(uid: string, provider: string, value: string): void {
  const db = getDatabase();
  const existing = db.select({ id: apiKeys.id }).from(apiKeys)
    .where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).get();
  const encrypted = encrypt(value);
  if (existing) {
    db.update(apiKeys).set({ encryptedKey: encrypted }).where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).run();
  } else {
    db.insert(apiKeys).values({ id: randomUUID(), uid, provider, encryptedKey: encrypted }).run();
  }
}

function deleteProviderValue(uid: string, provider: string): void {
  const db = getDatabase();
  db.delete(apiKeys).where(and(eq(apiKeys.uid, uid), eq(apiKeys.provider, provider))).run();
}

// ─── Google OAuth helpers ─────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function getRedirectUri(req: Request): string {
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (publicBase) return `${publicBase}/api/google/callback`;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${process.env.PORT || 5000}`;
  return `${proto}://${host}/api/google/callback`;
}

type GoogleTokens = {
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
    // Update stored tokens
    const existing = getProviderValue(uid, 'google_tokens');
    if (existing) {
      const tokens: GoogleTokens = JSON.parse(existing);
      tokens.access_token = data.access_token;
      tokens.expiry_date = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
      setProviderValue(uid, 'google_tokens', JSON.stringify(tokens));
    }
    return data.access_token;
  } catch { return null; }
}

async function getValidAccessToken(uid: string): Promise<string | null> {
  const clientId = getProviderValue(uid, 'google_client_id');
  const clientSecret = getProviderValue(uid, 'google_client_secret');
  const tokensRaw = getProviderValue(uid, 'google_tokens');
  if (!clientId || !clientSecret || !tokensRaw) return null;
  try {
    const tokens: GoogleTokens = JSON.parse(tokensRaw);
    // Refresh if expiring within 60 seconds
    if (tokens.expiry_date && Date.now() > tokens.expiry_date - 60_000 && tokens.refresh_token) {
      return await refreshAccessToken(uid, clientId, clientSecret, tokens.refresh_token);
    }
    return tokens.access_token || null;
  } catch { return null; }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Status — does not require auth (for the callback redirect check), but most routes do
router.get('/status', authMiddleware, (req: Request, res: Response) => {
  const uid = req.userId!;
  const clientId = getProviderValue(uid, 'google_client_id');
  const clientSecret = getProviderValue(uid, 'google_client_secret');
  const tokensRaw = getProviderValue(uid, 'google_tokens');
  let email: string | null = null;
  let connected = false;
  if (tokensRaw) {
    try {
      const tokens: GoogleTokens = JSON.parse(tokensRaw);
      connected = !!tokens.access_token;
      email = tokens.email || null;
    } catch { /* noop */ }
  }
  res.json({
    credentialsConfigured: !!(clientId && clientSecret),
    connected,
    email,
  });
});

// Save client credentials (entered in Settings)
router.post('/credentials', authMiddleware, (req: Request, res: Response) => {
  const uid = req.userId!;
  const { clientId, clientSecret } = req.body;
  if (!clientId || typeof clientId !== 'string' || !clientSecret || typeof clientSecret !== 'string') {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }
  setProviderValue(uid, 'google_client_id', clientId.trim());
  setProviderValue(uid, 'google_client_secret', clientSecret.trim());
  res.json({ success: true });
});

// Start OAuth flow — redirect to Google
// Auth can come from the Authorization header OR a ?token= query param (needed for
// window.open redirects which cannot attach Authorization headers).
router.get('/auth', (req: Request, res: Response) => {
  // Try header first, then query param
  const rawToken = extractTokenFromHeader(req.headers.authorization)
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
  if (!rawToken) return res.status(401).json({ error: 'No authorization token provided' });
  let uid: string;
  try {
    const payload = verifyToken(rawToken);
    uid = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const clientId = getProviderValue(uid, 'google_client_id');
  if (!clientId) return res.status(400).json({ error: 'Google client ID not configured. Enter credentials in Settings first.' });
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: uid, // pass uid to match in callback
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

// OAuth callback — exchange code for tokens
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !state) {
    return res.redirect('/?google=error&reason=' + encodeURIComponent(error || 'missing_code'));
  }
  const uid = state;
  const clientId = getProviderValue(uid, 'google_client_id');
  const clientSecret = getProviderValue(uid, 'google_client_secret');
  if (!clientId || !clientSecret) {
    return res.redirect('/?google=error&reason=missing_credentials');
  }
  try {
    const redirectUri = getRedirectUri(req);
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[google] Token exchange failed:', body);
      return res.redirect('/?google=error&reason=token_exchange_failed');
    }
    const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenData.access_token) {
      return res.redirect('/?google=error&reason=no_access_token');
    }
    // Fetch user email
    let email: string | undefined;
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (profileRes.ok) {
        const profile = await profileRes.json() as { email?: string };
        email = profile.email;
      }
    } catch { /* non-fatal */ }

    const tokens: GoogleTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      email,
    };
    setProviderValue(uid, 'google_tokens', JSON.stringify(tokens));
    return res.redirect('/?google=connected');
  } catch (err) {
    console.error('[google] Callback error:', err);
    return res.redirect('/?google=error&reason=internal');
  }
});

// Disconnect — revoke token and remove from DB
router.delete('/disconnect', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const tokensRaw = getProviderValue(uid, 'google_tokens');
  if (tokensRaw) {
    try {
      const tokens: GoogleTokens = JSON.parse(tokensRaw);
      if (tokens.access_token) {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${tokens.access_token}`, { method: 'POST' }).catch(() => {});
      }
    } catch { /* noop */ }
  }
  deleteProviderValue(uid, 'google_tokens');
  res.json({ success: true });
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

// GET /api/google/calendar/events?maxResults=10&timeMin=<ISO>
router.get('/calendar/events', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const token = await getValidAccessToken(uid);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });

  const maxResults = Math.min(Number(req.query.maxResults) || 10, 50);
  const timeMin = typeof req.query.timeMin === 'string' ? req.query.timeMin : new Date().toISOString();
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    timeMin,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  try {
    const apiRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!apiRes.ok) {
      const body = await apiRes.text();
      return res.status(apiRes.status).json({ error: 'Google Calendar API error', detail: body });
    }
    const data = await apiRes.json() as { items?: unknown[] };
    res.json({ events: data.items || [] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calendar fetch failed' });
  }
});

// POST /api/google/calendar/events — create an event
// Body: { summary, description?, start, end, attendees?: string[] }
// start/end: ISO datetime strings
router.post('/calendar/events', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const token = await getValidAccessToken(uid);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });

  const { summary, description, start, end, attendees } = req.body;
  if (!summary || !start || !end) return res.status(400).json({ error: 'summary, start, and end are required' });

  const event: Record<string, unknown> = {
    summary: String(summary).slice(0, 500),
    description: description ? String(description).slice(0, 8000) : undefined,
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
  };
  if (Array.isArray(attendees) && attendees.length > 0) {
    event.attendees = attendees.slice(0, 20).map(email => ({ email: String(email) }));
  }

  try {
    const apiRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (!apiRes.ok) {
      const body = await apiRes.text();
      return res.status(apiRes.status).json({ error: 'Google Calendar API error', detail: body });
    }
    const created = await apiRes.json();
    res.json({ event: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calendar create failed' });
  }
});

// ─── Gmail ────────────────────────────────────────────────────────────────────

// GET /api/google/gmail/messages?maxResults=10&query=<gmail search>
router.get('/gmail/messages', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const token = await getValidAccessToken(uid);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });

  const maxResults = Math.min(Number(req.query.maxResults) || 10, 50);
  const query = typeof req.query.query === 'string' ? req.query.query : 'in:inbox';

  try {
    // List message IDs
    const listParams = new URLSearchParams({ maxResults: String(maxResults), q: query });
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      const body = await listRes.text();
      return res.status(listRes.status).json({ error: 'Gmail API error', detail: body });
    }
    const listData = await listRes.json() as { messages?: Array<{ id: string }> };
    const ids = (listData.messages || []).slice(0, maxResults);

    // Fetch message headers in parallel (subject, from, date, snippet)
    const messages = await Promise.all(ids.map(async ({ id }) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!msgRes.ok) return null;
        const msg = await msgRes.json() as {
          id: string;
          snippet?: string;
          payload?: { headers?: Array<{ name: string; value: string }> };
        };
        const headers = msg.payload?.headers || [];
        const get = (name: string) => headers.find(h => h.name === name)?.value || '';
        return { id: msg.id, subject: get('Subject'), from: get('From'), date: get('Date'), snippet: msg.snippet || '' };
      } catch { return null; }
    }));

    res.json({ messages: messages.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gmail fetch failed' });
  }
});

// POST /api/google/gmail/send
// Body: { to, subject, body }
router.post('/gmail/send', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const token = await getValidAccessToken(uid);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });

  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' });

  // Validate recipient
  const toStr = String(to).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toStr)) {
    return res.status(400).json({ error: 'Invalid recipient email address' });
  }

  const raw = [
    `To: ${toStr}`,
    `Subject: ${String(subject).slice(0, 200)}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    '',
    String(body).slice(0, 50000),
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');

  try {
    const apiRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });
    if (!apiRes.ok) {
      const errBody = await apiRes.text();
      return res.status(apiRes.status).json({ error: 'Gmail API error', detail: errBody });
    }
    const sent = await apiRes.json() as { id?: string };
    res.json({ success: true, messageId: sent.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gmail send failed' });
  }
});

export default router;

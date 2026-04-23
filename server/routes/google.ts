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
import { authMiddleware } from '../middleware/auth.js';
import { verifyToken, extractTokenFromHeader } from '../utils/jwt.js';
import {
  getGoogleProviderValue,
  setGoogleProviderValue,
  deleteGoogleProviderValue,
  getValidGoogleAccessToken,
  getGoogleConnectionStatus,
  fetchCalendarEvents,
  createCalendarEvent,
  fetchGmailMessages,
  sendGmail,
  type GoogleTokens,
} from '../utils/google.js';

const router = Router();

// ─── Google OAuth constants ───────────────────────────────────────────────────

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

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/status', authMiddleware, (req: Request, res: Response) => {
  res.json(getGoogleConnectionStatus(req.userId!));
});

router.post('/credentials', authMiddleware, (req: Request, res: Response) => {
  const uid = req.userId!;
  const { clientId, clientSecret } = req.body;
  if (!clientId || typeof clientId !== 'string' || !clientSecret || typeof clientSecret !== 'string') {
    return res.status(400).json({ error: 'clientId and clientSecret are required' });
  }
  setGoogleProviderValue(uid, 'google_client_id', clientId.trim());
  setGoogleProviderValue(uid, 'google_client_secret', clientSecret.trim());
  res.json({ success: true });
});

// Auth redirect — accepts token from header OR ?token= query param (window.open can't send headers)
router.get('/auth', (req: Request, res: Response) => {
  const rawToken = extractTokenFromHeader(req.headers.authorization)
    ?? (typeof req.query.token === 'string' ? req.query.token : null);
  if (!rawToken) return res.status(401).json({ error: 'No authorization token provided' });
  let uid: string;
  try {
    uid = verifyToken(rawToken).sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const clientId = getGoogleProviderValue(uid, 'google_client_id');
  if (!clientId) return res.status(400).json({ error: 'Google client ID not configured. Enter credentials in Settings first.' });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: uid,
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code || !state) {
    return res.redirect('/?google=error&reason=' + encodeURIComponent(error || 'missing_code'));
  }
  const uid = state;
  const clientId = getGoogleProviderValue(uid, 'google_client_id');
  const clientSecret = getGoogleProviderValue(uid, 'google_client_secret');
  if (!clientId || !clientSecret) return res.redirect('/?google=error&reason=missing_credentials');
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: getRedirectUri(req), grant_type: 'authorization_code' }),
    });
    if (!tokenRes.ok) {
      console.error('[google] Token exchange failed:', await tokenRes.text());
      return res.redirect('/?google=error&reason=token_exchange_failed');
    }
    const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokenData.access_token) return res.redirect('/?google=error&reason=no_access_token');

    let email: string | undefined;
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      if (profileRes.ok) email = ((await profileRes.json()) as { email?: string }).email;
    } catch { /* non-fatal */ }

    const tokens: GoogleTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
      email,
    };
    setGoogleProviderValue(uid, 'google_tokens', JSON.stringify(tokens));
    return res.redirect('/?google=connected');
  } catch (err) {
    console.error('[google] Callback error:', err);
    return res.redirect('/?google=error&reason=internal');
  }
});

router.delete('/disconnect', authMiddleware, async (req: Request, res: Response) => {
  const uid = req.userId!;
  const tokensRaw = getGoogleProviderValue(uid, 'google_tokens');
  if (tokensRaw) {
    try {
      const tokens: GoogleTokens = JSON.parse(tokensRaw);
      if (tokens.access_token) {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${tokens.access_token}`, { method: 'POST' }).catch(() => {});
      }
    } catch { /* noop */ }
  }
  deleteGoogleProviderValue(uid, 'google_tokens');
  res.json({ success: true });
});

// ─── Calendar ─────────────────────────────────────────────────────────────────

router.get('/calendar/events', authMiddleware, async (req: Request, res: Response) => {
  const token = await getValidGoogleAccessToken(req.userId!);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });
  try {
    const events = await fetchCalendarEvents(token, {
      maxResults: Math.min(Number(req.query.maxResults) || 10, 50),
      timeMin: typeof req.query.timeMin === 'string' ? req.query.timeMin : undefined,
    });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calendar fetch failed' });
  }
});

router.post('/calendar/events', authMiddleware, async (req: Request, res: Response) => {
  const token = await getValidGoogleAccessToken(req.userId!);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });
  const { summary, description, start, end, attendees } = req.body;
  if (!summary || !start || !end) return res.status(400).json({ error: 'summary, start, and end are required' });
  try {
    const event = await createCalendarEvent(token, { summary, description, start, end, attendees });
    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calendar create failed' });
  }
});

// ─── Gmail ────────────────────────────────────────────────────────────────────

router.get('/gmail/messages', authMiddleware, async (req: Request, res: Response) => {
  const token = await getValidGoogleAccessToken(req.userId!);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });
  try {
    const messages = await fetchGmailMessages(token, {
      maxResults: Math.min(Number(req.query.maxResults) || 10, 50),
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
    });
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gmail fetch failed' });
  }
});

router.post('/gmail/send', authMiddleware, async (req: Request, res: Response) => {
  const token = await getValidGoogleAccessToken(req.userId!);
  if (!token) return res.status(401).json({ error: 'Google account not connected.' });
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required' });
  const toStr = String(to).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toStr)) return res.status(400).json({ error: 'Invalid recipient email address' });
  try {
    const result = await sendGmail(token, toStr, subject, body);
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Gmail send failed' });
  }
});

export default router;

/**
 * Telegram status and settings tests — run against a live Botty server.
 * npm run test:telegram-status
 *
 * These tests verify the Telegram status endpoint structure and that Telegram
 * settings can be persisted and retrieved. No real Telegram token is required.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

// ---------------------------------------------------------------------------
// Telegram status endpoint shape
// ---------------------------------------------------------------------------
test('GET /api/settings/telegram-status returns structured status object', async () => {
  const { token } = await loginLocalUser('telegram-status-shape-test');
  const headers = buildAuthHeaders(token);

  const { response, body } = await fetchJson('/api/settings/telegram-status', { headers });
  assert.equal(response.status, 200, 'expected telegram-status to succeed');
  assert.ok(typeof body.configured === 'boolean', 'expected configured to be boolean');
  assert.ok(typeof body.enabled === 'boolean', 'expected enabled to be boolean');
  assert.ok(typeof body.running === 'boolean', 'expected running to be boolean');
  // username and error are nullable strings — just check they exist as keys
  assert.ok('username' in body, 'expected username key in response');
  assert.ok('error' in body, 'expected error key in response');
});

test('Telegram is not running when no token is configured', async () => {
  const { token } = await loginLocalUser('telegram-no-token-test');
  const headers = buildAuthHeaders(token);

  const { body } = await fetchJson('/api/settings/telegram-status', { headers });
  // In CI there is no TELEGRAM_BOT_TOKEN, so running should be false
  if (!body.configured) {
    assert.equal(body.running, false, 'expected running=false when Telegram is not configured');
  }
});

// ---------------------------------------------------------------------------
// Telegram provider setting persists
// ---------------------------------------------------------------------------
test('saving Telegram provider setting persists across reads', async () => {
  const { token } = await loginLocalUser('telegram-settings-persist-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Save settings with a specific Telegram provider
  const saveRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      telegramProvider: 'local',
      telegramModel: 'smollm2:135m',
      telegramBotEnabled: false,
    }),
  });
  assert.equal(saveRes.status, 200, 'expected settings save to succeed');

  // Read back
  const { response, body } = await fetchJson('/api/settings', { headers });
  assert.equal(response.status, 200, 'expected settings read to succeed');
  assert.equal(body.telegramProvider, 'local', 'expected saved telegramProvider to persist');
  assert.equal(body.telegramModel, 'smollm2:135m', 'expected saved telegramModel to persist');
  assert.equal(body.telegramBotEnabled, false, 'expected saved telegramBotEnabled to persist');
});

// ---------------------------------------------------------------------------
// Telegram allowed chat IDs setting persists
// ---------------------------------------------------------------------------
test('saving Telegram allowed chat IDs persists', async () => {
  const { token } = await loginLocalUser('telegram-chat-ids-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const saveRes = await fetch(`${baseUrl}/api/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      telegramAllowedChatIds: '123456,789012',
      telegramBotEnabled: false,
    }),
  });
  assert.equal(saveRes.status, 200, 'expected settings save to succeed');

  const { body } = await fetchJson('/api/settings', { headers });
  assert.equal(body.telegramAllowedChatIds, '123456,789012',
    'expected saved allowed chat IDs to persist');
});

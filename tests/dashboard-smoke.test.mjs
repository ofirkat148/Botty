import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser } from './helpers/live-botty.mjs';

test('signed-in dashboard endpoints load successfully', async () => {
  const { token } = await loginLocalUser('dashboard-smoke');
  const headers = buildAuthHeaders(token);
  const paths = [
    '/api/auth/me',
    '/api/history',
    '/api/memory/facts',
    '/api/memory/files',
    '/api/memory/urls',
    '/api/settings/functions',
    '/api/keys',
    '/api/usage',
    '/api/settings',
    '/api/settings/user-settings',
    '/api/chat/providers',
  ];

  for (const path of paths) {
    const { response, body } = await fetchJson(path, { headers });
    assert.equal(response.status, 200, `${path} should return 200`);
    assert.notEqual(body?.error, 'Unauthorized', `${path} should not be unauthorized`);
  }

  const authMe = await fetchJson('/api/auth/me', { headers });
  assert.ok(authMe.body.user?.id, 'expected auth/me user payload');

  const providers = await fetchJson('/api/chat/providers', { headers });
  assert.ok(Array.isArray(providers.body.providers), 'expected providers array');

  const settings = await fetchJson('/api/settings', { headers });
  assert.equal(typeof settings.body.useMemory, 'boolean', 'expected settings payload');
});

test('user-settings partial update preserves unrelated fields', async () => {
  const { token } = await loginLocalUser('user-settings-partial');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Set a systemPrompt first
  const setPrompt = await fetchJson('/api/settings/user-settings', {
    method: 'POST',
    headers,
    body: JSON.stringify({ systemPrompt: 'Test system prompt' }),
  });
  assert.equal(setPrompt.response.status, 200, 'expected systemPrompt save to succeed');

  // Update only conversationLabels — systemPrompt must survive
  const setLabels = await fetchJson('/api/settings/user-settings', {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationLabels: { 'conv-abc': 'My label' } }),
  });
  assert.equal(setLabels.response.status, 200, 'expected conversationLabels save to succeed');

  const result = await fetchJson('/api/settings/user-settings', { headers });
  assert.equal(result.response.status, 200, 'expected user-settings GET to succeed');
  assert.equal(result.body.systemPrompt, 'Test system prompt', 'systemPrompt must not be clobbered by label update');
  assert.equal(result.body.conversationLabels?.['conv-abc'], 'My label', 'conversationLabels must be persisted');

  // Update only systemPrompt — label must survive
  await fetchJson('/api/settings/user-settings', {
    method: 'POST',
    headers,
    body: JSON.stringify({ systemPrompt: 'Updated prompt' }),
  });

  const result2 = await fetchJson('/api/settings/user-settings', { headers });
  assert.equal(result2.body.systemPrompt, 'Updated prompt', 'systemPrompt must be updated');
  assert.equal(result2.body.conversationLabels?.['conv-abc'], 'My label', 'conversationLabels must survive systemPrompt update');
});
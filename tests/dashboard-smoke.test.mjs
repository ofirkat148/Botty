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
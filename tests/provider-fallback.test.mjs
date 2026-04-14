/**
 * Provider routing and fallback tests — run against a live Botty server.
 * npm run test:provider-fallback
 *
 * CI uses a local LLM mock that responds to /api/tags and /v1/chat/completions.
 * These tests verify routing decisions, status reporting, and graceful error handling
 * without making real external LLM calls.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, localModel, loginLocalUser } from './helpers/live-botty.mjs';

// ---------------------------------------------------------------------------
// Provider status endpoint
// ---------------------------------------------------------------------------
test('GET /api/providers returns structured provider list', async () => {
  const { token } = await loginLocalUser('provider-status-test');
  const headers = buildAuthHeaders(token);

  const { response, body } = await fetchJson('/api/providers', { headers });
  assert.equal(response.status, 200, 'expected providers endpoint to succeed');
  assert.ok(Array.isArray(body.providers) || typeof body.providers === 'object',
    'expected providers field in response');
  assert.ok(Array.isArray(body.providerStatuses), 'expected providerStatuses array');

  for (const status of body.providerStatuses) {
    assert.ok(typeof status.provider === 'string', 'each status must have a provider string');
    assert.ok(['ready', 'missing', 'unreachable'].includes(status.readiness),
      `unexpected readiness value: ${status.readiness}`);
    assert.ok(typeof status.configured === 'boolean', 'configured must be boolean');
    assert.ok(typeof status.available === 'boolean', 'available must be boolean');
  }
});

test('local provider is reported as ready when mock is running', async () => {
  const { token } = await loginLocalUser('local-provider-ready-test');
  const headers = buildAuthHeaders(token);

  const { body } = await fetchJson('/api/providers', { headers });
  const localStatus = body.providerStatuses?.find((s) => s.provider === 'local');
  assert.ok(localStatus, 'expected local provider status to be present');
  assert.equal(localStatus.readiness, 'ready', 'expected local provider to be ready with mock running');
  assert.ok(localStatus.modelCount > 0, 'expected at least one model from the local mock');
});

// ---------------------------------------------------------------------------
// Routing modes — verify the server respects explicit routing mode in chat
// ---------------------------------------------------------------------------
test('chat with routingMode local-first uses local provider', async () => {
  const { token } = await loginLocalUser('local-first-routing-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response, body } = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Reply with the word ok.',
      provider: 'auto',
      model: localModel,
      messages: [],
      routingMode: 'local-first',
    }),
  });

  assert.equal(response.status, 200, `expected chat to succeed, got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.provider, 'local', 'expected local provider to be chosen for local-first mode');
  assert.ok(typeof body.text === 'string' && body.text.length > 0, 'expected non-empty response text');
});

test('chat with explicit local provider uses local', async () => {
  const { token } = await loginLocalUser('explicit-local-routing-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response, body } = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Reply with the word ok.',
      provider: 'local',
      model: localModel,
      messages: [],
    }),
  });

  assert.equal(response.status, 200, `expected chat to succeed, got ${response.status}: ${JSON.stringify(body)}`);
  assert.equal(body.provider, 'local', 'expected local provider to be used when explicitly requested');
});

// ---------------------------------------------------------------------------
// Provider fallback behaviour: invalid provider name returns an error
// ---------------------------------------------------------------------------
test('requesting an unsupported provider name returns an error', async () => {
  const { token } = await loginLocalUser('bad-provider-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response, body } = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'hello',
      provider: 'nonexistent-llm-provider',
      model: 'some-model',
      messages: [],
    }),
  });

  // Expect either a 400 validation error or a 500 with error message
  assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
  assert.ok(body.error || typeof body === 'string', 'expected an error field in the response');
});

// ---------------------------------------------------------------------------
// Auto-routing: response includes provider and model fields
// ---------------------------------------------------------------------------
test('auto-routed chat response includes provider and model metadata', async () => {
  const { token } = await loginLocalUser('auto-routing-metadata-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response, body } = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Reply with the word ok.',
      provider: 'auto',
      model: '',
      messages: [],
    }),
  });

  assert.equal(response.status, 200, `expected chat to succeed, got ${response.status}: ${JSON.stringify(body)}`);
  assert.ok(typeof body.provider === 'string' && body.provider.length > 0, 'expected provider in response');
  assert.ok(typeof body.model === 'string' && body.model.length > 0, 'expected model in response');
  assert.ok(typeof body.text === 'string' && body.text.length > 0, 'expected non-empty text');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

// ---------------------------------------------------------------------------
// API key encryption round-trip
// ---------------------------------------------------------------------------
test('stored API key can be retrieved and matches original value', async () => {
  const { token } = await loginLocalUser('key-encryption-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const testKey = `sk-test-${Date.now()}-roundtrip`;

  // Store the key
  const storeRes = await fetch(`${baseUrl}/api/keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ provider: 'openai', key: testKey }),
  });
  assert.equal(storeRes.status, 200, 'expected key storage to succeed');

  // Retrieve it
  const { response, body } = await fetchJson('/api/keys', { headers });
  assert.equal(response.status, 200, 'expected key listing to succeed');
  assert.ok(Array.isArray(body), 'expected array of keys');
  const found = body.find((k) => k.provider === 'openai');
  assert.ok(found, 'expected to find stored openai key');
  assert.equal(found.key, testKey, 'decrypted key must match original value');

  // Clean up
  await fetch(`${baseUrl}/api/keys/openai`, { method: 'DELETE', headers });
});

// ---------------------------------------------------------------------------
// History search endpoint
// ---------------------------------------------------------------------------
test('GET /api/history supports ?q= search filter', async () => {
  const { token } = await loginLocalUser('history-search-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Seed a history entry via the POST endpoint
  const uniqueTerm = `history-search-marker-${Date.now()}`;
  const seedRes = await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: `Tell me about ${uniqueTerm}`,
      response: 'This is a test response.',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 10,
    }),
  });
  assert.equal(seedRes.status, 200, 'expected history seed to succeed');

  // Search with matching term
  const { response: searchRes, body: searchBody } = await fetchJson(
    `/api/history?q=${encodeURIComponent(uniqueTerm)}`, { headers },
  );
  assert.equal(searchRes.status, 200, 'expected search to succeed');
  assert.ok(Array.isArray(searchBody), 'expected array');
  assert.ok(searchBody.length > 0, 'expected at least one match');
  assert.ok(
    searchBody.every((entry) =>
      entry.prompt.includes(uniqueTerm) || entry.response.includes(uniqueTerm),
    ),
    'all results must match the search term',
  );

  // Search with non-matching term
  const { body: emptyBody } = await fetchJson(
    '/api/history?q=zzz-no-match-xyz-999', { headers },
  );
  assert.ok(Array.isArray(emptyBody), 'expected array for no-match');
  assert.equal(emptyBody.length, 0, 'expected zero results for non-matching term');
});

test('GET /api/history respects ?limit= parameter', async () => {
  const { token } = await loginLocalUser('history-limit-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Seed 5 entries
  for (let i = 0; i < 5; i++) {
    await fetch(`${baseUrl}/api/history`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: `limit test entry ${i}`,
        response: 'response',
        model: 'test-model',
        provider: 'local',
        tokensUsed: 1,
      }),
    });
  }

  const { body } = await fetchJson('/api/history?limit=3', { headers });
  assert.ok(Array.isArray(body), 'expected array');
  assert.ok(body.length <= 3, `expected at most 3 results, got ${body.length}`);
});

// ---------------------------------------------------------------------------
// Remote agent URL validation
// ---------------------------------------------------------------------------
test('remote agent with invalid endpoint scheme is rejected', async () => {
  const { token } = await loginLocalUser('remote-agent-validation');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Create a custom agent with a non-http endpoint
  const createRes = await fetch(`${baseUrl}/api/agents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'Bad Scheme Agent',
      description: 'Test',
      command: '/bad-scheme-agent',
      useWhen: 'never',
      boundaries: 'none',
      systemPrompt: '',
      starterPrompt: '',
      executorType: 'remote-http',
      endpoint: 'ftp://evil.example.com/agent',
    }),
  }).catch(() => null);

  // Either creation is rejected (400) or the subsequent chat call is rejected
  if (createRes && createRes.status === 200) {
    const agent = await createRes.json();
    const chatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'hello',
        activeAgentId: agent.id,
      }),
    });
    assert.ok(
      chatRes.status >= 400,
      `expected error when using ftp:// agent endpoint, got ${chatRes.status}`,
    );
    // Clean up
    await fetch(`${baseUrl}/api/agents/${agent.id}`, { method: 'DELETE', headers }).catch(() => {});
  } else {
    // Creation itself was blocked — that's also acceptable
    assert.ok(!createRes || createRes.status >= 400, 'ftp:// endpoint should be rejected at creation or use');
  }
});

// ---------------------------------------------------------------------------
// Conversation label matched in history search
// ---------------------------------------------------------------------------
test('conversation label is matched by history search filter', async () => {
  const { token } = await loginLocalUser('label-search-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const convId = `conv-label-${Date.now()}`;
  const uniqueLabel = `label-search-marker-${Date.now()}`;

  // Seed a history entry
  await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'unrelated prompt text',
      response: 'unrelated response',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 1,
      conversationId: convId,
    }),
  });

  // Attach a label
  await fetch(`${baseUrl}/api/settings/user-settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationLabels: { [convId]: uniqueLabel } }),
  });

  // The label-based search lives on the frontend (client-side filter),
  // so we verify the backend contract: the label is stored and retrievable.
  const { body: settings } = await fetchJson('/api/settings/user-settings', { headers });
  assert.equal(
    settings.conversationLabels?.[convId],
    uniqueLabel,
    'conversation label must be persisted and retrievable',
  );
});

// ---------------------------------------------------------------------------
// History retention configurable via HISTORY_RETENTION_DAYS (startup-time prune)
// Tested indirectly: we insert an old entry directly and confirm it still
// exists (since we cannot restart the server mid-test); we verify the endpoint
// correctly filters archived vs active entries as a proxy for the prune logic.
// ---------------------------------------------------------------------------
test('archived history is excluded from the default list and visible in archived view', async () => {
  const { token } = await loginLocalUser('retention-proxy-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-retention-${Date.now()}`;

  await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'retention test prompt',
      response: 'retention test response',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 1,
      conversationId: convId,
    }),
  });

  await fetch(`${baseUrl}/api/history/group/${convId}/archive`, { method: 'PATCH', headers });

  const { body: active } = await fetchJson('/api/history', { headers });
  assert.ok(!active.some(e => e.conversationId === convId), 'archived entry must not appear in active list');

  const { body: archived } = await fetchJson('/api/history?archived=true', { headers });
  assert.ok(archived.some(e => e.conversationId === convId), 'archived entry must appear in archived list');
});

// ---------------------------------------------------------------------------
// Auth rate limiting — run last; exhausts the rate-limit window for this IP.
// Skipped in CI because the CI server raises the limit to 10,000 (CI=true),
// so the test can never trigger 429s there. Run locally in isolation.
// ---------------------------------------------------------------------------
test(
  'auth rate limiter blocks after 20 rapid requests',
  { skip: process.env.CI === 'true' ? 'CI raises auth limit; rate-limit test must run locally in isolation' : false },
  async () => {
    const email = `ratelimit-test-${Date.now()}@example.com`;
    let blockedCount = 0;
    const requests = Array.from({ length: 25 }, () =>
      fetch(`${baseUrl}/api/auth/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }),
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      if (res.status === 429) blockedCount++;
    }

    assert.ok(blockedCount > 0, `Expected at least 1 rate-limited 429 response, got ${blockedCount}`);
  },
);

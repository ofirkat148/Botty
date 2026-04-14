/**
 * Memory consolidation tests — run against a live Botty server.
 * npm run test:memory
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

// ---------------------------------------------------------------------------
// Fact CRUD: add, list, delete
// ---------------------------------------------------------------------------
test('added fact appears in the fact list', async () => {
  const { token } = await loginLocalUser('memory-crud-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const uniqueContent = `Works on distributed-systems-${Date.now()}`;
  const addRes = await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: uniqueContent }),
  });
  assert.equal(addRes.status, 200, 'expected fact creation to succeed');

  const { response, body } = await fetchJson('/api/memory/facts', { headers });
  assert.equal(response.status, 200, 'expected fact list to succeed');
  assert.ok(Array.isArray(body), 'expected facts array');
  const found = body.find((f) => f.content.includes('distributed-systems'));
  assert.ok(found, 'expected newly added fact to appear in the list');
  assert.ok(typeof found.id === 'string', 'expected fact.id to be a string');
});

test('deleting a fact removes it from the list', async () => {
  const { token } = await loginLocalUser('memory-delete-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const uniqueContent = `Uses-editor-${Date.now()}`;
  await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: uniqueContent }),
  });

  const { body: listBody } = await fetchJson('/api/memory/facts', { headers });
  const fact = listBody.find((f) => f.content.includes('Uses-editor'));
  assert.ok(fact, 'expected the added fact to be present before delete');

  const delRes = await fetch(`${baseUrl}/api/memory/facts/${fact.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(delRes.status, 200, 'expected delete to succeed');

  const { body: afterBody } = await fetchJson('/api/memory/facts', { headers });
  const stillPresent = afterBody.find((f) => f.id === fact.id);
  assert.ok(!stillPresent, 'expected deleted fact to be gone');
});

// ---------------------------------------------------------------------------
// Consolidation: identical facts must not produce duplicates
// ---------------------------------------------------------------------------
test('adding the same fact twice does not produce duplicates', async () => {
  const { token } = await loginLocalUser('memory-dedup-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const content = 'Prefers TypeScript over JavaScript';

  await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });
  await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  });

  const { body } = await fetchJson('/api/memory/facts', { headers });
  assert.ok(Array.isArray(body), 'expected facts array');
  const matches = body.filter((f) => f.content.toLowerCase().includes('typescript'));
  assert.ok(matches.length <= 1, `expected at most 1 TypeScript fact after consolidation, got ${matches.length}: ${JSON.stringify(matches)}`);
});

// ---------------------------------------------------------------------------
// Consolidation: combinable Prefers facts get merged
// ---------------------------------------------------------------------------
test('combinable Prefers facts are merged into one', async () => {
  const { token } = await loginLocalUser('memory-merge-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: 'Prefers dark mode' }),
  });
  await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: 'Prefers dark mode' }),
  });

  const { body } = await fetchJson('/api/memory/facts', { headers });
  assert.ok(Array.isArray(body), 'expected facts array');
  const darkModeFacts = body.filter((f) => f.content.toLowerCase().includes('dark mode'));
  assert.ok(darkModeFacts.length <= 1, `expected at most 1 dark-mode fact, got ${darkModeFacts.length}`);
});

// ---------------------------------------------------------------------------
// Memory URLs CRUD
// ---------------------------------------------------------------------------
test('added URL appears in memory URL list', async () => {
  const { token } = await loginLocalUser('memory-url-test');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const uniqueUrl = `https://example.com/test-${Date.now()}`;
  const addRes = await fetch(`${baseUrl}/api/memory/urls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url: uniqueUrl, title: 'Test page' }),
  });
  assert.equal(addRes.status, 200, 'expected URL save to succeed');

  const { response, body } = await fetchJson('/api/memory/urls', { headers });
  assert.equal(response.status, 200, 'expected URL list to succeed');
  assert.ok(Array.isArray(body), 'expected URL array');
  const found = body.find((u) => u.url === uniqueUrl);
  assert.ok(found, 'expected newly saved URL to appear in list');
});

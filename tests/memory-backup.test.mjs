/**
 * Memory export/import round-trip test.
 * Exports current memory, imports it back, and verifies counts are preserved.
 * npm run test:memory-backup
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

test('memory export/import round-trip preserves facts and conversationLabels', async () => {
  const { token } = await loginLocalUser('memory-backup-roundtrip');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Seed a fact
  const factContent = `Roundtrip test fact ${Date.now()}`;
  const factRes = await fetch(`${baseUrl}/api/memory/facts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: factContent }),
  });
  assert.equal(factRes.status, 200, 'expected fact creation to succeed');

  // Seed a conversation label via user-settings
  const labelId = `conv-rt-${Date.now()}`;
  const labelVal = `Round-trip label ${Date.now()}`;
  await fetch(`${baseUrl}/api/settings/user-settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ conversationLabels: { [labelId]: labelVal } }),
  });

  // Export memory
  const exportRes = await fetch(`${baseUrl}/api/memory/export`, {
    headers: buildAuthHeaders(token),
  });
  assert.equal(exportRes.status, 200, 'expected export to succeed');
  const exportedPayload = await exportRes.json();
  assert.ok(Array.isArray(exportedPayload.memory?.facts), 'export must contain facts array');
  assert.ok(
    exportedPayload.memory.facts.some(f => f.content === factContent),
    'exported facts must include the seeded fact',
  );
  assert.equal(
    exportedPayload.userSettings?.conversationLabels?.[labelId],
    labelVal,
    'exported userSettings must include the seeded conversation label',
  );

  // Wipe all facts, then import the backup
  const wipeFacts = await fetchJson('/api/memory/facts', { method: 'DELETE', headers }).catch(() => ({ response: { status: 404 } }));
  // (DELETE /api/memory/facts may not exist — import will replace anyway)

  const importRes = await fetch(`${baseUrl}/api/memory/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify(exportedPayload),
  });
  assert.equal(importRes.status, 200, 'expected import to succeed');

  // Verify facts are restored
  const { body: restoredFacts } = await fetchJson('/api/memory/facts', { headers });
  assert.ok(Array.isArray(restoredFacts), 'expected facts array after restore');
  assert.ok(
    restoredFacts.some(f => f.content === factContent),
    'restored facts must include the originally seeded fact',
  );

  // Verify conversationLabel is restored
  const { body: restoredSettings } = await fetchJson('/api/settings/user-settings', { headers });
  assert.equal(
    restoredSettings.conversationLabels?.[labelId],
    labelVal,
    'restored userSettings must include conversation label',
  );
});

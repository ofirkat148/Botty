/**
 * Tests for conversation archive / unarchive endpoints.
 * npm run test:history-archive
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

async function seedEntry(headers, convId) {
  const res = await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: `Archive test prompt ${convId}`,
      response: 'Archive test response.',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 1,
      conversationId: convId,
    }),
  });
  assert.equal(res.status, 200, 'expected history seed to succeed');
}

test('archiving a conversation hides it from the default history list', async () => {
  const { token } = await loginLocalUser('archive-hide');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-archive-hide-${Date.now()}`;

  await seedEntry(headers, convId);

  // Confirm visible before archive
  const { body: before } = await fetchJson('/api/history', { headers });
  assert.ok(before.some(e => e.conversationId === convId), 'conversation should appear in default list before archive');

  // Archive it
  const archiveRes = await fetchJson(`/api/history/group/${convId}/archive`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(archiveRes.response.status, 200, 'archive should succeed');

  // Should no longer appear in default list
  const { body: after } = await fetchJson('/api/history', { headers });
  assert.ok(!after.some(e => e.conversationId === convId), 'archived conversation must not appear in default list');

  // Should appear in archived list
  const { body: archived } = await fetchJson('/api/history?archived=true', { headers });
  assert.ok(archived.some(e => e.conversationId === convId), 'archived conversation must appear in archived list');
});

test('unarchiving a conversation restores it to the default list', async () => {
  const { token } = await loginLocalUser('archive-restore');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-unarchive-${Date.now()}`;

  await seedEntry(headers, convId);

  // Archive then unarchive
  await fetchJson(`/api/history/group/${convId}/archive`, { method: 'PATCH', headers });
  const unarchiveRes = await fetchJson(`/api/history/group/${convId}/unarchive`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(unarchiveRes.response.status, 200, 'unarchive should succeed');

  // Should be back in default list
  const { body: active } = await fetchJson('/api/history', { headers });
  assert.ok(active.some(e => e.conversationId === convId), 'unarchived conversation must be back in default list');

  // Should not appear in archived list
  const { body: archived } = await fetchJson('/api/history?archived=true', { headers });
  assert.ok(!archived.some(e => e.conversationId === convId), 'unarchived conversation must not appear in archived list');
});

test('deleting an archived conversation removes it entirely', async () => {
  const { token } = await loginLocalUser('archive-delete');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-archive-del-${Date.now()}`;

  await seedEntry(headers, convId);
  await fetchJson(`/api/history/group/${convId}/archive`, { method: 'PATCH', headers });

  const deleteRes = await fetchJson(`/api/history/group/${convId}`, { method: 'DELETE', headers });
  assert.equal(deleteRes.response.status, 200, 'delete should succeed');

  const { body: archived } = await fetchJson('/api/history?archived=true', { headers });
  assert.ok(!archived.some(e => e.conversationId === convId), 'deleted conversation must not appear in archived list');
});

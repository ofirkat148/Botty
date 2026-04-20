/**
 * Tests for the projects (folders) endpoints.
 * npm run test:projects
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

async function seedConversation(headers, convId) {
  const res = await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Project test prompt',
      response: 'Project test response.',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 3,
      conversationId: convId,
    }),
  });
  assert.equal(res.status, 200, 'expected history seed to succeed');
}

test('creating a project returns it in the list', async () => {
  const { token } = await loginLocalUser('projects-create');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response, body } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'My Project', color: 'blue' }),
  });
  assert.equal(response.status, 201, 'project creation should succeed');
  assert.ok(body.id, 'created project should have an id');
  assert.equal(body.name, 'My Project', 'project name should match');

  const { body: list } = await fetchJson('/api/projects', { headers });
  assert.ok(Array.isArray(list), 'project list should be an array');
  assert.ok(list.some(p => p.id === body.id), 'created project should appear in list');
});

test('project names are user-scoped', async () => {
  const { token: tokenA } = await loginLocalUser('projects-scope-a');
  const { token: tokenB } = await loginLocalUser('projects-scope-b');
  const headersA = buildAuthHeaders(tokenA, { 'Content-Type': 'application/json' });
  const headersB = buildAuthHeaders(tokenB, { 'Content-Type': 'application/json' });

  const { body: proj } = await fetchJson('/api/projects', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ name: 'Scoped Project' }),
  });

  const { body: listB } = await fetchJson('/api/projects', { headers: headersB });
  assert.ok(!listB.some(p => p.id === proj.id), 'user B must not see user A\'s project');
});

test('updating a project changes its name', async () => {
  const { token } = await loginLocalUser('projects-update');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { body: created } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Old Name' }),
  });

  const { response: updateRes, body: updated } = await fetchJson(`/api/projects/${created.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ name: 'New Name' }),
  });
  assert.equal(updateRes.status, 200, 'update should succeed');

  const { body: list } = await fetchJson('/api/projects', { headers });
  const found = list.find(p => p.id === created.id);
  assert.ok(found, 'updated project should still appear in list');
  assert.equal(found.name, 'New Name', 'project name should be updated');
});

test('deleting a project removes it from the list', async () => {
  const { token } = await loginLocalUser('projects-delete');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { body: proj } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'To Delete' }),
  });

  const { response: delRes } = await fetchJson(`/api/projects/${proj.id}`, { method: 'DELETE', headers });
  assert.equal(delRes.status, 200, 'delete should succeed');

  const { body: list } = await fetchJson('/api/projects', { headers });
  assert.ok(!list.some(p => p.id === proj.id), 'deleted project should not appear in list');
});

test('assigning a conversation to a project filters history correctly', async () => {
  const { token } = await loginLocalUser('projects-assign');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-proj-assign-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: proj } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Assign Project' }),
  });

  // Assign conversation to project
  const { response: assignRes } = await fetchJson(`/api/projects/assign/${convId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ projectId: proj.id }),
  });
  assert.equal(assignRes.status, 200, 'assign should succeed');

  // Filter history by project — conversation should appear
  const { body: filtered } = await fetchJson(`/api/history?projectId=${proj.id}`, { headers });
  assert.ok(filtered.some(e => e.conversationId === convId), 'conversation should appear when filtered by project');

  // Without project filter — conversation still appears in main list
  const { body: all } = await fetchJson('/api/history', { headers });
  assert.ok(all.some(e => e.conversationId === convId), 'conversation should still appear in full list');
});

test('assigning null removes conversation from project', async () => {
  const { token } = await loginLocalUser('projects-unassign');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-proj-unassign-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: proj } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Temp Project' }),
  });

  await fetchJson(`/api/projects/assign/${convId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ projectId: proj.id }),
  });

  // Unassign
  const { response: unassignRes } = await fetchJson(`/api/projects/assign/${convId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ projectId: null }),
  });
  assert.equal(unassignRes.status, 200, 'unassign should succeed');

  // Conversation should no longer appear in project filter
  const { body: filtered } = await fetchJson(`/api/history?projectId=${proj.id}`, { headers });
  assert.ok(!filtered.some(e => e.conversationId === convId), 'conversation should not appear after unassign');
});

test('creating a project requires name', async () => {
  const { token } = await loginLocalUser('projects-validation');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const { response } = await fetchJson('/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({ color: 'red' }),
  });
  assert.equal(response.status, 400, 'missing name should return 400');
});

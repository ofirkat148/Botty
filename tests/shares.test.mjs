/**
 * Tests for the conversation shares (read-only link) endpoints.
 * npm run test:shares
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser, baseUrl } from './helpers/live-botty.mjs';

async function seedConversation(headers, convId) {
  const res = await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'What is 2 + 2?',
      response: 'It is 4.',
      model: 'test-model',
      provider: 'local',
      tokensUsed: 5,
      conversationId: convId,
    }),
  });
  assert.equal(res.status, 200, 'expected history seed to succeed');
}

test('creating a share returns a token', async () => {
  const { token } = await loginLocalUser('shares-create');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-create-${Date.now()}`;
  await seedConversation(headers, convId);

  const { response, body } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });
  assert.equal(response.status, 200, 'share creation should succeed');
  assert.ok(typeof body.token === 'string' && body.token.length >= 20, 'share token should be a url-safe string');
});

test('creating the same share twice returns the same token', async () => {
  const { token } = await loginLocalUser('shares-idempotent');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-idem-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: first } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });
  const { body: second } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });
  assert.equal(first.token, second.token, 'repeated share creation should return the same token');
});

test('public share view returns conversation messages without auth', async () => {
  const { token } = await loginLocalUser('shares-public-view');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-view-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: share } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });

  // Fetch the share WITHOUT auth headers
  const { response, body } = await fetchJson(`/api/shares/view/${share.token}`);
  assert.equal(response.status, 200, 'public share view should succeed without auth');
  assert.ok(Array.isArray(body.messages), 'response should have messages array');
  assert.ok(body.messages.length >= 1, 'messages should contain at least one entry');
  assert.equal(body.messages[0].prompt, 'What is 2 + 2?', 'message prompt should match');
  assert.equal(body.messages[0].response, 'It is 4.', 'message response should match');
  // Must not leak uid or other internal fields
  assert.ok(!('uid' in body), 'response must not expose uid');
});

test('public share view response does not include uid', async () => {
  const { token } = await loginLocalUser('shares-no-uid');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-no-uid-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: share } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });
  const { body } = await fetchJson(`/api/shares/view/${share.token}`);

  assert.ok(!('uid' in body), 'share view must not expose uid');
  for (const msg of body.messages) {
    assert.ok(!('uid' in msg), 'individual messages must not expose uid');
  }
});

test('check endpoint reports shared=true after sharing', async () => {
  const { token } = await loginLocalUser('shares-check');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-check-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: before } = await fetchJson(`/api/shares/my/${convId}`, { headers });
  assert.equal(before.shared, false, 'should not be shared before creating share');

  await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });

  const { body: after } = await fetchJson(`/api/shares/my/${convId}`, { headers });
  assert.equal(after.shared, true, 'should be shared after creating share');
  assert.ok(typeof after.token === 'string', 'check endpoint should return the token');
});

test('revoking a share makes the view return 404', async () => {
  const { token } = await loginLocalUser('shares-revoke');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });
  const convId = `conv-share-revoke-${Date.now()}`;
  await seedConversation(headers, convId);

  const { body: share } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers, body: JSON.stringify({}) });

  // Revoke
  const { response: revokeRes } = await fetchJson(`/api/shares/${convId}`, { method: 'DELETE', headers });
  assert.equal(revokeRes.status, 200, 'revoke should succeed');

  // View should now 404
  const { response: viewRes } = await fetchJson(`/api/shares/view/${share.token}`);
  assert.equal(viewRes.status, 404, 'revoked share should return 404');
});

test('sharing a conversation that does not belong to the user returns 404', async () => {
  const { token: tokenA } = await loginLocalUser('shares-owner');
  const { token: tokenB } = await loginLocalUser('shares-other');
  const headersA = buildAuthHeaders(tokenA, { 'Content-Type': 'application/json' });
  const headersB = buildAuthHeaders(tokenB, { 'Content-Type': 'application/json' });
  const convId = `conv-share-other-${Date.now()}`;

  await seedConversation(headersA, convId);

  // User B tries to share User A's conversation
  const { response } = await fetchJson(`/api/shares/${convId}`, { method: 'POST', headers: headersB, body: JSON.stringify({}) });
  assert.equal(response.status, 404, 'sharing another user\'s conversation should return 404');
});

test('invalid share token format returns 400', async () => {
  // Token too short (< 20 chars) — hits the regex guard in the route
  const { response } = await fetchJson('/api/shares/view/tooshort');
  assert.equal(response.status, 400, 'invalid token should return 400');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, localModel, loginLocalUser } from './helpers/live-botty.mjs';

test('chat route completes without immediate cancellation', async () => {
  const { token } = await loginLocalUser('chat-route-regression');
  const { response, body } = await fetchJson('/api/chat', {
    method: 'POST',
    headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      prompt: 'Reply with exactly the word ok.',
      provider: 'local',
      model: localModel,
      messages: [],
    }),
  });

  assert.equal(response.status, 200, `expected chat success, got ${response.status}`);
  assert.equal(body.error, undefined, 'expected no route error payload');
  assert.notEqual(body.error, 'Request cancelled', 'chat route should not cancel healthy requests');
  assert.equal(typeof body.text, 'string', 'expected text response');
  assert.ok(body.text.length > 0, 'expected non-empty model output');
  assert.equal(typeof body.conversationId, 'string', 'expected conversation id');
  assert.equal(body.provider, 'local', 'expected local provider to be used');
});
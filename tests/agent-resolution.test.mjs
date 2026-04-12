import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, localModel, loginLocalUser } from './helpers/live-botty.mjs';

test('chat route resolves active agents server-side by id', async () => {
  const { token } = await loginLocalUser('agent-resolution');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const createAgent = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Local Specialist',
      description: 'Uses the local model and isolated agent memory.',
      command: 'local-specialist',
      provider: 'local',
      model: localModel,
      memoryMode: 'isolated',
      systemPrompt: 'You are a local specialist agent.',
      starterPrompt: 'Handle this with the local specialist.',
    }),
  });

  assert.equal(createAgent.response.status, 200, 'expected custom agent creation to succeed');
  const agentId = createAgent.body.item?.id;
  assert.equal(typeof agentId, 'string', 'expected created agent id');

  const chatWithAgent = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Reply briefly.',
      provider: 'auto',
      activeAgentId: agentId,
      messages: [],
    }),
  });

  assert.equal(chatWithAgent.response.status, 200, 'expected agent chat to succeed');
  assert.equal(chatWithAgent.body.provider, 'local', 'expected server-side agent resolution to enforce the stored provider');
  assert.equal(typeof chatWithAgent.body.conversationId, 'string', 'expected conversation id from agent chat');

  const missingAgent = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'This should fail.',
      provider: 'auto',
      activeAgentId: 'agent-does-not-exist',
      messages: [],
    }),
  });

  assert.equal(missingAgent.response.status, 400, 'expected missing agent ids to be rejected');
  assert.equal(missingAgent.body.error, 'Active agent not found', 'expected missing agent error message');
});

test('remote http agents can be created and executed end to end', async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += chunk;
    }

    const payload = JSON.parse(rawBody || '{}');
    requests.push(payload);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      responseText: `Remote agent handled: ${payload.prompt}`,
      model: 'remote-mock-v1',
      tokensUsed: 42,
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'expected remote agent test server address');
  const endpoint = `http://127.0.0.1:${address.port}/agent`;

  try {
    const { token } = await loginLocalUser('remote-agent');
    const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

    const createAgent = await fetchJson('/api/settings/functions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'agent',
        title: 'Remote Research Agent',
        description: 'Delegates execution to a remote HTTP endpoint.',
        command: 'remote-research',
        executorType: 'remote-http',
        endpoint,
        memoryMode: 'shared',
        systemPrompt: 'You are a remote research agent.',
        starterPrompt: 'Use the remote research workflow.',
      }),
    });

    assert.equal(createAgent.response.status, 200, 'expected remote custom agent creation to succeed');
    assert.equal(createAgent.body.item?.executorType, 'remote-http', 'expected persisted executor type');
    assert.equal(createAgent.body.item?.endpoint, endpoint, 'expected persisted remote endpoint');

    const chatWithAgent = await fetchJson('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: 'Inspect this flow.',
        provider: 'auto',
        activeAgentId: createAgent.body.item.id,
        messages: [{ role: 'user', content: 'Previous message' }],
      }),
    });

    assert.equal(chatWithAgent.response.status, 200, 'expected remote agent chat to succeed');
    assert.equal(chatWithAgent.body.provider, 'remote-http', 'expected remote executor provider marker');
    assert.equal(chatWithAgent.body.model, 'remote-mock-v1', 'expected remote executor model marker');
    assert.match(chatWithAgent.body.text, /Remote agent handled: Inspect this flow\./, 'expected remote response text');

    assert.equal(requests.length, 1, 'expected one remote agent request');
    assert.equal(requests[0].agent?.command, 'remote-research', 'expected agent metadata in remote request');
    assert.equal(requests[0].systemPrompt, 'You are a remote research agent.', 'expected remote request system prompt');
    assert.equal(requests[0].messages?.[0]?.content, 'Previous message', 'expected remote request conversation history');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
});
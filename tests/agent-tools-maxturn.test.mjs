/**
 * Tests for agent tool catalog injection and maxTurns completion signal.
 * npm run test:agent-tools-maxturn
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, localModel, loginLocalUser } from './helpers/live-botty.mjs';

// ---------------------------------------------------------------------------
// Tool catalog injected into system prompt
// ---------------------------------------------------------------------------
test('agent with tools sends tool catalog to the LLM via system prompt', async () => {
  const { token } = await loginLocalUser('agent-tools-catalog');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const tools = [
    {
      name: 'search_web',
      description: 'Search the internet for information.',
      parametersSchema: JSON.stringify({ query: { type: 'string' } }),
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file.',
    },
  ];

  const createRes = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Tool Catalog Agent',
      description: 'Tests tool catalog in system prompt.',
      command: 'tool-catalog-agent',
      provider: 'local',
      model: localModel,
      systemPrompt: 'You are a tool catalog test agent.',
      starterPrompt: 'Use your tools.',
      tools,
    }),
  });

  assert.equal(createRes.response.status, 200, 'expected agent creation to succeed');
  const agentId = createRes.body.item?.id;
  assert.equal(typeof agentId, 'string', 'expected agent id');

  // Verify tools are persisted and returned in the agent definition
  const listRes = await fetchJson('/api/settings/functions', { headers });
  assert.equal(listRes.response.status, 200, 'expected functions list to succeed');
  const stored = listRes.body.agents?.find((item) => item.id === agentId);
  assert.ok(stored, 'expected agent to appear in functions list');
  assert.equal(Array.isArray(stored.tools), true, 'expected tools to be an array');
  assert.equal(stored.tools.length, 2, 'expected 2 tools to be stored');
  assert.equal(stored.tools[0].name, 'search_web', 'expected first tool name');
  assert.equal(stored.tools[1].name, 'read_file', 'expected second tool name');

  // Chat with the agent — verify the response succeeds (tool catalog is in the prompt server-side)
  const chatRes = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'What tools do you have?',
      provider: 'auto',
      activeAgentId: agentId,
      messages: [],
    }),
  });

  assert.equal(chatRes.response.status, 200, 'expected chat with tool agent to succeed');
  assert.equal(typeof chatRes.body.text, 'string', 'expected response text');
  assert.ok(chatRes.body.text.length > 0, 'expected non-empty response text');
});

// ---------------------------------------------------------------------------
// maxTurns: completion signal fires when limit reached
// ---------------------------------------------------------------------------
test('agent with maxTurns emits completion signal when turn limit is reached', async () => {
  const { token } = await loginLocalUser('agent-maxturn');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Create agent with maxTurns = 1
  const createRes = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'agent',
      title: 'One Turn Agent',
      description: 'Completes after exactly one turn.',
      command: 'one-turn-agent',
      provider: 'local',
      model: localModel,
      systemPrompt: 'You are a one-turn agent.',
      starterPrompt: 'Handle this in one turn.',
      maxTurns: 1,
    }),
  });

  assert.equal(createRes.response.status, 200, 'expected agent creation to succeed');
  const agentId = createRes.body.item?.id;
  assert.equal(typeof agentId, 'string', 'expected agent id');
  assert.equal(createRes.body.item?.maxTurns, 1, 'expected maxTurns=1 to be persisted');

  // First turn — should succeed normally
  const firstChat = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'First message.',
      provider: 'auto',
      activeAgentId: agentId,
      messages: [],
    }),
  });

  assert.equal(firstChat.response.status, 200, 'expected first chat to succeed');
  assert.equal(typeof firstChat.body.conversationId, 'string', 'expected conversationId from first chat');
  assert.notEqual(firstChat.body.provider, 'system', 'expected first turn to not be a completion signal');
  const conversationId = firstChat.body.conversationId;

  // Second turn in same conversation — should hit the maxTurns limit and return completion signal
  const secondChat = await fetchJson('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'Second message.',
      provider: 'auto',
      activeAgentId: agentId,
      conversationId,
      messages: [],
    }),
  });

  assert.equal(secondChat.response.status, 200, 'expected completion signal response to be 200');
  assert.equal(secondChat.body.provider, 'system', 'expected provider=system for completion signal');
  assert.equal(secondChat.body.model, 'completion-signal', 'expected model=completion-signal');
  assert.ok(
    secondChat.body.text.includes('reached its') && secondChat.body.text.includes('1-turn limit'),
    'expected completion signal message to mention the turn limit',
  );
});

// ---------------------------------------------------------------------------
// maxTurns update via PUT persists correctly
// ---------------------------------------------------------------------------
test('updating agent maxTurns persists correctly', async () => {
  const { token } = await loginLocalUser('agent-maxturn-update');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const createRes = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Updatable Turns Agent',
      description: 'Tests maxTurns update.',
      command: 'updatable-turns-agent',
      provider: 'local',
      model: localModel,
      systemPrompt: 'You are an updatable turns agent.',
      starterPrompt: 'Handle this.',
      maxTurns: 5,
    }),
  });

  assert.equal(createRes.response.status, 200, 'expected agent creation to succeed');
  const agentId = createRes.body.item?.id;
  assert.equal(createRes.body.item?.maxTurns, 5, 'expected initial maxTurns=5');

  // Update maxTurns to 10
  const updateRes = await fetchJson(`/api/settings/functions/agents/${agentId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      title: 'Updatable Turns Agent',
      description: 'Tests maxTurns update.',
      command: 'updatable-turns-agent',
      provider: 'local',
      model: localModel,
      systemPrompt: 'You are an updatable turns agent.',
      starterPrompt: 'Handle this.',
      maxTurns: 10,
    }),
  });

  assert.equal(updateRes.response.status, 200, 'expected agent update to succeed');
  assert.equal(updateRes.body.item?.maxTurns, 10, 'expected updated maxTurns=10');
});

// ---------------------------------------------------------------------------
// GET /api/memory/facts?botId= scopes to agent facts
// ---------------------------------------------------------------------------
test('GET /api/memory/facts?botId= returns only agent-scoped facts', async () => {
  const { token } = await loginLocalUser('agent-memory-scope');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  // Shared facts should be empty for this fresh user
  const shared = await fetchJson('/api/memory/facts', { headers });
  assert.equal(shared.response.status, 200, 'expected shared facts to succeed');
  assert.equal(Array.isArray(shared.body), true, 'expected array');

  // Agent-scoped facts with a fake agent id should return empty array
  const agentId = 'test-isolated-agent-999';
  const scoped = await fetchJson(`/api/memory/facts?botId=${encodeURIComponent(agentId)}`, { headers });
  assert.equal(scoped.response.status, 200, 'expected scoped facts to succeed');
  assert.equal(Array.isArray(scoped.body), true, 'expected array for agent-scoped facts');
  assert.equal(scoped.body.length, 0, 'expected no facts for unknown agent');

  // agent-counts endpoint returns totals
  const counts = await fetchJson('/api/memory/facts/agent-counts', { headers });
  assert.equal(counts.response.status, 200, 'expected agent-counts to succeed');
  assert.equal(typeof counts.body.total, 'number', 'expected total to be a number');
  assert.ok(typeof counts.body.counts === 'object', 'expected counts to be an object');
});

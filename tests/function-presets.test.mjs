import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthHeaders, fetchJson, loginLocalUser } from './helpers/live-botty.mjs';

test('custom skills and agents enforce slash command best practices', async () => {
  const { token } = await loginLocalUser('function-preset-regression');
  const headers = buildAuthHeaders(token, { 'Content-Type': 'application/json' });

  const reservedSkill = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'skill',
      title: 'Reserved Skill',
      description: 'Should fail because the command is reserved.',
      command: 'development',
      systemPrompt: 'Reserved skill system prompt.',
      starterPrompt: 'Reserved skill starter prompt.',
    }),
  });

  assert.equal(reservedSkill.response.status, 400, 'reserved built-in skill command should be rejected');

  const createdAgent = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Security Reviewer',
      description: 'Reviews app changes for security issues.',
      command: 'Security Reviewer!!',
      systemPrompt: 'Review the system for security problems.',
      starterPrompt: 'Review this Botty change for security risk.',
      memoryMode: 'isolated',
    }),
  });

  assert.equal(createdAgent.response.status, 200, 'custom agent should be created successfully');
  assert.equal(createdAgent.body.item.command, 'security-reviewer', 'agent command should be normalized');

  const collidingSkill = await fetchJson('/api/settings/functions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'skill',
      title: 'Security Skill',
      description: 'Should fail because the command is already taken by the custom agent.',
      command: 'security-reviewer',
      systemPrompt: 'Skill prompt.',
      starterPrompt: 'Skill starter prompt.',
    }),
  });

  assert.equal(collidingSkill.response.status, 400, 'skills should not be allowed to collide with agent slash commands');
});
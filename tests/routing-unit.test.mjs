/**
 * Routing unit tests — pure function tests, no live server required.
 * Run with: node --test --import tsx/esm tests/routing-unit.test.mjs
 *
 * Or add to the npm script and run with tsx registered.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

// Import directly from source — tsx/esm loader handles TypeScript.
import {
  classifyPrompt,
  normalizeRoutingMode,
  isRoutingModeValue,
  getSuggestedModel,
  getRouteCandidatesForMode,
} from '../server/utils/llm.ts';

// ---------------------------------------------------------------------------
// classifyPrompt
// ---------------------------------------------------------------------------
test('classifyPrompt: short conversational prompt', () => {
  const result = classifyPrompt('hello there');
  assert.equal(result.wordCount, 2);
  assert.equal(result.prefersReasoning, false);
  assert.equal(result.isShortConversational, true);
  assert.equal(result.isLightweight, false);
});

test('classifyPrompt: code-heavy prompt triggers prefersReasoning', () => {
  const result = classifyPrompt('debug this TypeScript code and fix the bug');
  assert.equal(result.prefersReasoning, true);
  assert.equal(result.isShortConversational, false);
});

test('classifyPrompt: analysis prompt triggers prefersReasoning', () => {
  const result = classifyPrompt('analyze and compare these two architectural patterns and explain the tradeoffs');
  assert.equal(result.prefersReasoning, true);
});

test('classifyPrompt: lightweight rewrite prompt', () => {
  const result = classifyPrompt('rewrite this title briefly');
  assert.equal(result.isLightweight, true);
  assert.equal(result.prefersReasoning, false);
});

test('classifyPrompt: very long prompt triggers prefersReasoning via word count', () => {
  const longPrompt = Array(130).fill('word').join(' ');
  const result = classifyPrompt(longPrompt);
  assert.ok(result.wordCount > 120);
  assert.equal(result.prefersReasoning, true);
  assert.equal(result.isShortConversational, false);
});

test('classifyPrompt: empty prompt returns safe defaults', () => {
  const result = classifyPrompt('');
  assert.equal(result.wordCount, 0);
  assert.equal(result.prefersReasoning, false);
  assert.equal(result.isShortConversational, false);
});

// ---------------------------------------------------------------------------
// normalizeRoutingMode
// ---------------------------------------------------------------------------
test('normalizeRoutingMode: valid modes are preserved', () => {
  assert.equal(normalizeRoutingMode('fastest'), 'fastest');
  assert.equal(normalizeRoutingMode('cheapest'), 'cheapest');
  assert.equal(normalizeRoutingMode('best-quality'), 'best-quality');
  assert.equal(normalizeRoutingMode('local-first'), 'local-first');
});

test('normalizeRoutingMode: unknown values fall back to auto', () => {
  assert.equal(normalizeRoutingMode('unknown-mode'), 'auto');
  assert.equal(normalizeRoutingMode(''), 'auto');
  assert.equal(normalizeRoutingMode(undefined), 'auto');
  assert.equal(normalizeRoutingMode(null), 'auto');
});

test('normalizeRoutingMode: case-insensitive and trims whitespace', () => {
  assert.equal(normalizeRoutingMode('  Fastest  '), 'fastest');
  assert.equal(normalizeRoutingMode('LOCAL-FIRST'), 'local-first');
});

// ---------------------------------------------------------------------------
// isRoutingModeValue
// ---------------------------------------------------------------------------
test('isRoutingModeValue: valid values return true', () => {
  assert.equal(isRoutingModeValue('auto'), true);
  assert.equal(isRoutingModeValue('fastest'), true);
  assert.equal(isRoutingModeValue('cheapest'), true);
  assert.equal(isRoutingModeValue('best-quality'), true);
  assert.equal(isRoutingModeValue('local-first'), true);
});

test('isRoutingModeValue: invalid values return false', () => {
  assert.equal(isRoutingModeValue('random'), false);
  assert.equal(isRoutingModeValue(''), false);
  assert.equal(isRoutingModeValue(undefined), false);
});

// ---------------------------------------------------------------------------
// getSuggestedModel
// ---------------------------------------------------------------------------
test('getSuggestedModel: preferFast returns the fast model for each provider', () => {
  assert.equal(getSuggestedModel('anthropic', '', { preferFast: true }), 'claude-3-5-haiku-latest');
  assert.equal(getSuggestedModel('google', '', { preferFast: true }), 'gemini-2.5-flash');
});

test('getSuggestedModel: code prompt picks reasoning model for anthropic', () => {
  const model = getSuggestedModel('anthropic', 'debug this typescript code and fix the bug');
  // Should pick the reasoning model (sonnet) not haiku
  assert.ok(model.includes('sonnet') || model.includes('claude-3-7'), `unexpected model: ${model}`);
});

test('getSuggestedModel: short conversational uses default (not sonnet) for anthropic', () => {
  const model = getSuggestedModel('anthropic', 'hi');
  assert.equal(model, 'claude-3-5-haiku-latest');
});

test('getSuggestedModel: local provider returns defaultLocalModel when provided', () => {
  const model = getSuggestedModel('local', 'anything', { defaultLocalModel: 'llama3.2:3b' });
  assert.equal(model, 'llama3.2:3b');
});

// ---------------------------------------------------------------------------
// getRouteCandidatesForMode
// ---------------------------------------------------------------------------
test('getRouteCandidatesForMode: local-first puts local provider first when available', () => {
  const providers = ['anthropic', 'local', 'openai'];
  const candidates = getRouteCandidatesForMode('local-first', 'hello', providers, { defaultLocalModel: 'llama3.2' });
  assert.equal(candidates[0].provider, 'local', 'local should be first in local-first mode');
});

test('getRouteCandidatesForMode: returns a route per available provider', () => {
  const providers = ['anthropic', 'openai'];
  const candidates = getRouteCandidatesForMode('auto', 'hello', providers);
  assert.equal(candidates.length, 2, 'expected one route per provider');
  const provs = candidates.map(c => c.provider);
  assert.ok(provs.includes('anthropic'), 'expected anthropic in candidates');
  assert.ok(provs.includes('openai'), 'expected openai in candidates');
});

test('getRouteCandidatesForMode: fastest mode picks fast models', () => {
  const providers = ['anthropic', 'google'];
  const candidates = getRouteCandidatesForMode('fastest', 'analyze this deeply', providers);
  const anthropic = candidates.find(c => c.provider === 'anthropic');
  assert.ok(anthropic, 'expected anthropic route');
  // fastest should prefer haiku not sonnet even for analysis-heavy prompts
  assert.equal(anthropic.model, 'claude-3-5-haiku-latest');
});

test('getRouteCandidatesForMode: empty provider list throws no-providers error', () => {
  assert.throws(
    () => getRouteCandidatesForMode('auto', 'hello', []),
    /No configured providers/,
    'expected an error when no providers are available',
  );
});

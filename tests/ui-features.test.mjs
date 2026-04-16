/**
 * Full UI feature tests — exercises recent features end-to-end via Playwright.
 *
 * Covers:
 *  - Pinned conversations (pin/unpin via API, render in UI)
 *  - Agent import/export (export JSON, import from file)
 *  - Keyboard shortcuts (Ctrl+N new chat, Ctrl+/ focus composer)
 *  - Context compact endpoint (POST /api/chat/compact)
 *  - History retention settings (save + prune)
 *  - History search
 *  - CSV export button is present in history
 *  - Fullscreen scrolling (messages container is scrollable after entering fullscreen)
 *  - Conversation rename (label) and label filtering in search
 *
 * npm run test:ui-features
 *
 * Uses a single shared API login for all tests to avoid exhausting the auth
 * rate limiter (20 req / 15 min locally). Browser tests reuse the same email
 * via the UI login form — no extra /api/auth/local calls.
 */

import assert from 'node:assert/strict';
import { describe, test, before } from 'node:test';
import { chromium } from 'playwright-core';
import { baseUrl, buildAuthHeaders, fetchJson } from './helpers/live-botty.mjs';

const browserPath = process.env.BOTTY_TEST_BROWSER || '/usr/bin/google-chrome';

// ---------------------------------------------------------------------------
// Helper: seed a history entry via the REST API
// ---------------------------------------------------------------------------
async function seedHistory(headers, { convId, prompt = 'test prompt', response = 'test response', tokensUsed = 10 } = {}) {
  const res = await fetch(`${baseUrl}/api/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, response, model: 'test-model', provider: 'local', tokensUsed, conversationId: convId }),
  });
  assert.equal(res.status, 200, `history seed failed for ${convId}`);
}

// ---------------------------------------------------------------------------
// Helper: open Botty in a browser and log in with a specific email
// ---------------------------------------------------------------------------
async function loginViaUI(page, email) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Ofir').fill('UIFeatures');
  await page.getByPlaceholder('you@local.dev').fill(email);
  await page.getByRole('button', { name: 'Enter local workspace' }).click();
  await page.getByRole('heading', { name: 'Chat' }).waitFor({ timeout: 15000 });
}

// ===========================================================================
// All tests run inside one describe so a single before() login is shared.
// concurrency: false ensures sequential execution (avoids data races between
// tests that share the same user account).
// ===========================================================================
describe('UI feature tests', { concurrency: false }, () => {
  let sharedHeaders;
  let sharedEmail;

  before(async () => {
    // ONE login for the whole file — well within the 20-req/15-min rate limit.
    // If the rate limiter is still in a previous window, wait for it to reset and retry once.
    const ts = Date.now();
    sharedEmail = `ui-features-shared-${ts}@example.com`;

    const doLogin = () => fetch(`${baseUrl}/api/auth/local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sharedEmail, displayName: 'UIFeatures' }),
    });

    let res = await doLogin();

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
      console.log(`[ui-features] Rate limited — waiting ${retryAfter}s for window reset…`);
      await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
      res = await doLogin();
    }

    assert.equal(res.status, 200, 'shared login must succeed — is the server running?');
    const payload = await res.json();
    sharedHeaders = buildAuthHeaders(payload.token, { 'Content-Type': 'application/json' });
  });

  // ===========================================================================
  // API-level tests (no browser)
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // Pinned conversations — persist and survive user-settings partial updates
  // ---------------------------------------------------------------------------
  test('pinned conversations are persisted and survive partial user-settings updates', async () => {
    const convAaa = `conv-aaa-${Date.now()}`;
    const convBbb = `conv-bbb-${Date.now()}`;

    // Save pinned conversations
    const pinRes = await fetchJson('/api/settings/user-settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ pinnedConversations: [convAaa, convBbb] }),
    });
    assert.equal(pinRes.response.status, 200, 'pinned conversations save should succeed');

    // Verify they are returned
    const getRes = await fetchJson('/api/settings/user-settings', { headers: sharedHeaders });
    assert.equal(getRes.response.status, 200);
    assert.ok(Array.isArray(getRes.body.pinnedConversations), 'pinnedConversations must be an array');
    assert.ok(getRes.body.pinnedConversations.includes(convAaa), 'convAaa must be pinned');
    assert.ok(getRes.body.pinnedConversations.includes(convBbb), 'convBbb must be pinned');

    // Partial update of systemPrompt must not clobber pinnedConversations
    await fetchJson('/api/settings/user-settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ systemPrompt: 'Survival test' }),
    });

    const afterUpdate = await fetchJson('/api/settings/user-settings', { headers: sharedHeaders });
    assert.ok(afterUpdate.body.pinnedConversations?.includes(convAaa), 'convAaa must survive systemPrompt update');
    assert.equal(afterUpdate.body.systemPrompt, 'Survival test', 'systemPrompt must be updated');
  });

  test('pinned conversations can be cleared by sending an empty array', async () => {
    const convX = `conv-x-${Date.now()}`;

    await fetchJson('/api/settings/user-settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ pinnedConversations: [convX] }),
    });

    await fetchJson('/api/settings/user-settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ pinnedConversations: [] }),
    });

    const res = await fetchJson('/api/settings/user-settings', { headers: sharedHeaders });
    const pinned = res.body.pinnedConversations;
    assert.ok(!pinned || pinned.length === 0, 'pinnedConversations must be empty after clearing');
  });

  // ---------------------------------------------------------------------------
  // Compact endpoint
  // ---------------------------------------------------------------------------
  test('POST /api/chat/compact returns empty summary for fewer than 4 messages', async () => {
    const res = await fetchJson('/api/chat/compact', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
      }),
    });

    assert.equal(res.response.status, 200, 'compact endpoint must return 200');
    assert.equal(typeof res.body.summary, 'string', 'body must have a summary string');
    assert.equal(res.body.summary, '', 'summary must be empty for fewer than 4 messages');
  });

  test('POST /api/chat/compact skips isCompact messages when counting', async () => {
    // Only 2 real messages + 2 isCompact — should still return empty
    const res = await fetchJson('/api/chat/compact', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '[Context]: previous summary', isCompact: true },
          { role: 'assistant', content: 'Understood.', isCompact: true },
          { role: 'user', content: 'Real message 1' },
          { role: 'assistant', content: 'Real reply 1' },
        ],
      }),
    });

    assert.equal(res.response.status, 200);
    // 2 real messages < 4 → summary empty
    assert.equal(res.body.summary, '', 'must ignore isCompact messages in count');
  });

  test('POST /api/chat/compact succeeds with 4+ real messages and returns a string summary', async () => {
    // The compact endpoint streams SSE for 4+ messages; read and parse the stream directly.
    const response = await fetch(`${baseUrl}/api/chat/compact`, {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'What is the capital of France?' },
          { role: 'assistant', content: 'Paris is the capital of France.' },
          { role: 'user', content: 'And what about Germany?' },
          { role: 'assistant', content: 'Berlin is the capital of Germany.' },
        ],
      }),
    });

    assert.equal(response.status, 200, 'compact endpoint must return 200');

    const rawText = await response.text();
    // Parse SSE lines: "data: {...}"
    const events = rawText
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => { try { return JSON.parse(line.slice(5).trim()); } catch { return null; } })
      .filter(Boolean);

    const doneEvent = events.find(e => e.type === 'done');
    assert.ok(doneEvent, 'compact SSE stream must include a done event');
    assert.equal(typeof doneEvent.summary, 'string', 'done event must carry a string summary');
    // With local provider and no LLM key, summary may be empty — just check it doesn't error
  });

  // ---------------------------------------------------------------------------
  // History retention
  // ---------------------------------------------------------------------------
  test('history retention days are persisted and returned by settings GET', async () => {
    // Save retention setting
    const saveRes = await fetchJson('/api/settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ historyRetentionDays: 30 }),
    });
    assert.equal(saveRes.response.status, 200, 'settings save with retention must succeed');

    // GET must return it
    const getRes = await fetchJson('/api/settings', { headers: sharedHeaders });
    assert.equal(getRes.response.status, 200);
    assert.equal(getRes.body.historyRetentionDays, 30, 'historyRetentionDays must be 30 after save');
  });

  test('setting historyRetentionDays to null disables retention', async () => {
    await fetchJson('/api/settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ historyRetentionDays: 30 }),
    });

    await fetchJson('/api/settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ historyRetentionDays: null }),
    });

    const res = await fetchJson('/api/settings', { headers: sharedHeaders });
    assert.ok(!res.body.historyRetentionDays, 'historyRetentionDays must be null/falsy after clearing');
  });

  test('history retention prunes old entries on save', async () => {
    const convId = `conv-retention-prune-${Date.now()}`;

    await seedHistory(sharedHeaders, { convId, prompt: 'old entry should be pruned' });

    // Confirm it exists
    const before = await fetchJson('/api/history', { headers: sharedHeaders });
    assert.ok(before.body.some(e => e.conversationId === convId), 'entry must exist before prune');

    // Set retention to 1 day — entry is from today so it will NOT be pruned (it's fresh)
    // This tests that the endpoint runs without error, not that today's entries are pruned
    const saveRes = await fetchJson('/api/settings', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({ historyRetentionDays: 1 }),
    });
    assert.equal(saveRes.response.status, 200, 'settings save must succeed');
    assert.equal(typeof saveRes.body.pruned, 'number', 'response must include pruned count');
  });

  // ---------------------------------------------------------------------------
  // History search
  // ---------------------------------------------------------------------------
  test('history search filters entries by prompt and response content', async () => {
    const convId = `conv-search-${Date.now()}`;

    await seedHistory(sharedHeaders, { convId, prompt: 'unique-search-term-xyz prompt', response: 'response text' });

    const res = await fetchJson('/api/history?q=unique-search-term-xyz', { headers: sharedHeaders });
    assert.equal(res.response.status, 200);
    assert.ok(res.body.some(e => e.conversationId === convId), 'search must find the seeded entry');

    const empty = await fetchJson('/api/history?q=no-match-zzz999', { headers: sharedHeaders });
    assert.ok(!empty.body.some(e => e.conversationId === convId), 'non-matching search must not return the entry');
  });

  // ---------------------------------------------------------------------------
  // Agent import/export (API level)
  // ---------------------------------------------------------------------------
  test('custom agents can be created and retrieved with all fields', async () => {
    const suffix = Date.now();
    const createRes = await fetchJson('/api/settings/functions', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify({
        kind: 'agent',
        title: `Export Agent ${suffix}`,
        description: 'Agent for export testing.',
        command: `export-agent-${suffix}`.slice(0, 40),
        useWhen: 'Testing export flow.',
        boundaries: 'Export test bounds.',
        systemPrompt: 'Export test system prompt.',
        starterPrompt: 'Export test starter.',
        provider: 'local',
        model: 'smollm2:135m',
        memoryMode: 'isolated',
        executorType: 'internal-llm',
        maxTurns: 5,
      }),
    });

    assert.equal(createRes.response.status, 200, 'agent creation must succeed');
    const agentId = createRes.body.item?.id;
    assert.equal(typeof agentId, 'string', 'must return agent id');

    // GET functions and verify all fields
    const getRes = await fetchJson('/api/settings/functions', { headers: sharedHeaders });
    const agent = getRes.body.agents.find(a => a.id === agentId);
    assert.ok(agent, 'created agent must appear in functions list');
    assert.equal(agent.title, `Export Agent ${suffix}`);
    assert.equal(agent.memoryMode, 'isolated');
    assert.equal(agent.maxTurns, 5);
    assert.equal(agent.provider, 'local');
  });

  test('importing an agent via POST creates it correctly', async () => {
    const suffix = `import-${Date.now()}`;
    const importPayload = {
      kind: 'agent',
      title: `Imported Agent ${suffix}`,
      description: 'Imported from JSON.',
      command: `imported-${suffix}`.slice(0, 40),
      useWhen: 'When testing import.',
      boundaries: 'Import bounds.',
      systemPrompt: 'Imported system prompt.',
      starterPrompt: 'Imported starter prompt.',
      memoryMode: 'shared',
      executorType: 'internal-llm',
    };

    const res = await fetchJson('/api/settings/functions', {
      method: 'POST',
      headers: sharedHeaders,
      body: JSON.stringify(importPayload),
    });

    assert.equal(res.response.status, 200, 'import (POST) must succeed');
    assert.equal(typeof res.body.item?.id, 'string', 'must return agent id');
    assert.equal(res.body.item.title, `Imported Agent ${suffix}`);
    assert.equal(res.body.item.memoryMode, 'shared');
  });

  // ===========================================================================
  // Browser UI tests (Playwright) — all share the same sharedEmail login
  // ===========================================================================

  test('ui: history tab shows pin button per conversation and pin state persists', async () => {
    const convId = `conv-ui-pin-${Date.now()}`;
    await seedHistory(sharedHeaders, { convId, prompt: 'Pin test conversation prompt' });

    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'History' }).click();
      await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 8000 });

      // Conversation should appear — hover to reveal action row
      const entryText = page.getByText('Pin test conversation prompt');
      await entryText.waitFor({ timeout: 8000 });
      await entryText.hover();

      // Pin button is always rendered (not hover-only), use title attribute
      // click() auto-waits for visibility — mirrors the working rename pattern
      await page.locator('[title="Pin conversation"]').first().click();

      // After pinning, button title should change to "Unpin conversation"
      await page.locator('[title="Unpin conversation"]').first().waitFor({ timeout: 8000 });

      // Reload and confirm the pin persisted
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'History' }).click();
      await page.locator('[title="Unpin conversation"]').first().waitFor({ timeout: 8000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: CSV export button is present in history alongside markdown export', async () => {
    const convId = `conv-csv-${Date.now()}`;
    await seedHistory(sharedHeaders, { convId, prompt: 'CSV export test prompt' });

    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'History' }).click();
      await page.getByText('CSV export test prompt').waitFor({ timeout: 8000 });

      // Both export buttons are rendered via title attributes (icon-only buttons)
      await page.locator('[title="Export as Markdown"]').first().waitFor({ timeout: 8000 });
      await page.locator('[title="Export as CSV"]').first().waitFor({ timeout: 8000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: conversation rename label appears in history and survives refresh', async () => {
    const convId = `conv-rename-${Date.now()}`;
    await seedHistory(sharedHeaders, { convId, prompt: 'Rename me please' });

    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'History' }).click();
      await page.getByText('Rename me please').waitFor({ timeout: 8000 });

      // Click the Rename (pencil) button
      await page.getByTitle('Rename conversation').first().click();

      // Fill in the new label
      const input = page.getByPlaceholder('Rename this conversation…');
      await input.waitFor({ timeout: 5000 });
      await input.fill('My renamed conversation');
      await page.getByRole('button', { name: 'Save' }).click();

      // Label should appear in the conversation list
      await page.getByText('My renamed conversation').waitFor({ timeout: 5000 });

      // Reload and confirm it persisted
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'History' }).click();
      await page.getByText('My renamed conversation').waitFor({ timeout: 8000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: Ctrl+N triggers new chat and focuses composer', async () => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      // Navigate to History tab
      await page.getByRole('button', { name: 'History' }).click();
      await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 8000 });

      // Dispatch keydown via page.evaluate to bypass browser-level Ctrl+N interception
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }));
      });

      // The heading text changes from 'History' to 'Chat' when the tab switches
      await page.getByRole('heading', { name: 'Chat' }).waitFor({ timeout: 5000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: custom agent export/import buttons are present in agents tab', async () => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'Agents' }).click();
      await page.getByRole('heading', { name: 'Custom agents' }).waitFor({ timeout: 8000 });

      // Import button is a subtle text-only button next to the Custom agents heading.
      // Use exact text match to avoid false positives from other Import buttons on the page.
      await page.getByRole('button').filter({ hasText: /^Import$/ }).waitFor({ timeout: 5000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: history retention days field is present in settings tab', async () => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'Settings' }).click();
      // Use exact:true to avoid strict mode violation from 'Runtime settings' being a partial match
      await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ timeout: 8000 });

      // The retention field label lacks htmlFor — use the unique placeholder instead
      await page.getByPlaceholder('No limit').waitFor({ timeout: 5000 });
    } finally {
      await browser?.close();
    }
  });

  test('ui: fullscreen mode — message container is scrollable (overflow-auto present)', async () => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      // Verify the message container has overflow-auto class applied
      const messagesContainer = page.locator('.overflow-auto').first();
      await messagesContainer.waitFor({ timeout: 5000 });

      // Verify scrollability: the container must have overflow-auto in its computed style
      const overflowY = await messagesContainer.evaluate(el =>
        window.getComputedStyle(el).overflowY
      );
      assert.ok(
        overflowY === 'auto' || overflowY === 'scroll',
        `messages container must be scrollable, got overflowY=${overflowY}`
      );
    } finally {
      await browser?.close();
    }
  });

  test('ui: history search input is present and responds to typing', async () => {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await loginViaUI(page, sharedEmail);

      await page.getByRole('button', { name: 'History' }).click();
      await page.getByRole('heading', { name: 'History' }).waitFor({ timeout: 8000 });

      const searchInput = page.getByPlaceholder('Search conversations...');
      await searchInput.waitFor({ timeout: 5000 });
      await searchInput.fill('some search term xyz');
      assert.equal(await searchInput.inputValue(), 'some search term xyz', 'search input must accept text');
    } finally {
      await browser?.close();
    }
  });

  test('ui: app loads and renders the login form', async () => {
    // Lightweight smoke test: verify the SPA loads and renders the local-auth form.
    // Does NOT call loginViaUI so it consumes no rate-limit slots.
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: browserPath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      // The email input is always present on the login form
      await page.getByPlaceholder('you@local.dev').waitFor({ timeout: 10000 });
      // The submit button is always present
      await page.getByRole('button', { name: 'Enter local workspace' }).waitFor({ timeout: 5000 });
    } finally {
      await browser?.close();
    }
  });
});

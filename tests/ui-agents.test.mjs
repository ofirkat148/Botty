import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { baseUrl } from './helpers/live-botty.mjs';

let _chromiumShell = '';
try { const { chromium: _c } = await import('playwright-core'); _chromiumShell = _c.executablePath('chromium'); } catch { /* no playwright-core */ }
const browserPath = (process.env.BOTTY_TEST_BROWSER && process.env.BOTTY_TEST_BROWSER !== '1')
  ? process.env.BOTTY_TEST_BROWSER
  : (process.env.BOTTY_TEST_BROWSER === '1' ? (_chromiumShell || '/usr/bin/google-chrome') : '/usr/bin/google-chrome');

test('ui can create and run a remote http agent', async () => {
  const requests = [];
  const remoteServer = http.createServer(async (req, res) => {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += chunk;
    }

    const payload = JSON.parse(rawBody || '{}');
    requests.push(payload);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      responseText: `Remote UI agent handled: ${payload.prompt}`,
      model: 'remote-ui-v1',
      tokensUsed: 21,
    }));
  });

  await new Promise((resolve) => remoteServer.listen(0, '127.0.0.1', resolve));
  const address = remoteServer.address();
  assert.ok(address && typeof address === 'object', 'expected remote UI test server address');
  const endpoint = `http://127.0.0.1:${address.port}/agent`;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const agentTitle = `Remote UI Agent ${suffix}`;
  const agentCommand = `remote-ui-${suffix}`.slice(0, 40);
  const agentEmail = `ui-agent-${suffix}@example.com`;

  let browser;

  try {
    browser = await chromium.launch({
      executablePath: browserPath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    await page.getByPlaceholder('Ofir').fill('UI Agent Test');
    await page.getByPlaceholder('you@local.dev').fill(agentEmail);
    await page.getByRole('button', { name: 'Enter local workspace' }).click();
    await page.getByRole('heading', { name: 'Chat' }).waitFor();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Agents', exact: true, level: 3 }).waitFor();

    await page.getByPlaceholder('Agent title, e.g. Security Reviewer').fill(agentTitle);
    await page.getByPlaceholder('Slash command, e.g. security-review').fill(agentCommand);
    await page.getByPlaceholder('Specialist summary, e.g. reviews code and architecture for security risk').fill('UI smoke test remote agent.');

    const createAgentSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Agents', exact: true, level: 3 }) });
    await createAgentSection.locator('select').first().selectOption('remote-http');
    await page.getByPlaceholder('Endpoint, e.g. http://localhost:7001/botty').fill(endpoint);
    await page.getByPlaceholder('System prompt: define the specialist role, operating rules, and decision standards').fill('You are a remote UI smoke-test agent.');
    await page.getByRole('button', { name: 'Add agent' }).click();

    await page.getByText('Custom agent added.').waitFor();

    const customAgentsSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Custom agents' }) });
    const agentCard = customAgentsSection.locator('div').filter({ hasText: agentTitle }).first();
    await agentCard.getByText('Remote HTTP agent').waitFor();
    await agentCard.getByText(`Endpoint: ${endpoint}`).waitFor();
    await agentCard.getByRole('button', { name: 'Edit agent' }).click();
    await agentCard.getByPlaceholder('Agent title').fill(`${agentTitle} Updated`);
    await agentCard.getByPlaceholder('System prompt').fill('You are an updated remote UI smoke-test agent.');
    await agentCard.getByRole('button', { name: 'Save changes' }).click();

    await page.getByText('Custom agent updated.').waitFor();
    await customAgentsSection.getByText(`${agentTitle} Updated`).waitFor();

    const updatedAgentCard = customAgentsSection.locator('div').filter({ hasText: `${agentTitle} Updated` }).first();
    await updatedAgentCard.getByRole('button', { name: 'Start agent chat' }).click();

    await page.getByRole('heading', { name: 'Chat' }).waitFor();
    await page.getByPlaceholder('Ask Claude').fill('Check the remote UI path end to end.');
    await page.getByRole('button', { name: 'Send' }).click();
    // SSRF protection blocks execution to private/loopback IPs — the UI must surface the error.
    await page.locator('div.bg-red-50').waitFor({ timeout: 15000 });
    const errorText = await page.locator('div.bg-red-50').textContent();
    assert.match(errorText ?? '', /private or loopback/i, 'expected SSRF error displayed in chat UI');

    assert.equal(requests.length, 0, 'SSRF block must prevent any outbound request to the mock server');

    // Navigate back to Settings to delete the agent
    await page.getByRole('button', { name: 'Settings' }).click();
    await updatedAgentCard.getByRole('button', { name: 'Delete agent' }).click();
    await updatedAgentCard.getByText('Delete this custom agent?').waitFor();
    await updatedAgentCard.getByRole('button', { name: 'Confirm delete' }).click();
    await page.getByText('Custom agent deleted.').waitFor();
    await assert.doesNotReject(async () => {
      await customAgentsSection.getByText(`${agentTitle} Updated`).waitFor({ state: 'detached', timeout: 15000 });
    });
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => remoteServer.close((error) => error ? reject(error) : resolve(undefined)));
  }
});
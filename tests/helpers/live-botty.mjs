import assert from 'node:assert/strict';

export const baseUrl = process.env.BOTTY_TEST_BASE_URL || 'http://127.0.0.1:5000';
export const localModel = process.env.BOTTY_TEST_LOCAL_MODEL || 'smollm2:135m';

export async function loginLocalUser(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const response = await fetch(`${baseUrl}/api/auth/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, displayName: label }),
  });

  assert.equal(response.status, 200, 'expected local login to succeed');
  const payload = await response.json();
  assert.ok(payload.token, 'expected auth token from local login');
  assert.ok(payload.user?.id, 'expected user payload from local login');
  return payload;
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

export function buildAuthHeaders(token, extraHeaders = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };
}
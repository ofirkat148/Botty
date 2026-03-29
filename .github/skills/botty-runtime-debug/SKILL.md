---
name: botty-runtime-debug
description: 'Debug Botty runtime issues involving systemd, localhost access, API failures, CORS, Telegram startup, Ollama, and saved settings. Use when the app is up but behavior is broken or requests fail.'
argument-hint: 'Describe the failing runtime symptom'
user-invocable: true
---

# Botty Runtime Debug

## When to Use
- The UI shows fetch failures or blank screens
- Port `5000` behavior is inconsistent
- Telegram startup or settings save fails
- Local LLM requests time out or fail
- Memory, settings, or API state does not match expectations

## Procedure
1. Check whether `botty.service` is active.
2. Verify `http://127.0.0.1:5000/api/health` before assuming a full outage.
3. Inspect recent service logs with `journalctl -u botty.service -n 120 --no-pager`.
4. Separate local app failures from upstream network failures such as Telegram or Ollama connectivity.
5. If the issue is frontend-only, confirm the production bundle is rebuilt and the service restarted.
6. Prefer fixing the server response path so the UI gets structured errors instead of generic fetch failures.

## Common Botty Failure Areas
- Telegram network/auth problems during settings save
- Missing rebuild after frontend-only changes
- CORS or origin mismatches for localhost and external access
- Local LLM URL normalization or upstream model availability
- Duplicate memory/fact state caused by stale persisted rows

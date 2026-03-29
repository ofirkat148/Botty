---
name: botty-ops
description: 'Operate and deploy Botty locally with Docker, systemd, PostgreSQL, reverse proxy examples, and runtime environment settings. Use when managing startup, services, persistence, ports, or production-style local serving.'
argument-hint: 'Describe the Botty ops or deployment task'
user-invocable: true
---

# Botty Ops

## When to Use
- Change boot-time behavior or service startup
- Work with Docker Compose or PostgreSQL persistence
- Update reverse proxy or external-access setup
- Diagnose environment and runtime configuration

## Procedure
1. Inspect `ops/`, `docker-compose.yml`, and `server/index.ts` before changing runtime assumptions.
2. Keep the boot path compatible with `ops/botty.service`.
3. Treat `.env.local` as runtime input, but prefer app-level settings for user-editable values when appropriate.
4. Validate with targeted checks: service status, API health, build, and logs.
5. Avoid destructive resets of persisted data unless explicitly requested.

## Important Files
- `ops/botty.service`
- `docker-compose.yml`
- `ops/Caddyfile`
- `ops/nginx-botty.conf`
- `ops/REVERSE_PROXY.md`

---
name: botty-development
description: 'Build and modify the Botty app across React, Express, PostgreSQL, memory, local LLM, and Telegram features. Use when adding features, fixing app logic, updating settings flows, or making full-stack changes in this repo.'
argument-hint: 'Describe the feature or bug to implement in Botty'
user-invocable: true
---

# Botty Development

## When to Use
- Add or change Botty product features
- Modify frontend and backend behavior together
- Update settings, chat flows, memory behavior, or provider selection
- Work on Telegram integration or local LLM behavior

## Project Map
- Frontend: `src/App.tsx`, `src/index.css`, `src/hooks/`
- Server entry: `server/index.ts`
- Routes: `server/routes/`
- Shared chat logic: `server/services/chat.ts`
- Telegram logic: `server/services/telegram.ts`
- Database schema/bootstrap: `server/db/schema.ts`, `server/db/index.ts`
- LLM and memory utilities: `server/utils/llm.ts`

## Procedure
1. Inspect the relevant route, service, and UI flow before editing.
2. Prefer fixing behavior in shared utilities or services instead of patching one endpoint at a time.
3. Keep database changes backward-compatible with bootstrap migrations in `server/db/index.ts`.
4. When changing settings or persistence, verify both the API contract and the `src/App.tsx` state wiring.
5. Run `npm run lint` after code changes.
6. If the frontend behavior changed, run `npm run build` before finishing.

## Botty Conventions
- Keep changes minimal and focused.
- Preserve the current local-first architecture.
- Reuse shared chat and memory utilities instead of duplicating logic in routes.
- When touching facts or memory, prefer consolidation at the utility layer.
- When changing runtime behavior, consider `botty.service` and the production build flow.

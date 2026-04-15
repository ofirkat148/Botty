# Botty Backlog

_Last updated: 14 April 2026. Prioritized by impact/risk._

## P0 — Cost & Infrastructure

> **Stack at a glance**: App (`node:20` single-stage Dockerfile, ~1.5 GB image) + Postgres (`postgres:16-alpine`, already optimal) + Ollama (local hardware, snap volume — already free). No cloud bills unless a cloud API key is configured.

| # | Item | Why / Impact |
|---|------|-------------|
| 1 | ✅ **Multi-stage Alpine Dockerfile** | Done: two-stage build — `node:20` builder stage + `node:20-alpine` runtime. `tsx` moved to production deps. Image shrinks ~1.5 GB → ~350 MB. |
| 2 | ✅ **`npm ci` instead of `npm install` in Dockerfile** | Done: both stages now use `npm ci`. |
| 3 | **Default cloud provider → Gemini Flash (free tier)** | `claude-3-7-sonnet-latest` is among the most expensive models (~$15/M output tokens). `gemini-2.5-flash` has a free tier on Google AI Studio (1500 req/day, 1M tokens/min) covering virtually all personal-use traffic at $0. Change the recommended onboarding order in settings to: Local → Gemini Flash → OpenAI mini → Anthropic. |
| 4 | **k8s `replicas: 1` for single-user deployments** | `k8s/app.yaml` sets `replicas: 2`. On any cloud k8s (GKE, EKS, AKS) that doubles the compute bill. Document that replicas: 2 is only needed for HA; default to 1 for personal deployments. |
| 5 | **Ollama: prefer smallest adequate model** | `qwen2.5:3b` is the current default (good). `qwen2.5:1.5b` uses ~900 MB RAM vs ~2 GB, sufficient for most chat tasks. Document this trade-off so users can choose based on how much RAM their machine has. |
| 6 | **Postgres PVC storage right-sizing** | `k8s/postgres.yaml` requests 10 Gi. For personal use, 2 Gi is plenty and cuts PVC cost ~5× on cloud storage. |

## P1 — Reliability & Security

| # | Item | Notes |
|---|------|-------|
| 1 | **Auth rate limiter resets on container restart** | In-memory limiter loses its state on every Docker restart. Use a persistent store or add a `DISABLE_RATE_LIMIT=true` env override for dev/test. |
| 2 | ✅ **JWT expiry with no re-login prompt** | Done: `apiGet`/`apiSend` now detect 401, call `handleLogout()` and set an "session expired" error to redirect the user to login. |
| 3 | ✅ **`historyRetentionDays` label missing `htmlFor`** | Done: Added `id="history-retention-days"` + `htmlFor` to the Settings label. |
| 4 | ✅ **Memory context hard-truncated at 8,000 chars** | Done: `getMemoryContext` now appends `...[memory context truncated]` when the 8,000-char limit is hit. |

## P2 — Features

| # | Item | Notes |
|---|------|-------|
| 5 | **Conversation search in sidebar** | Ctrl+K / `/` command palette to jump to any past conversation by keyword. |
| 6 | **Model catalog refresh without restart** | New Ollama models pulled after startup are invisible until container restarts. Add a "Refresh models" button that re-calls the providers endpoint. |
| 7 | **Multi-file attachment** | Currently single-file only. Support drag-drop of multiple files; useful for code review use cases. |
| 8 | **Agent tool execution UI** | Agents can declare tools in config but there is no UI showing the tool call / result flow in the message thread. |
| 9 | **Conversation branching / fork** | Load a history conversation and fork from any message. History is currently append-only. |
| 10 | **Streaming compact summary** | `POST /api/chat/compact` blocks until the full summary is ready. Stream it or run it in the background. |
| 11 | **Per-conversation model indicator** | `conversationModels` is stored but not clearly surfaced in the chat UI. Show the locked model persistently in the composer bar. |

## P3 — Developer Experience

| # | Item | Notes |
|---|------|-------|
| 12 | **Docker hot-reload for server** | `server/` changes need a manual container restart. Mount the dir and use `tsx watch` for dev. |
| 13 | **Browser tests in CI** | `tests/ui-features.test.mjs` skips in CI because Chrome isn't in the Actions runner. Install `playwright-chromium` in the workflow and set `BOTTY_TEST_BROWSER`. |
| 14 | **`DISABLE_RATE_LIMIT` env var** | Rate limiter only auto-raises on `CI=true`. A dev-mode env override prevents burning the request window during local test runs. |
| 15 | **Settings label `htmlFor` audit** | Several form labels in Settings lack `htmlFor` (retention days, system prompt). Audit and fix all for accessibility + test reliability. |
| 16 | **`provider` not persisted in history DB** | History entries have a `provider` field in the TS type but no DB column; the route silently discards it. Store it for proper filtering later. |

## P4 — Polish

| # | Item | Notes |
|---|------|-------|
| 17 | **Dark mode flash on load** | Brief white flash before React hydrates. Fix with a blocking `<script>` in `index.html` that applies the dark class before paint. |
| 18 | **Export excludes archived conversations** | CSV/Markdown export only works from the active history list. Archived conversations can't be exported without unarchiving first. |
| 19 | **Telegram "Send test message" button** | After configuring token and chat IDs, there's no way to verify the bot works without sending a real message. Add a test-send button. |
| 20 | **Fullscreen: hamburger menu missing on mobile** | In fullscreen mode on small screens the sidebar hides and there's no nav access. Keep the hamburger button visible in fullscreen. |
| 21 | **Token usage trend chart Y-axis** | The trend sparkline has no axis labels; hard to judge scale without context. Add min/max annotations. |

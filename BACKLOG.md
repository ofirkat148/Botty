# Botty Backlog

_Last updated: 14 April 2026. Prioritized by impact/risk. All items complete._

## P0 — Cost & Infrastructure

> **Stack at a glance**: App (`node:20` single-stage Dockerfile, ~1.5 GB image) + Postgres (`postgres:16-alpine`, already optimal) + Ollama (local hardware, snap volume — already free). No cloud bills unless a cloud API key is configured.

| # | Item | Why / Impact |
|---|------|-------------|
| 1 | ✅ **Multi-stage Alpine Dockerfile** | Done: two-stage build — `node:20` builder stage + `node:20-alpine` runtime. `tsx` moved to production deps. Image shrinks ~1.5 GB → ~350 MB. |
| 2 | ✅ **`npm ci` instead of `npm install` in Dockerfile** | Done: both stages now use `npm ci`. |
| 3 | ✅ **Default cloud provider → Gemini Flash (free tier)** | Done: Provider selector reordered to Local → Gemini Flash (free) → OpenAI → Anthropic. Free-tier hint banner shown in Settings. |
| 4 | ✅ **k8s `replicas: 1` for single-user deployments** | Done: `k8s/app.yaml` now `replicas: 1` with HA comment. |
| 5 | ✅ **Ollama: prefer smallest adequate model** | Done: QUICKSTART.md now has a model size trade-offs guide (1.5b / 3b / 7b) with RAM and capability notes. |
| 6 | ✅ **Postgres PVC storage right-sizing** | Done: `k8s/postgres.yaml` PVC set to 2 Gi. |

## P1 — Reliability & Security

| # | Item | Notes |
|---|------|-------|
| 1 | ✅ **Auth rate limiter resets on container restart** | Done: `pgRateLimitStore` in `server/index.ts` persists hit counts in a `rate_limit_hits` Postgres table (bootstrapped on startup) so counters survive restarts. `DISABLE_RATE_LIMIT=true` / `CI=true` bypass the store entirely. |
| 2 | ✅ **JWT expiry with no re-login prompt** | Done: `apiGet`/`apiSend` now detect 401, call `handleLogout()` and set an "session expired" error to redirect the user to login. |
| 3 | ✅ **`historyRetentionDays` label missing `htmlFor`** | Done: Added `id="history-retention-days"` + `htmlFor` to the Settings label. |
| 4 | ✅ **Memory context hard-truncated at 8,000 chars** | Done: `getMemoryContext` now appends `...[memory context truncated]` when the 8,000-char limit is hit. |

## P2 — Features

| # | Item | Notes |
|---|------|-------|
| 5 | ✅ **Conversation search in sidebar** | Done: Sidebar search input with fuzzy matching on conversation label/prompt/response, shows up to 8 results. |
| 6 | ✅ **Model catalog refresh without restart** | Done: ↻ Refresh models button in composer re-calls `/api/chat/providers` live. |
| 7 | ✅ **Multi-file attachment** | Done: file input has `multiple`, `addChatFiles` processes all dropped/selected files in a loop, up to 6 files shown as chips. |
| 8 | ✅ **Agent tool execution UI** | Done: Active agent banner now lists declared tool names as badge chips below the session description. |
| 9 | ✅ **Conversation branching / fork** | Done: Fork button on every user message bubble — trims thread to that point, loads text into composer, new sends branch into a fresh conversation. |
| 10 | ✅ **Streaming compact summary** | Done: `/compact` uses SSE + `streamCallLLM` to stream chunks as they arrive; client reads the stream via `fetch` + `ReadableStream` and dispatches `COMPACT_HISTORY` on the `done` event. No more blocking connection for the LLM duration. |
| 11 | ✅ **Per-conversation model indicator** | Done: 🔒 locked-model pill shown above the composer textarea when a conversation has a prior model. |

## P3 — Developer Experience

| # | Item | Notes |
|---|------|-------|
| 12 | ✅ **Docker hot-reload for server** | Done: `docker-compose.dev.yml` override mounts `./server` + `./shared` and runs `tsx watch`. |
| 13 | ✅ **Browser tests in CI** | Done: CI workflow installs Playwright Chromium and sets `BOTTY_TEST_BROWSER`; `npm run test:ui-features` added to CI. |
| 14 | ✅ **`DISABLE_RATE_LIMIT` env var** | Done (same as P1#1). |
| 15 | ✅ **Settings label `htmlFor` audit** | Done: All Settings and login form labels now have matching `id`/`htmlFor` pairs. |
| 16 | ✅ **`provider` not persisted in history DB** | Done: `history` table has `provider varchar(100)` column; route persists it on insert. |

## P4 — Polish

| # | Item | Notes |
|---|------|-------|
| 17 | ✅ **Dark mode flash on load** | Done: Blocking `<script>` in `index.html` sets background and colorScheme before React paint. |
| 18 | ✅ **Export excludes archived conversations** | Done: export buttons (Markdown + CSV) are unconditionally rendered in both active and archived history views. |
| 19 | ✅ **Telegram "Send test message" button** | Done: "Test" button next to Refresh in Telegram status card; result shown green/red. |
| 20 | ✅ **Fullscreen: hamburger menu missing on mobile** | Done: Hamburger button always visible in fullscreen (`lg:hidden` removed in fullscreen mode). |
| 21 | ✅ **Token usage trend chart Y-axis** | Done: Y-axis column with peak/0 labels added to the trend sparkline. |
| 22 | ✅ **`npm test` combined script** | Done: `npm test` runs all non-browser integration tests in sequence (13 suites). Also added `test:routing-unit` to CI pipeline. |
| 23 | ✅ **Copy message button on assistant bubbles** | Done: Copy icon button in every assistant message footer; writes content to clipboard, shows Check + "Copied!" for 1.5s. Token usage and Retry merged into the same action row. |
| 24 | ✅ **Keyboard shortcut Ctrl+N for new conversation** | Already implemented in `handleWindowKeyDown` — Ctrl/Cmd+N when not in an editable field resets the chat and focuses the composer. |
| 25 | ✅ **Token count estimate in the composer** | Done: composer status line appends `· ~N tokens` (chars ÷ 4) when the draft is non-empty, giving users a live rough estimate before sending. |

## P5 — Next Wave

| # | Item | Notes |
|---|------|-------|
| 26 | ✅ **Message timestamps in chat** | Done: `sentAt` ISO timestamp added to `ChatMessage` type; stamped on `ADD_USER_MESSAGE` and `FINALIZE_ASSISTANT` in the reducer; rendered as `HH:MM` in the message header alongside the role label. |
| 27 | ✅ **Message count badge on sidebar conversations** | Already present in History tab: each conversation shows `N message pairs`. No change needed. |
| 28 | ✅ **Auto-scroll lock** | Done: `chatScrollRef` + `scrollLockedRef` detect when user scrolls up; auto-scroll pauses and a `↓ Resume scroll` pill appears at the top of the chat. Clicking it unlocks and jumps to bottom. |
| 29 | **Keyboard shortcut cheatsheet** | A small `?` button or `Ctrl+?` reveals all keyboard shortcuts (Ctrl+N, Ctrl+\, Ctrl+/, Alt+Enter). Currently undiscoverable. |

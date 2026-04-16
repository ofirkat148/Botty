# Botty

A local-first AI chat assistant with a React frontend, Express/Node backend, SQLite, and Ollama. Run entirely on your machine with no cloud dependency — or add API keys for Anthropic, Google Gemini, and OpenAI.

---

## Features

**Chat**
- Multi-provider: Anthropic Claude, Google Gemini, OpenAI GPT, Ollama (local)
- Smart auto-routing — selects model based on prompt complexity, routing mode, and available providers
- Streaming responses (SSE) with live token-by-token display
- Auto-scroll with scroll-lock: pauses when you scroll up, resume button appears
- Copy button on every assistant message (1.5 s "Copied!" confirmation)
- Message timestamps and per-conversation word count in the header
- Conversation forking — branch from any user message into a new thread
- Retry button on last assistant message
- Compact summary (`/compact`) to free context window without losing thread

**Context & Memory**
- Per-user fact store with search, delete, bulk-import from `.txt`/`.md`
- File memory (PDF, images with OCR, text files)
- URL memory (fetched and summarised on load)
- Agent-isolated memory scopes for specialist agents
- Automatic fact consolidation (dedup, up to 100 facts per scope)
- Memory context truncated gracefully at 8,000 characters

**Routing modes**
| Mode | Behaviour |
|------|-----------|
| `auto` | Classifier picks model based on prompt type |
| `fastest` | Always uses the smallest/cheapest model |
| `best-quality` | Always uses the largest model |
| `local-first` | Prefers Ollama; falls back to cloud |

**Agents & Skills**
- Built-in agents (development, research, writing, etc.)
- Custom agents with isolated memory, system prompt, and tool definitions
- Custom skills as slash-command overlays
- Remote HTTP agents (external endpoint, 15 s timeout, SSRF-safe URL validation)
- Agent tool execution badge shows declared tool names

**History**
- Full conversation history with search, archive, pin, rename, fork, and export (Markdown + CSV)
- Clear all history with confirmation
- Per-conversation model lock — locked model shown above composer

**Telegram Bot**
- Long-polling Telegram bot with exponential backoff
- Each Telegram chat gets its own Botty user in SQLite
- Configurable provider/model per Telegram session
- Test-send button in Settings to verify bot credentials

**Security**
- Local JWT auth (email-based, single-user friendly)
- JWT secret enforced at startup (≥ 16 chars)
- API key encryption at rest with AES-256-GCM
- Auth rate limiter (20 req / 15 min) persisted in SQLite across restarts
- Remote agent SSRF protection (http/https only)
- CORS wildcard warning when `PUBLIC_BASE_URL` is non-localhost

**Developer experience**
- `npm test` runs all 13 integration test suites
- `npm run test:routing-unit` — offline unit tests for the classifier and model selector
- `npm run dev` — Vite + `tsx` with hot-reload; `docker-compose.dev.yml` mounts server for container hot-reload
- Prometheus metrics endpoint at `GET /api/metrics` (optional `METRICS_TOKEN` auth)
- Structured logging via `pino` with field redaction for secrets
- Drizzle ORM with migration baseline committed to repo

**UI polish**
- Dark / light mode with no flash on load
- Fullscreen mode (`Alt+Enter`) — sidebar and hamburger stay accessible
- Keyboard shortcuts: `Ctrl+N` (new chat), `Ctrl+\` (sidebar), `Ctrl+/` (focus composer), `Ctrl+?` (shortcut cheatsheet)
- Live token estimate in composer status bar
- Sidebar conversation search (fuzzy, up to 8 results)
- Model catalog refresh without restart
- Multi-file attachment (up to 6 files as chips)
- Voice input with Web Speech API

---

## Quick Start

Fastest path on a fresh Linux machine:

```bash
git clone https://github.com/ofirkat148/Botty.git
cd Botty
bash ops/install-botty.sh
```

The installer:
- Installs Docker and the Compose plugin (apt-based systems)
- Creates `.env.local` from `.env.example` if missing
- Generates `JWT_SECRET` and `KEY_ENCRYPTION_SECRET`
- Builds the app image and installs `botty.service`
- Waits for the health endpoint and prints status

Then open **http://localhost:5000**.

---

## Manual Setup

```bash
cp .env.example .env.local
# Edit .env.local — set JWT_SECRET, KEY_ENCRYPTION_SECRET, and any provider keys
docker compose up -d
```

Or for local development (Vite + tsx, no Docker):

```bash
npm ci
# Set environment variables in your shell or a .env.local file read by tsx
npm run dev        # Vite on :5173, Express on :5000
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_PATH` | — | Path to the SQLite database file (default: `./data/botty.db`) |
| `JWT_SECRET` | ✅ | ≥ 16 chars; generate with `openssl rand -hex 32` |
| `KEY_ENCRYPTION_SECRET` | ✅ | ≥ 16 chars; used for AES-256-GCM key encryption |
| `ANTHROPIC_API_KEY` | — | Enables Claude models |
| `GEMINI_API_KEY` | — | Enables Gemini models (free tier available) |
| `OPENAI_API_KEY` | — | Enables GPT models |
| `LOCAL_LLM_URL` | — | Ollama base URL (default: `http://127.0.0.1:11434`) |
| `TELEGRAM_BOT_TOKEN` | — | Enables Telegram bot |
| `TELEGRAM_ALLOWED_CHAT_IDS` | — | Comma-separated list of allowed Telegram chat IDs |
| `TELEGRAM_BOT_ENABLED` | — | `true` / `false` (default: `true` when token is set) |
| `TELEGRAM_PROVIDER` | — | Provider for Telegram sessions (default: `auto`) |
| `TELEGRAM_MODEL` | — | Model for Telegram sessions |
| `PUBLIC_BASE_URL` | — | Your public URL, e.g. `https://botty.example.com` |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |
| `METRICS_TOKEN` | — | Bearer token for `/api/metrics`; unauthenticated if unset |
| `DISABLE_RATE_LIMIT` | — | Set `true` for local dev to skip auth rate limiting |

---

## Architecture

```
Browser (React + Vite)
       │  HTTP / SSE
       ▼
Express API (:5000)
  ├─ /api/auth       — JWT login
  ├─ /api/chat       — chat + streaming
  ├─ /api/history    — CRUD + search + archive
  ├─ /api/memory     — facts, files, URLs
  ├─ /api/keys       — encrypted API key store
  ├─ /api/settings   — user settings + Telegram
  ├─ /api/usage      — token usage + trends
  └─ /api/metrics    — Prometheus exposition
       │
  ┌──────────┐
  │  SQLite  │  (Drizzle ORM, tables created on start)
  └──────────┘
       │
  Ollama / Cloud LLM providers
```

---

## Operational Notes

```bash
# Health check
curl http://127.0.0.1:5000/api/health

# Service status
systemctl status botty.service
docker compose ps

# After pulling new code
docker compose build app
sudo systemctl restart botty.service

# DB backup (copies the SQLite file; safe while running thanks to WAL mode)
bash ops/backup-db.sh --dir /var/backups/botty --keep 14
```

The stack uses **Docker host networking** with explicit localhost binds (`127.0.0.1:5000`, `127.0.0.1:11435`) to reliably work behind enterprise DNS and firewall controls that break Docker bridge-network name resolution.

Access Botty remotely through a reverse proxy. Sample configs:
- [ops/Caddyfile](ops/Caddyfile)
- [ops/nginx-botty.conf](ops/nginx-botty.conf)
- [ops/REVERSE_PROXY.md](ops/REVERSE_PROXY.md)

---

## Testing

```bash
npm test                    # all 13 integration suites (requires running server + DB)
npm run test:routing-unit   # offline unit tests (no server needed)
npm run test:security       # auth rate limit, encryption, isolation
npm run test:provider-fallback
npm run test:memory
npm run test:telegram
```

CI runs all suites plus browser tests (`test:ui-features`) via GitHub Actions with a local LLM mock. No external database service is needed — SQLite is created in `/tmp` for each run.

---

## Git Helpers (air-gapped machines)

```bash
bash ops/export-git-bundle.sh   # portable .bundle file for offline transfer
bash ops/git-pull.sh            # fast-forward pull from origin
bash ops/git-push.sh            # push current branch to origin
```

---

## Kubernetes

Manifests are in `k8s/`. Single-replica deployment. Note: `k8s/postgres.yaml` is retained for historical reference but the app no longer requires it.

```bash
kubectl apply -f k8s/namespace-and-ingress.yaml
kubectl apply -f k8s/app.yaml
```

See [k8s/DEPLOYMENT.md](k8s/DEPLOYMENT.md) for full instructions.


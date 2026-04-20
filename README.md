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
docker compose pull    # pulls ghcr.io/ofirkat148/botty:main (built by CI)
docker compose up -d
```

Or for local development (Vite + tsx, no Docker):

```bash
npm ci
# Set environment variables in your shell or a .env.local file read by tsx
npm run dev        # Vite on :5173, Express on :5000
```

---

## Usage Guide

### First Login

Open **http://localhost:5000**, enter any email address, and set a password. Botty creates a local account — no external auth service is needed. On the first login you'll be taken straight to the chat view.

---

### Chat

Type your message in the composer at the bottom and press **Enter** (or click Send). Responses stream token-by-token.

**Composer shortcuts**

| Action | Shortcut |
|--------|----------|
| Send message | `Enter` |
| New line | `Shift+Enter` |
| New chat | `Ctrl+N` |
| Focus composer | `Ctrl+/` |
| Toggle sidebar | `Ctrl+\` |
| Fullscreen mode | `Alt+Enter` |
| All shortcuts | `Ctrl+?` |

**Attach files** — click the paperclip or drag files onto the composer. Supports PDFs (text extracted), images (OCR), and plain text/markdown (up to 6 files).

**Voice input** — click the mic button, speak, and release. Interim transcription appears as you talk. Requires browser microphone permission.

**Web search** — click the **Search** (globe) button in the composer to toggle on-demand Tavily search. When active, Botty fetches live results and injects them as context before answering. Requires `TAVILY_API_KEY` (see Settings → Web search).

---

### Routing Modes

Select a routing mode in the composer status bar or Settings:

| Mode | When to use |
|------|-------------|
| **Auto** | Default — classifier picks the best model for each prompt |
| **Fastest** | Quick lookups, simple transforms, low cost |
| **Best quality** | Long-form writing, complex reasoning |
| **Local first** | Keep data off cloud; falls back to cloud if Ollama is unavailable |

You can also **lock a conversation to a specific model** — click the model name in the chat header to pin it for that thread.

---

### Memory

Botty automatically extracts and stores facts from your conversations (if Auto-memory is on in Settings). You can also manage memory manually in the **Memory tab**:

- **Facts** — view, search, and delete individual facts; bulk-import from `.txt` or `.md`
- **Files** — upload documents that Botty reads as background context in every conversation
- **URLs** — paste a URL; Botty fetches and summarises the page and recalls it as context

Memory is scoped per-user. Agents can have isolated or shared memory depending on their configuration.

---

### Agents & Skills

**Agents** are specialist personas with their own system prompt, routing, and memory scope.

- Access built-in agents (Development, Research, Writing, etc.) via the **/** slash-command in the composer — type `/dev`, `/research`, etc.
- Create **custom agents** in Settings → Agents with a name, description, trigger command, and optional tool declarations.
- Agents can be remote HTTP endpoints — Botty sends the conversation and streams back the response.

**Skills** are slash-command overlays that inject extra instructions at prompt time without changing the whole persona. Manage them in Settings → Skills.

---

### Projects (Folders)

Group related conversations into **Projects** to keep work organised.

1. Open the **History** tab → **Projects** panel on the right
2. Click **+ New project** and give it a name
3. On any conversation row, click the **layers icon** to assign it to a project
4. Filter the conversation list by clicking a project pill at the top

Projects can have a system prompt of their own (set in the edit dialog), which overrides the default for all conversations in that project.

---

### Artifacts

When Botty returns a fenced code block in `html`, `jsx`, `tsx`, or `svg`, it renders as an **artifact card** with:

- A **Copy** button for the source
- A **Show preview** toggle that runs the code in a sandboxed `<iframe>`

This works for full HTML pages, React components, and SVG graphics. The sandbox has no network access and no same-origin access to your Botty session.

---

### Sharing Conversations

Share a read-only link to any conversation without requiring the recipient to have a Botty account.

1. Open the **History** tab
2. Click the **share icon** (↗) on a conversation row
3. Copy the generated link — it opens a dark-themed public view with no auth required
4. Click **Revoke** on the same row to delete the share at any time

Shared links expose only the prompt/response pairs — no user data, memory, or API keys are included.

---

### Settings

| Section | What you can configure |
|---------|------------------------|
| **Provider keys** | Enter Anthropic, Google, OpenAI keys — stored AES-256-GCM encrypted in SQLite |
| **Web search** | View Tavily key status (key lives in `.env.local`) |
| **Provider readiness** | See which providers are configured and reachable |
| **Runtime settings** | Local LLM URL, memory on/off, auto-memory, sandbox mode, history retention |
| **Agents** | Create, edit, and delete custom agents |
| **Skills** | Create custom slash-command skill overlays |
| **Telegram** | Enter bot token and allowed chat IDs; test with the send button |
| **Memory backup** | Download a full backup JSON or restore from one |
| **Danger zone** | Clear all conversations; delete account |

---

### History

The **History tab** shows all past conversations grouped by thread.

- **Search** — type to filter across prompts and responses
- **Pin** — keeps a conversation at the top of the list
- **Rename** — give a conversation a display label
- **Fork** — branch from any message into a new thread (also available in chat via the fork icon on any message)
- **Archive** — hides conversations from the main list; toggle the archive button to view them
- **Export** — download as Markdown or CSV
- **Open** — restores the full conversation into the chat view

---

### Telegram Bot

Once configured in Settings → Telegram, the bot responds to messages in the allowed chat IDs using the same providers and routing as the web UI. Each Telegram chat has its own isolated conversation history in the DB. Use the **Send test message** button to verify the token and chat IDs before going live.



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
docker compose pull app   # pulls latest image from GHCR (no local build needed)
docker compose up -d app
# or simply restart the systemd service:
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


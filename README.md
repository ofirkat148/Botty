# Botty Local OSS Runtime

Botty is a local Postgres-backed app with a React frontend, a Node/Express API, local JWT auth, and direct provider calls such as Claude via Anthropic.

## Project Structure

- `src/` contains the Vite React client
- `server/` contains the Express API, database code, auth, and provider integrations
- root config files stay at the repository root for Docker, Vite, TypeScript, and Drizzle

## Run Locally

- Node.js 20+
- PostgreSQL 16+ or Docker Compose

1. Copy `.env.example` to `.env.local`
2. Set `JWT_SECRET`, `DATABASE_URL`, and at least one provider key such as `ANTHROPIC_API_KEY`
3. Start PostgreSQL with `docker compose up -d postgres` or use an existing local Postgres instance
4. Run `npm install`
5. Run `npm run dev`

The frontend runs on `http://localhost:5173` and the API runs on `http://localhost:5000`.

## Local Auth

The app uses local email-based sign-in for single-user development. Enter any valid email in the UI and Botty will create or reuse that identity in PostgreSQL.

## Claude

If `ANTHROPIC_API_KEY` is set, the app will automatically expose Anthropic in the provider list and the default chat path will use Claude.

## External Access

Botty now listens on `0.0.0.0` by default, so it can be reached from other machines if your firewall, router, reverse proxy, or cloud security group allows inbound traffic.

- `HOST` controls the bind address.
- `PUBLIC_BASE_URL` can be set to your public URL, such as `https://botty.example.com`.
- `CORS_ORIGINS` accepts a comma-separated list of allowed browser origins for external frontends.

Typical production setup is to place Botty behind Nginx, Caddy, Cloudflare Tunnel, Tailscale Funnel, or a cloud load balancer rather than exposing port `5000` directly.

Sample reverse-proxy configs are included in:

- [ops/Caddyfile](/home/ofirkat/Botty/ops/Caddyfile)
- [ops/nginx-botty.conf](/home/ofirkat/Botty/ops/nginx-botty.conf)
- [ops/REVERSE_PROXY.md](/home/ofirkat/Botty/ops/REVERSE_PROXY.md)

## Telegram Bot

Botty can now run as a Telegram bot using long polling.

Required environment variables:

- `TELEGRAM_BOT_TOKEN`

Optional environment variables:

- `TELEGRAM_BOT_ENABLED=true`
- `TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321`
- `TELEGRAM_PROVIDER=auto`
- `TELEGRAM_MODEL=qwen2.5:3b`

Behavior:

- Each Telegram chat gets its own Botty user profile stored in PostgreSQL.
- Messages are processed through the same Botty chat pipeline as the web app.
- `/start` and `/help` show usage help.
- `/reset` clears the current Telegram conversation context for that chat.

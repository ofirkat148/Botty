# Botty Local OSS Runtime

Botty now runs as a Docker-first local stack with a React frontend build, a Node/Express API, PostgreSQL, and Ollama. The stack is managed through Docker Compose, and the machine-level entrypoint is the `botty.service` systemd unit.

## Project Structure

- `src/` contains the Vite React client
- `server/` contains the Express API, database code, auth, and provider integrations
- root config files stay at the repository root for Docker, Vite, TypeScript, and Drizzle

## Run Locally

- Docker + Docker Compose
- systemd if you want the machine-managed boot path
- `.env.local` for runtime configuration

1. Copy `.env.example` to `.env.local`
2. Set `JWT_SECRET` and any provider keys you want Botty to use
3. Start the full stack with `sudo systemctl restart botty.service`

You can also run the stack directly with `docker compose up -d`.

The app is served on `http://localhost:5000`.

Current containers:

- `app` runs the Express server and serves the built frontend
- `postgres` stores Botty data
- `ollama` serves the local LLM endpoint on `127.0.0.1:11435`

Useful checks:

- `systemctl status botty.service`
- `docker compose ps`
- `curl http://127.0.0.1:5000/api/health`
- `curl http://127.0.0.1:11435/api/tags`

## Local Auth

The app uses local email-based sign-in for single-user development. Enter any valid email in the UI and Botty will create or reuse that identity in PostgreSQL.

## Providers

If `ANTHROPIC_API_KEY` is set, the app will expose Anthropic in the provider list. Ollama is now containerized as part of the default stack, so local models are available through the Dockerized Ollama service by default.

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
- If Telegram is unreachable at startup, Botty keeps the app running and retries Telegram connection in the background.

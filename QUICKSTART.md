# Botty Quick Start

## 1. Configure Environment

```bash
cd /home/ofirkat/Botty
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
JWT_SECRET=replace-this
ANTHROPIC_API_KEY=your_claude_key
LOCAL_LLM_URL=http://127.0.0.1:11435
# Optional for Telegram
# TELEGRAM_BOT_TOKEN=123456:telegram-token
```

## 2. Start The Full Stack

```bash
sudo systemctl restart botty.service
```

This starts:

- `postgres`
- `ollama`
- `app`

If you prefer not to use systemd, you can run:

```bash
docker compose up -d
```

## 3. Open the App

- App: `http://localhost:5000`

The database schema is bootstrapped automatically on server startup.

Useful checks:

- `systemctl status botty.service`
- `docker compose ps`
- `curl http://127.0.0.1:5000/api/health`
- `curl http://127.0.0.1:11435/api/tags`

## Optional: Reach Botty From Outside Your Machine

- Leave `HOST=0.0.0.0` enabled.
- Expose the app through your router, reverse proxy, Tailscale, or a tunnel such as Cloudflare Tunnel.
- If you serve Botty from another origin, set `CORS_ORIGINS=https://your-domain.example`.
- Ready-made configs are included in [ops/Caddyfile](/home/ofirkat/Botty/ops/Caddyfile) and [ops/nginx-botty.conf](/home/ofirkat/Botty/ops/nginx-botty.conf).

## Optional: Enable Telegram

- Create a bot with BotFather.
- Put the bot token in `.env.local` as `TELEGRAM_BOT_TOKEN=...`.
- Restart Botty.
- Optional: restrict access with `TELEGRAM_ALLOWED_CHAT_IDS`.

## Notes

- Authentication is local-only.
- Netlify, Firebase, and Google OAuth migration leftovers have been removed from the active runtime.
- The default runtime is Docker-based.
- Ollama is part of the Docker stack and listens on `127.0.0.1:11435`.
- If Telegram is unreachable at startup, Botty keeps serving the app and retries Telegram in the background.

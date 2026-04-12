# Botty Quick Start

## 1. Fast Install On A New Linux Machine

If the repo is already checked out on the target machine, the fastest path is:

```bash
cd /path/to/Botty
bash ops/install-botty.sh
```

What this does:

- installs Docker and the compose plugin on apt-based systems if they are missing
- creates `.env.local` from `.env.example` if needed
- generates a non-placeholder `JWT_SECRET`
- builds the Botty app image
- installs a machine-specific `botty.service`
- starts the Botty stack and prints health checks

After the script finishes, review `.env.local` for any provider keys, public URL settings, or Telegram token you want to enable.

## 2. Configure Environment Manually

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

## 3. Start The Full Stack

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

## 4. Open the App

- App: `http://localhost:5000`

The database schema is bootstrapped automatically on server startup.

Useful checks:

- `systemctl status botty.service`
- `docker compose ps`
- `curl http://127.0.0.1:5000/api/health`
- `curl http://127.0.0.1:11435/api/tags`

After pulling new code, rebuild before restarting:

```bash
docker compose build app
sudo systemctl restart botty.service
```

## Optional: Reach Botty From Outside Your Machine

- Leave `HOST=0.0.0.0` enabled.
- Expose the app through a reverse proxy, Tailscale, or a tunnel such as Cloudflare Tunnel.
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
- PostgreSQL is not published on the host by default.
- `LOCAL_AUTH_ENABLED=true` is intended for local or tightly controlled personal use, not broad public exposure.
- If Telegram is unreachable at startup, Botty keeps serving the app and retries Telegram in the background.

## GitHub Sync Helpers

If this machine can reach GitHub normally, you can use:

```bash
bash ops/git-pull.sh
bash ops/git-push.sh
```

These default to the current branch on `origin` and avoid merge commits by pulling with `--ff-only`.

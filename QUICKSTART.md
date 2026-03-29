# Botty Quick Start

## 1. Configure Environment

```bash
cd /home/ofirkat/Botty/Botty
cp .env.example .env.local
```

Set these values in `.env.local`:

```env
DATABASE_URL=postgresql://botty_user:botty_pass@localhost:5432/botty_db
JWT_SECRET=replace-this
ANTHROPIC_API_KEY=your_claude_key
HOST=0.0.0.0
# Optional for Telegram
# TELEGRAM_BOT_TOKEN=123456:telegram-token
```

## 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

## 3. Start the App

```bash
npm install
npm run dev
```

## 4. Open the App

- Frontend: `http://localhost:5173`
- API: `http://localhost:5000`

The database schema is bootstrapped automatically on server startup.

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
- `docker compose` is only used for PostgreSQL.
- `npm run dev` starts both the API and the Vite frontend.

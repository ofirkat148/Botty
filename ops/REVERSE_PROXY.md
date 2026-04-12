# Reverse Proxy Setup

Botty is published to `127.0.0.1:5000` on the host by default. These configs put a reverse proxy in front of it so you can publish a domain without exposing the app container directly.

## Recommended environment values

Set these in `.env.local` before exposing the app publicly:

```env
HOST=0.0.0.0
PUBLIC_BASE_URL=https://botty.example.com
CORS_ORIGINS=https://botty.example.com
LOCAL_AUTH_ENABLED=false
```

Then restart the app service:

```bash
sudo systemctl restart botty.service
```

## Option 1: Caddy

Use [ops/Caddyfile](/home/ofirkat/Botty/ops/Caddyfile) as a starting point.

1. Replace `botty.example.com` with your real domain.
2. Replace `you@example.com` with your email.
3. Install Caddy.
4. Copy the file into Caddy's config location.
5. Reload Caddy.

Typical commands:

```bash
sudo cp /home/ofirkat/Botty/ops/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy will obtain TLS certificates automatically when the domain resolves to your machine and ports `80` and `443` are reachable.

## Option 2: Nginx

Use [ops/nginx-botty.conf](/home/ofirkat/Botty/ops/nginx-botty.conf) as a starting point.

1. Replace `botty.example.com` with your real domain.
2. Copy the config into Nginx sites.
3. Enable it.
4. Reload Nginx.
5. Add TLS separately with Certbot or your existing certificate flow.

Typical commands:

```bash
sudo cp /home/ofirkat/Botty/ops/nginx-botty.conf /etc/nginx/sites-available/botty.conf
sudo ln -s /etc/nginx/sites-available/botty.conf /etc/nginx/sites-enabled/botty.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Router / Firewall

If Botty should be reachable from the public internet:

1. Point your DNS record to your public IP.
2. Forward ports `80` and `443` from your router to this machine.
3. Allow those ports in your local firewall.

Do not publish PostgreSQL or Ollama directly unless you intentionally want them reachable outside the machine.

If you do not want direct public exposure, use a tunnel or private mesh instead:

1. Cloudflare Tunnel
2. Tailscale Funnel
3. A VPS reverse proxy

## Telegram note

The Telegram bot added to Botty uses long polling, so it does not require a public webhook endpoint. Public HTTP exposure is only needed for the web app itself.
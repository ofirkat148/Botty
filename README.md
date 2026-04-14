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

Fastest new-machine path after cloning the repo:

```bash
bash ops/install-botty.sh
```

That script creates `.env.local` if needed, validates the runtime config, builds the app image, installs or updates a machine-specific `botty.service`, and starts the stack.

Useful installer flags:

```bash
bash ops/install-botty.sh --no-start
bash ops/install-botty.sh --skip-docker-install
bash ops/install-botty.sh --user "$USER" --env-file .env.local
```

If startup never reaches the health endpoint, the installer now exits non-zero after printing recent `systemctl status` output plus `docker compose logs` for `app`, `postgres`, and `ollama`.

Manual path:

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

Operational notes:

- Restarting `botty.service` now preserves the `postgres` and `ollama` containers and only restarts the `app` container.
- The systemd unit sets `TimeoutStartSec=0` because first boot may need time to build the app image.
- The app now runs from a prebuilt Docker image instead of installing dependencies and rebuilding on each container start.
- The runtime uses Docker host networking with explicit localhost binds because this host sits behind enterprise DNS and firewall controls that broke Docker bridge-network name resolution during live rollout.
- Botty, PostgreSQL, and Ollama are all bound to `127.0.0.1` on the host; publish them another way only if you intentionally want direct network exposure.
- Telegram may remain unavailable under enterprise egress restrictions even while the web app, database, and local LLM are healthy.

After pulling new code, rebuild the app image before restarting the service:

```bash
docker compose build app
sudo systemctl restart botty.service
```
## Quick Install & Troubleshooting

- **Install:**
```bash
./install-botty.sh
```

- **Check service and containers:**
```bash
systemctl status botty.service
docker compose ps
```

- **If the service failed:** rebuild the app and restart the service:
```bash
docker compose build app
sudo systemctl restart botty.service
```

- **If there are Docker credential/config issues:** inspect and back up the project `config.json` as user `<USER>`, remove `credsStore` from the Docker config, then restart the service:
```bash
# View the app config (as user '<USER>')
sudo -u <USER> cat config.json

# Back up Docker config
sudo -u <USER> cp config.json /home/<USER>/.docker/config.json.bak

# Remove "credsStore" from the Docker config using Python
sudo -u <USER> python3 - <<'PY'
import json
p="/home/<USER>/.docker/config.json"
d=json.load(open(p))
d.pop("credsStore", None)
json.dump(d, open(p, "w"), indent=2)
PY

# Restart the service after the change
sudo systemctl restart botty.service
```

- **Final checks:**
```bash
systemctl status botty.service
docker compose ps
```
```

## Git Export

If this machine cannot reach GitHub directly, prepare a portable Git bundle locally and push it from an approved machine or network instead.

Use:

- `bash ops/export-git-bundle.sh`

This creates a `.bundle` file containing all refs, plus a `.sha256` file when `sha256sum` is available.

## GitHub Pull/Push Helpers

For normal online sync to GitHub, use:

- `bash ops/git-pull.sh` to fast-forward pull the current branch from `origin`
- `bash ops/git-push.sh` to push the current branch to `origin`
- `bash ops/git-push.sh origin main --tags` if you also want to push tags explicitly

Both scripts can take a remote name as the first argument and a branch name as the second argument.

## Local Auth

The app uses local email-based sign-in for single-user development. Enter any valid email in the UI and Botty will create or reuse that identity in PostgreSQL.

## Providers

If `ANTHROPIC_API_KEY` is set, the app will expose Anthropic in the provider list. Ollama is now containerized as part of the default stack, so local models are available through the Dockerized Ollama service by default.

## External Access

The live runtime uses Docker host networking, but the services themselves bind to localhost: Botty on `127.0.0.1:5000`, Ollama on `127.0.0.1:11435`, and PostgreSQL on `127.0.0.1:5432`. Reach Botty through a reverse proxy, tunnel, or another deliberate publishing step if you need remote access.

- `PUBLIC_BASE_URL` can be set to your public URL, such as `https://botty.example.com`.
- `CORS_ORIGINS` accepts a comma-separated list of allowed browser origins for external frontends.

In this repository's current production-style path, Compose pins the app bind address to localhost explicitly. Treat `.env.local` as the source of public URL and auth policy, not as a way to make the container listen broadly on this host.

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

Security note:

- `LOCAL_AUTH_ENABLED=true` is suitable for local or tightly controlled personal use. If you expose the Botty web app more broadly, disable local auth unless you have another trusted access layer in front of it.
- On enterprise networks, Telegram reachability can be blocked independently of normal web access. A healthy `/api/health` response does not imply Telegram startup will succeed.

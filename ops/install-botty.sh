#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="botty.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_USER="${SUDO_USER:-${USER}}"
TARGET_GROUP="$(id -gn "${TARGET_USER}")"
ENV_FILE="${REPO_DIR}/.env.local"
ENV_TEMPLATE="${REPO_DIR}/.env.example"

print_step() {
  printf '\n[botty-install] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

supports_apt() {
  command -v apt-get >/dev/null 2>&1
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi

  if ! supports_apt; then
    echo "Docker or docker compose plugin is missing, and this script only auto-installs them on apt-based systems." >&2
    echo "Install Docker manually, then rerun this script." >&2
    exit 1
  fi

  print_step "Installing Docker and compose plugin"
  run_as_root apt-get update
  run_as_root apt-get install -y docker.io docker-compose-plugin ca-certificates curl
  run_as_root systemctl enable --now docker
}

ensure_user_in_docker_group() {
  if id -nG "${TARGET_USER}" | tr ' ' '\n' | grep -qx docker; then
    return
  fi

  print_step "Adding ${TARGET_USER} to docker group"
  run_as_root usermod -aG docker "${TARGET_USER}"
  echo "${TARGET_USER} was added to the docker group. A new login session may be required for direct docker usage outside systemd." >&2
}

ensure_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    return
  fi

  print_step "Creating .env.local from template"
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"

  local generated_secret
  generated_secret="$(openssl rand -hex 32)"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${generated_secret}/" "${ENV_FILE}"
  sed -i 's|^LOCAL_LLM_URL=.*|LOCAL_LLM_URL=http://127.0.0.1:11435|' "${ENV_FILE}"

  echo "Created ${ENV_FILE}. Review API keys and Telegram settings before exposing Botty publicly." >&2
}

install_systemd_unit() {
  print_step "Installing ${SERVICE_NAME}"
  run_as_root tee "${SERVICE_PATH}" >/dev/null <<EOF
[Unit]
Description=Botty application service
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
User=${TARGET_USER}
Group=${TARGET_GROUP}
SupplementaryGroups=docker
WorkingDirectory=${REPO_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${ENV_FILE}
ExecStartPre=/usr/bin/docker compose -f ${REPO_DIR}/docker-compose.yml up -d postgres ollama
ExecStart=/usr/bin/docker compose -f ${REPO_DIR}/docker-compose.yml up app
ExecStop=/usr/bin/docker compose -f ${REPO_DIR}/docker-compose.yml stop app postgres ollama
ExecStopPost=/usr/bin/docker compose -f ${REPO_DIR}/docker-compose.yml rm -f app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  run_as_root systemctl daemon-reload
  run_as_root systemctl enable "${SERVICE_NAME}"
}

start_botty() {
  print_step "Starting Botty"
  run_as_root systemctl restart "${SERVICE_NAME}"
}

show_status() {
  print_step "Waiting for Botty health endpoint"
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  print_step "Botty service summary"
  run_as_root systemctl --no-pager --lines=20 status "${SERVICE_NAME}" || true
  echo
  docker compose -f "${REPO_DIR}/docker-compose.yml" ps || true
  echo
  curl -fsS http://127.0.0.1:5000/api/health || true
}

main() {
  require_command openssl
  require_command curl
  require_command systemctl

  if [[ ! -f "${ENV_TEMPLATE}" ]]; then
    echo "Could not find ${ENV_TEMPLATE}" >&2
    exit 1
  fi

  ensure_docker
  ensure_user_in_docker_group
  ensure_env_file
  install_systemd_unit
  start_botty
  show_status
}

main "$@"
#!/usr/bin/env bash

set -euo pipefail

SERVICE_NAME="botty.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPO_DIR}/docker-compose.yml"
HOST_RESOLVER_PATH="/run/systemd/resolve/resolv.conf"
TARGET_USER="${SUDO_USER:-${USER}}"
TARGET_GROUP=""
ENV_FILE_DEFAULT="${REPO_DIR}/.env.local"
ENV_FILE="${ENV_FILE_DEFAULT}"
ENV_TEMPLATE="${REPO_DIR}/.env.example"
AUTO_INSTALL_DOCKER=1
START_SERVICE=1
DOCKER_BIN=""

show_usage() {
  cat <<EOF
Usage: bash ops/install-botty.sh [options]

Options:
  --no-start              Install/update service but do not start Botty
  --skip-docker-install   Require Docker to already be installed
  --user USER             Run the systemd service as USER
  --env-file PATH         Use a specific env file instead of .env.local
  --help                  Show this help text
EOF
}

print_step() {
  printf '\n[botty-install] %s\n' "$1"
}

warn() {
  printf '[botty-install] warning: %s\n' "$1" >&2
}

fail() {
  printf '[botty-install] error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
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

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-start)
        START_SERVICE=0
        ;;
      --skip-docker-install)
        AUTO_INSTALL_DOCKER=0
        ;;
      --user)
        [[ $# -ge 2 ]] || fail "--user requires a value"
        TARGET_USER="$2"
        shift
        ;;
      --env-file)
        [[ $# -ge 2 ]] || fail "--env-file requires a value"
        case "$2" in
          /*) ENV_FILE="$2" ;;
          *) ENV_FILE="${REPO_DIR}/$2" ;;
        esac
        shift
        ;;
      --help)
        show_usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
    shift
  done
}

resolve_target_account() {
  id -u "${TARGET_USER}" >/dev/null 2>&1 || fail "User does not exist: ${TARGET_USER}"
  TARGET_GROUP="$(id -gn "${TARGET_USER}")"
}

resolve_docker_bin() {
  DOCKER_BIN="$(command -v docker || true)"
  [[ -n "${DOCKER_BIN}" ]] || fail "Could not resolve docker binary path"
}

ensure_compose_prerequisites() {
  [[ -f "${COMPOSE_FILE}" ]] || fail "Could not find ${COMPOSE_FILE}"

  if [[ ! -r "${HOST_RESOLVER_PATH}" ]]; then
    fail "Missing ${HOST_RESOLVER_PATH}. The current docker-compose.yml mounts this resolver file into the app and ollama containers to keep DNS working on restricted networks. Enable systemd-resolved on this host or update the Compose runtime before continuing."
  fi
}

read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

append_env_value_if_missing() {
  local key="$1"
  local value="$2"

  if grep -Eq "^${key}=" "${ENV_FILE}"; then
    return
  fi

  printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
}

env_value_is_truthy() {
  case "${1,,}" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_env_file() {
  print_step "Validating runtime configuration"

  local jwt_secret
  local local_auth_enabled
  local telegram_enabled
  local telegram_token
  local public_base_url
  local gemini_api_key

  jwt_secret="$(read_env_value JWT_SECRET)"
  local_auth_enabled="$(read_env_value LOCAL_AUTH_ENABLED)"
  telegram_enabled="$(read_env_value TELEGRAM_BOT_ENABLED)"
  telegram_token="$(read_env_value TELEGRAM_BOT_TOKEN)"
  public_base_url="$(read_env_value PUBLIC_BASE_URL)"
  gemini_api_key="$(read_env_value GEMINI_API_KEY)"

  [[ -n "${jwt_secret}" ]] || fail "JWT_SECRET is missing from ${ENV_FILE}"
  [[ "${jwt_secret}" != "your-super-secret-jwt-key-change-this-in-production" ]] || fail "JWT_SECRET is still using the example placeholder in ${ENV_FILE}"

  if [[ -n "${public_base_url}" && ! "${public_base_url}" =~ ^https?:// ]]; then
    fail "PUBLIC_BASE_URL must start with http:// or https://"
  fi

  if { [[ -z "${telegram_enabled}" ]] || env_value_is_truthy "${telegram_enabled}"; } && [[ -z "${telegram_token}" ]]; then
    warn "TELEGRAM_BOT_ENABLED is true but TELEGRAM_BOT_TOKEN is empty; the web app will still run, but Telegram will stay unconfigured"
  fi

  if [[ "${gemini_api_key}" == "MY_GEMINI_API_KEY" ]]; then
    warn "GEMINI_API_KEY is still using the example placeholder; hosted Gemini requests will fail until you set a real key or clear the value"
  fi

  if [[ -z "$(read_env_value CORS_ORIGINS)" && -n "${public_base_url}" ]]; then
    warn "CORS_ORIGINS is empty; Botty will still allow PUBLIC_BASE_URL automatically, but add explicit origins if you front the API from additional domains"
  fi

  if [[ -n "${public_base_url}" ]] && env_value_is_truthy "${local_auth_enabled}"; then
    warn "LOCAL_AUTH_ENABLED is true while PUBLIC_BASE_URL is set. Local auth is intended for trusted personal deployments only; disable it before broader public exposure."
  fi
}

sync_env_file_defaults() {
  local current_local_llm_url

  append_env_value_if_missing PUBLIC_BASE_URL ""
  append_env_value_if_missing CORS_ORIGINS ""
  append_env_value_if_missing TELEGRAM_BOT_TOKEN ""
  append_env_value_if_missing TELEGRAM_BOT_ENABLED "true"
  append_env_value_if_missing TELEGRAM_ALLOWED_CHAT_IDS ""
  append_env_value_if_missing TELEGRAM_PROVIDER "auto"
  append_env_value_if_missing TELEGRAM_MODEL ""

  current_local_llm_url="$(read_env_value LOCAL_LLM_URL)"
  if [[ -z "${current_local_llm_url}" || "${current_local_llm_url}" == "http://localhost:11434" ]]; then
    sed -i 's|^LOCAL_LLM_URL=.*|LOCAL_LLM_URL=http://127.0.0.1:11435|' "${ENV_FILE}"
  fi
}

build_app_image() {
  print_step "Building Botty app image"
  warn "This build reuses the host resolver path because some enterprise networks break Docker's default DNS behavior."
  run_as_root "${DOCKER_BIN}" compose -f "${COMPOSE_FILE}" build app
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    resolve_docker_bin
    return
  fi

  if [[ "${AUTO_INSTALL_DOCKER}" -eq 0 ]]; then
    fail "Docker or docker compose plugin is missing and --skip-docker-install was requested"
  fi

  if ! supports_apt; then
    fail "Docker or docker compose plugin is missing, and this script only auto-installs them on apt-based systems. Install Docker manually, then rerun this script."
  fi

  print_step "Installing Docker and compose plugin"
  warn "This installer uses distro packages via apt-get. If your distro's Docker packages are stale, install Docker from the official Docker repository and rerun this script."
  run_as_root apt-get update
  run_as_root apt-get install -y docker.io docker-compose-plugin ca-certificates curl
  run_as_root systemctl enable --now docker
  resolve_docker_bin
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

  print_step "Creating $(basename "${ENV_FILE}") from template"
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"

  local generated_secret
  generated_secret="$(openssl rand -hex 32)"
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${generated_secret}/" "${ENV_FILE}"
  sed -i 's|^LOCAL_LLM_URL=.*|LOCAL_LLM_URL=http://127.0.0.1:11435|' "${ENV_FILE}"

  echo "Created ${ENV_FILE}. Review API keys and Telegram settings before exposing Botty publicly." >&2
}

write_systemd_unit() {
  cat <<EOF
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
ExecStartPre=${DOCKER_BIN} compose -f ${COMPOSE_FILE} up -d postgres ollama
ExecStart=${DOCKER_BIN} compose -f ${COMPOSE_FILE} up app
ExecStop=${DOCKER_BIN} compose -f ${COMPOSE_FILE} stop app
ExecStopPost=-${DOCKER_BIN} compose -f ${COMPOSE_FILE} rm -f app
Restart=always
RestartSec=5
TimeoutStartSec=0
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF
}

install_systemd_unit() {
  print_step "Installing ${SERVICE_NAME}"

  local temp_unit
  temp_unit="$(mktemp)"
  write_systemd_unit > "${temp_unit}"

  if run_as_root test -f "${SERVICE_PATH}"; then
    if run_as_root cmp -s "${temp_unit}" "${SERVICE_PATH}"; then
      print_step "Existing ${SERVICE_NAME} is unchanged"
    else
      local backup_path
      backup_path="${SERVICE_PATH}.$(date +%Y%m%d%H%M%S).bak"
      run_as_root cp "${SERVICE_PATH}" "${backup_path}"
      run_as_root cp "${temp_unit}" "${SERVICE_PATH}"
      print_step "Updated ${SERVICE_NAME} and backed up the previous unit to ${backup_path}"
    fi
  else
    run_as_root cp "${temp_unit}" "${SERVICE_PATH}"
  fi

  rm -f "${temp_unit}"

  run_as_root systemctl daemon-reload
  run_as_root systemctl enable "${SERVICE_NAME}"
}

start_botty() {
  print_step "Starting Botty"
  run_as_root systemctl restart "${SERVICE_NAME}"
}

show_runtime_diagnostics() {
  print_step "Botty diagnostics"
  run_as_root systemctl --no-pager --lines=40 status "${SERVICE_NAME}" || true
  echo
  run_as_root "${DOCKER_BIN}" compose -f "${COMPOSE_FILE}" ps || true
  echo
  run_as_root "${DOCKER_BIN}" compose -f "${COMPOSE_FILE}" logs --tail=80 app postgres ollama || true
}

show_status() {
  print_step "Waiting for Botty health endpoint"
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:5000/api/health >/dev/null 2>&1; then
      print_step "Botty is healthy"
      curl -fsS http://127.0.0.1:5000/api/health
      echo
      return 0
    fi
    sleep 2
  done

  show_runtime_diagnostics
  fail "Timed out waiting for http://127.0.0.1:5000/api/health"
}

print_post_install_notes() {
  print_step "Post-install checklist"
  cat <<EOF
- Runtime env file: ${ENV_FILE}
- Service management: sudo systemctl restart ${SERVICE_NAME}
- Health check: curl http://127.0.0.1:5000/api/health
- Container status: ${DOCKER_BIN} compose -f ${COMPOSE_FILE} ps
- Runtime model: host networking with localhost-only binds for app, postgres, and ollama
- Review provider API keys in ${ENV_FILE} before using hosted models
- Set TELEGRAM_BOT_TOKEN in ${ENV_FILE} if you want Telegram enabled
- Set PUBLIC_BASE_URL and review ops/REVERSE_PROXY.md before public exposure
- On enterprise networks, outbound DNS and Telegram access may still be restricted even when Botty itself is healthy
EOF
}

main() {
  parse_args "$@"
  require_command openssl
  require_command curl
  require_command systemctl
  resolve_target_account
  ensure_compose_prerequisites

  if [[ ! -f "${ENV_TEMPLATE}" ]]; then
    fail "Could not find ${ENV_TEMPLATE}"
  fi

  ensure_docker
  ensure_user_in_docker_group
  ensure_env_file
  sync_env_file_defaults
  validate_env_file
  build_app_image
  install_systemd_unit

  if [[ "${START_SERVICE}" -eq 1 ]]; then
    start_botty
    show_status
  else
    print_step "Skipping service start because --no-start was requested"
  fi

  print_post_install_notes
}

main "$@"
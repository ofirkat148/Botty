#!/usr/bin/env bash
# ops/backup-db.sh — Botty PostgreSQL backup
#
# Usage:
#   bash ops/backup-db.sh [--dir /path/to/backups] [--keep N]
#
# Defaults:
#   --dir   $BOTTY_BACKUP_DIR or ~/botty-backups
#   --keep  $BOTTY_BACKUP_KEEP or 7 (days of daily backups to retain)
#
# Reads DATABASE_URL from .env.local in the repo root if not already set.
# Runs pg_dump inside the running postgres container to avoid needing a
# host-side pg_dump binary, then copies the dump out via docker cp.
#
# Cron example (daily at 03:00):
#   0 3 * * * /home/you/Botty/ops/backup-db.sh >> /var/log/botty-backup.log 2>&1

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REPO_DIR}/docker-compose.yml"
BACKUP_DIR="${BOTTY_BACKUP_DIR:-${HOME}/botty-backups}"
KEEP_DAYS="${BOTTY_BACKUP_KEEP:-7}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)  BACKUP_DIR="$2"; shift ;;
    --keep) KEEP_DAYS="$2";  shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
  shift
done

# Load DATABASE_URL from .env.local if not already set
if [[ -z "${DATABASE_URL:-}" && -f "${REPO_DIR}/.env.local" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${REPO_DIR}/.env.local" | tail -n1 | cut -d= -f2-)"
fi

# Parse connection details from DATABASE_URL
# Expected format: postgresql://user:pass@host:port/dbname
if [[ -n "${DATABASE_URL:-}" ]]; then
  DB_USER="$(echo "${DATABASE_URL}" | sed -E 's|postgresql://([^:]+):.*|\1|')"
  DB_PASS="$(echo "${DATABASE_URL}" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')"
  DB_NAME="$(echo "${DATABASE_URL}" | sed -E 's|.*/([^?]+).*|\1|')"
else
  DB_USER="${POSTGRES_USER:-botty_user}"
  DB_PASS="${POSTGRES_PASSWORD:-botty_pass}"
  DB_NAME="${POSTGRES_DB:-botty_db}"
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_FILENAME="botty_${DB_NAME}_${TIMESTAMP}.sql.gz"
DUMP_PATH="${BACKUP_DIR}/${DUMP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[botty-backup] Starting backup → ${DUMP_PATH}"

# Find the running postgres container from this compose project
CONTAINER="$(docker compose -f "${COMPOSE_FILE}" ps -q postgres 2>/dev/null | head -n1)"
if [[ -z "${CONTAINER}" ]]; then
  echo "[botty-backup] error: postgres container is not running" >&2
  exit 1
fi

# Dump inside the container (avoids host pg_dump version mismatch), pipe gzip on host
docker exec -e PGPASSWORD="${DB_PASS}" "${CONTAINER}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-password --clean --if-exists \
  | gzip -9 > "${DUMP_PATH}"

DUMP_SIZE="$(du -sh "${DUMP_PATH}" | cut -f1)"
echo "[botty-backup] Backup complete: ${DUMP_FILENAME} (${DUMP_SIZE})"

# Rotate: delete dumps older than KEEP_DAYS days
DELETED=0
while IFS= read -r -d '' old_file; do
  rm -f "${old_file}"
  echo "[botty-backup] Deleted old backup: $(basename "${old_file}")"
  DELETED=$((DELETED + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'botty_*.sql.gz' -mtime "+${KEEP_DAYS}" -print0)

[[ "${DELETED}" -gt 0 ]] || echo "[botty-backup] No old backups to rotate (keep=${KEEP_DAYS} days)"
echo "[botty-backup] Done."

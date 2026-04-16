#!/usr/bin/env bash
# ops/backup-db.sh — Botty SQLite backup
#
# Usage:
#   bash ops/backup-db.sh [--dir /path/to/backups] [--keep N]
#
# Defaults:
#   --dir   $BOTTY_BACKUP_DIR or ~/botty-backups
#   --keep  $BOTTY_BACKUP_KEEP or 7 (days of daily backups to retain)
#
# Reads DATABASE_PATH from .env.local in the repo root if not already set.
#
# Cron example (daily at 03:00):
#   0 3 * * * /home/you/Botty/ops/backup-db.sh >> /var/log/botty-backup.log 2>&1

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

# Load DATABASE_PATH from .env.local if not already set
if [[ -z "${DATABASE_PATH:-}" && -f "${REPO_DIR}/.env.local" ]]; then
  DATABASE_PATH="$(grep -E '^DATABASE_PATH=' "${REPO_DIR}/.env.local" | tail -n1 | cut -d= -f2-)"
fi

DB_PATH="${DATABASE_PATH:-${REPO_DIR}/data/botty.db}"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "[botty-backup] error: database file not found: ${DB_PATH}" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILENAME="botty_${TIMESTAMP}.db"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[botty-backup] Starting backup → ${BACKUP_PATH}"
cp "${DB_PATH}" "${BACKUP_PATH}"

BACKUP_SIZE="$(du -sh "${BACKUP_PATH}" | cut -f1)"
echo "[botty-backup] Backup complete: ${BACKUP_FILENAME} (${BACKUP_SIZE})"

# Rotate: delete backups older than KEEP_DAYS days
DELETED=0
while IFS= read -r -d '' old_file; do
  rm -f "${old_file}"
  echo "[botty-backup] Deleted old backup: $(basename "${old_file}")"
  DELETED=$((DELETED + 1))
done < <(find "${BACKUP_DIR}" -maxdepth 1 -name 'botty_*.db' -mtime "+${KEEP_DAYS}" -print0)

if [[ ${DELETED} -gt 0 ]]; then
  echo "[botty-backup] Rotated ${DELETED} old backup(s)"
fi

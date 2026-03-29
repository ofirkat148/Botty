#!/bin/sh

set -eu

cd /app

mkdir -p node_modules

echo '[botty] startup: configuring npm'
npm config set fetch-timeout 120000
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set fetch-retries 5
npm config set maxsockets 4

lockfile_hash=$(sha256sum package-lock.json | awk '{print $1}')
cached_hash=$(cat node_modules/.botty-package-lock.sha256 2>/dev/null || true)

if [ ! -x node_modules/.bin/vite ] || [ ! -x node_modules/.bin/tsx ] || [ "$lockfile_hash" != "$cached_hash" ]; then
  echo '[botty] startup: installing dependencies'
  rm -rf node_modules/* node_modules/.[!.]* node_modules/..?* 2>/dev/null || true

  attempt=1
  while [ "$attempt" -le 6 ]; do
    echo "[botty] startup: npm install attempt ${attempt}/6"
    if npm install --prefer-offline --no-audit; then
      printf '%s' "$lockfile_hash" > node_modules/.botty-package-lock.sha256
      break
    fi

    if [ "$attempt" -eq 6 ]; then
      echo '[botty] startup: npm install failed after 6 attempts'
      exit 1
    fi

    sleep_seconds=$((attempt * 5))
    echo "[botty] startup: npm install failed, retrying in ${sleep_seconds}s"
    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done
else
  echo '[botty] startup: reusing cached dependencies'
fi

echo '[botty] startup: building frontend'
npm run build

echo '[botty] startup: launching server'
exec npm run start
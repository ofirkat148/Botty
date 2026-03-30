#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "$repo_root" ]]; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

cd "$repo_root"

repo_name="$(basename "$repo_root")"
timestamp="$(date +%Y%m%d-%H%M%S)"
default_output="$repo_root/${repo_name}-${timestamp}.bundle"
output_path="${1:-$default_output}"

echo "Preparing bundle from: $repo_root"

if git remote get-url origin >/dev/null 2>&1; then
  echo "Fetching latest refs from origin"
  git fetch origin --prune
else
  echo "No origin remote configured; exporting local refs only"
fi

echo "Writing bundle to: $output_path"
git bundle create "$output_path" --all

if command -v sha256sum >/dev/null 2>&1; then
  checksum_path="${output_path}.sha256"
  sha256sum "$output_path" > "$checksum_path"
  echo "Wrote checksum: $checksum_path"
fi

cat <<EOF

Bundle created successfully.

To use it from an approved machine or network:

  git clone "$output_path" ${repo_name}-push
  cd ${repo_name}-push
  git remote add github <your-github-repo-url>
  git push github --all
  git push github --tags

If the target repo already exists:

  git remote add bundle "$output_path"
  git fetch bundle '*:*'
  git push github --all
  git push github --tags

EOF
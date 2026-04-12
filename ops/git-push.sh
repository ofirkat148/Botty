#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
remote_name="${1:-origin}"
branch_name="${2:-$(git branch --show-current 2>/dev/null || true)}"
push_tags="${3:-}"

if [[ -z "$repo_root" ]]; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

if [[ -z "$branch_name" ]]; then
  echo "error: could not determine current branch" >&2
  exit 1
fi

cd "$repo_root"

if ! git remote get-url "$remote_name" >/dev/null 2>&1; then
  echo "error: remote '$remote_name' is not configured" >&2
  exit 1
fi

echo "Pushing $branch_name to $remote_name"
git push -u "$remote_name" "$branch_name"

if [[ "$push_tags" == "--tags" ]]; then
  echo "Pushing tags to $remote_name"
  git push "$remote_name" --tags
fi

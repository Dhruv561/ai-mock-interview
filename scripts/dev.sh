#!/usr/bin/env bash
# Runs backend (uv) + extension dev build (npm) concurrently for local
# development. See README.md and architecture.md §S.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev] starting backend on :8000"
(cd "$ROOT_DIR/backend" && uv run uvicorn app.main:app --reload --port 8000) &

echo "[dev] starting extension build watcher"
(cd "$ROOT_DIR" && npm run --workspace extension dev) &

wait

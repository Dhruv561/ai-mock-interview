#!/usr/bin/env bash
# Lint + typecheck + test + build, both projects. Run before considering a
# slice of work done (CLAUDE.md workflow step 5).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> extension: typecheck"
npm run --workspace extension typecheck

echo "==> extension: lint"
npm run --workspace extension lint

echo "==> extension: test"
npm run --workspace extension test

echo "==> extension: build"
npm run --workspace extension build

echo "==> extension: secret tripwire"
# CLAUDE.md §7 / architecture.md §U: no provider secret may ever ship in the
# built extension bundle. Backend-only env var names should never appear
# there at all (Vite only inlines VITE_-prefixed vars into client code, and
# none of these are) — a hit here means something imported backend code, a
# stray hardcoded fallback, or a leaked .env value, not a false positive to
# explain away.
SECRET_PATTERNS=(
  "ANTHROPIC_API_KEY"
  "DEEPGRAM_API_KEY"
  "ELEVENLABS_API_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "SUPABASE_URL"
  "DATABASE_URL"
)
for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -rl "$pattern" "$ROOT_DIR/extension/dist" >/dev/null 2>&1; then
    echo "SECRET TRIPWIRE FAILED: '$pattern' found in extension/dist" >&2
    grep -rl "$pattern" "$ROOT_DIR/extension/dist" >&2
    exit 1
  fi
done

echo "==> backend: lint"
(cd "$ROOT_DIR/backend" && uv run ruff check .)

echo "==> backend: test"
(cd "$ROOT_DIR/backend" && uv run pytest -q)

echo "==> all checks passed"

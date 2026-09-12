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

echo "==> backend: lint"
(cd "$ROOT_DIR/backend" && uv run ruff check .)

echo "==> backend: test"
(cd "$ROOT_DIR/backend" && uv run pytest -q)

echo "==> all checks passed"

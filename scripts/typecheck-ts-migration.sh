#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_typecheck() {
  local label="$1"
  local dir="$2"
  echo "[typecheck] ${label}"
  (cd "${ROOT}/${dir}" && npm run typecheck --silent)
}

echo "[guardrail] ts migration docs/config"
node "${ROOT}/scripts/check-ts-migration-guardrails.mjs"

run_typecheck "common agent-observability contract" "skills/common/pipeline/agent-observability"
run_typecheck "nova pipeline TypeScript islands" "skills/nova"
run_typecheck "buster pipeline TypeScript islands" "skills/buster"

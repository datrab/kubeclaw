#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACT_PATH="$REPO_DIR/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md"
source "$REPO_DIR/tests/verification/lib/verification-shell.sh"

TEMP_DIR="$(mktemp -d)"
export VERIFICATION_OUTPUT_DIR="$TEMP_DIR"
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
  "$REPO_DIR/tests/verification/lib/cleanup-home-artifacts.sh"
}
trap cleanup EXIT

verification_parse_common_args "$@"

if ! command -v node >/dev/null 2>&1; then
  echo "[full-verification] missing required command: node" >&2
  exit 1
fi

if ! command -v helm >/dev/null 2>&1; then
  echo "[full-verification] missing required command: helm" >&2
  exit 1
fi

if ! command -v kubeconform >/dev/null 2>&1; then
  echo "[full-verification] missing required command: kubeconform" >&2
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    ln -sf "$(command -v python3)" "$TEMP_DIR/python"
    export PATH="$TEMP_DIR:$PATH"
    echo "[full-verification] WARNING: python not found, temporarily aliasing python -> python3" >&2
  else
    echo "[full-verification] missing required command: python (or python3)" >&2
    exit 1
  fi
fi

run_step() {
  local label="$1"
  local status
  shift
  verification_run_step "full-verification" "$label" "$@" || status=$?
  if [[ "${status:-0}" != "0" ]]; then
    exit "$status"
  fi
}

cd "$REPO_DIR"
export REPO_ROOT="$REPO_DIR"
if [[ -z "${OPENCLAW_GATEWAY_URL:-}" && -n "${OPENCLAW_GATEWAY_PORT:-}" ]]; then
  export OPENCLAW_GATEWAY_URL="http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}"
fi
"$REPO_DIR/tests/verification/lib/cleanup-home-artifacts.sh"

run_step "canonical real pipeline e2e: full" \
  node tests/verification/e2e/run-real-pipeline-e2e.mjs \
  --mode full

run_step "canonical real pipeline e2e: retry success" \
  node tests/verification/e2e/run-real-pipeline-e2e.mjs \
  --mode full \
  --scenario forge-retry-then-success

run_step "canonical real pipeline e2e: failure matrix" \
  node tests/verification/e2e/run-real-pipeline-failure-matrix.mjs \
  --mode full

run_step "deployment truth" \
  node tests/verification/deployment/check-deployment-truth.mjs \
  --source-root "$REPO_DIR"

run_step "runtime collisions" \
  node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root "$REPO_DIR"

run_step "final-gate hardening" \
  node tests/verification/runtime/check-final-gate-hardening.mjs \
  --source-root "$REPO_DIR"

run_step "nova startup smoke" \
  node tests/verification/runtime/check-nova-startup-smoke.mjs \
  --source-root "$REPO_DIR"

run_step "buster startup smoke" \
  node tests/verification/runtime/check-buster-startup-smoke.mjs \
  --source-root "$REPO_DIR"

run_step "subagent launch" \
  node tests/verification/runtime/check-subagent-launch.mjs

run_step "ACP launch" \
  tests/verification/run-local-acp-verification.sh \
  --model "${FULL_VERIFICATION_ACP_MODEL:-gpt-5-codex}" \
  --agent-id "${FULL_VERIFICATION_ACP_AGENT_ID:-codex}"

run_step "live Redis backend smoke" \
  env LIVE_REDIS_SMOKE_REQUIRED=1 node tests/verification/live/redis-backend-smoke.mjs

run_step "deterministic contract suite" \
  tests/verification/lib/run-contract-suite.sh \
  --source-root "$REPO_DIR" \
  --contract "$CONTRACT_PATH" \
  --label-prefix "full-verification"

run_step "docs check" \
  npm run docs:check

run_step "whitespace check" \
  git diff --check

run_step "behavior harness" \
  node tests/verification/behavior/verify.mjs \
  --source-root "$REPO_DIR" \
  --contract "$CONTRACT_PATH"

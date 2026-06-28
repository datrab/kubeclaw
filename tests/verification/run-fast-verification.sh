#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACT_PATH="$REPO_DIR/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md"
BEHAVIOR_AREAS="${BEHAVIOR_AREAS:-foundations,runtime-surface,redaction-surface,shell-boundary}"
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
  echo "[fast-verification] missing required command: node" >&2
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    ln -sf "$(command -v python3)" "$TEMP_DIR/python"
    export PATH="$TEMP_DIR:$PATH"
    echo "[fast-verification] WARNING: python not found, temporarily aliasing python -> python3" >&2
  else
    echo "[fast-verification] missing required command: python (or python3)" >&2
    exit 1
  fi
fi

run_step() {
  local label="$1"
  local status
  shift
  verification_run_step "fast-verification" "$label" "$@" || status=$?
  if [[ "${status:-0}" != "0" ]]; then
    exit "$status"
  fi
}

cd "$REPO_DIR"
export REPO_ROOT="$REPO_DIR"
"$REPO_DIR/tests/verification/lib/cleanup-home-artifacts.sh"

run_step "canonical real pipeline e2e: fast" \
  node tests/verification/e2e/run-real-pipeline-e2e.mjs \
  --mode fast

run_step "nova startup smoke" \
  node tests/verification/runtime/check-nova-startup-smoke.mjs \
  --source-root "$REPO_DIR"

run_step "buster startup smoke" \
  node tests/verification/runtime/check-buster-startup-smoke.mjs \
  --source-root "$REPO_DIR"

run_step "runtime collisions" \
  node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root "$REPO_DIR"

run_step "final-gate hardening" \
  node tests/verification/runtime/check-final-gate-hardening.mjs \
  --source-root "$REPO_DIR"

run_step "deterministic contract suite" \
  tests/verification/lib/run-contract-suite.sh \
  --source-root "$REPO_DIR" \
  --contract "$CONTRACT_PATH" \
  --label-prefix "fast-verification"

run_step "docs check" \
  npm run docs:check

if [[ "${SKIP_FAST_BEHAVIOR:-0}" != "1" ]]; then
  run_step "behavior fast areas: $BEHAVIOR_AREAS" \
    node tests/verification/behavior/verify.mjs \
    --source-root "$REPO_DIR" \
    --contract "$CONTRACT_PATH" \
    --areas "$BEHAVIOR_AREAS"
else
  if verification_verbose_enabled; then
    echo ""
    echo "[fast-verification] skipping behavior areas because SKIP_FAST_BEHAVIOR=1"
  fi
fi

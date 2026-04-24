#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONTRACT_PATH="$REPO_DIR/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md"

TEMP_DIR=""
cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

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
    TEMP_DIR="$(mktemp -d)"
    ln -sf "$(command -v python3)" "$TEMP_DIR/python"
    export PATH="$TEMP_DIR:$PATH"
    echo "[full-verification] python not found, temporarily aliasing python -> python3"
  else
    echo "[full-verification] missing required command: python (or python3)" >&2
    exit 1
  fi
fi

run_step() {
  local label="$1"
  shift
  echo ""
  echo "[full-verification] === $label ==="
  "$@"
}

cd "$REPO_DIR"

run_step "deployment truth" \
  node tests/verification/deployment/check-deployment-truth.mjs \
  --source-root "$REPO_DIR"

run_step "runtime collisions" \
  node tests/verification/runtime/check-runtime-collisions.mjs \
  --source-root "$REPO_DIR"

run_step "final-gate hardening" \
  node tests/verification/runtime/check-final-gate-hardening.mjs \
  --source-root "$REPO_DIR"

run_step "subagent launch" \
  node tests/verification/runtime/check-subagent-launch.mjs

run_step "ACP launch reachability" \
  node tests/verification/runtime/check-acp-launch.mjs

run_step "telemetry contract" \
  node tests/verification/contracts/check-telemetry-contract.mjs \
  --source-root "$REPO_DIR" \
  --contract "$CONTRACT_PATH"

run_step "buster operator surface" \
  node tests/verification/contracts/check-buster-operator-surface.mjs \
  --source-root "$REPO_DIR"

run_step "redis log ownership" \
  node tests/verification/contracts/check-redis-log-ownership.mjs \
  --source-root "$REPO_DIR"

run_step "gate active-session surface" \
  node tests/verification/contracts/check-gate-active-session-surface.mjs \
  --source-root "$REPO_DIR"

run_step "gate fix scaffold surface" \
  node tests/verification/contracts/check-gate-fix-scaffold-surface.mjs \
  --source-root "$REPO_DIR"

run_step "gate control-result surface" \
  node tests/verification/contracts/check-gate-control-result-surface.mjs \
  --source-root "$REPO_DIR"

run_step "worker control-result surface" \
  node tests/verification/contracts/check-worker-control-result-surface.mjs \
  --source-root "$REPO_DIR"

run_step "generator result surface" \
  node tests/verification/contracts/check-generator-result-surface.mjs \
  --source-root "$REPO_DIR"

run_step "pipeline entrypoint shim surface" \
  node tests/verification/contracts/check-pipeline-entrypoint-shim-surface.mjs \
  --source-root "$REPO_DIR"

run_step "common helper import surface" \
  node tests/verification/contracts/check-common-helper-import-surface.mjs \
  --source-root "$REPO_DIR"

run_step "module-runner slice surface" \
  node tests/verification/contracts/check-module-runner-slice-surface.mjs \
  --source-root "$REPO_DIR"

run_step "rate-limit slice surface" \
  node tests/verification/contracts/check-rate-limit-slice-surface.mjs \
  --source-root "$REPO_DIR"

run_step "buster-pipeline slice surface" \
  node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs \
  --source-root "$REPO_DIR"

run_step "pipeline-runner slice surface" \
  node tests/verification/contracts/check-pipeline-runner-slice-surface.mjs \
  --source-root "$REPO_DIR"

run_step "remediable gate engine surface" \
  node tests/verification/contracts/check-remediation-handoff-surface.mjs \
  --source-root "$REPO_DIR"

run_step "stage-envelope primitives surface" \
  node tests/verification/contracts/check-stage-envelope-primitives-surface.mjs \
  --source-root "$REPO_DIR"

run_step "status-store slice surface" \
  node tests/verification/contracts/check-status-store-slice-surface.mjs \
  --source-root "$REPO_DIR"

run_step "behavior harness" \
  node tests/verification/behavior/verify.mjs \
  --source-root "$REPO_DIR" \
  --contract "$CONTRACT_PATH"

echo ""
echo "[full-verification] all verification surfaces passed"

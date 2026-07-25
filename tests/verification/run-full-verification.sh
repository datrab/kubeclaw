#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/verification-shell.sh"
verification_initialize "full-verification" "$SCRIPT_DIR" "$@"
verification_require_command node
verification_require_command helm
verification_require_command kubeconform
verification_ensure_python

cd "$REPO_DIR"
export REPO_ROOT="$REPO_DIR"
if [[ -z ${OPENCLAW_GATEWAY_URL:-} && -n ${OPENCLAW_GATEWAY_PORT:-} ]]; then
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

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/verification-shell.sh"
verification_initialize "fast-verification" "$SCRIPT_DIR" "$@"
verification_require_command node
verification_ensure_python

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

run_step "agent skill bundles" \
  node tests/verification/runtime/check-agent-skill-bundles.mjs \
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

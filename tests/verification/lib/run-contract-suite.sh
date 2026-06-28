#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE_ROOT="$REPO_DIR"
CONTRACT_PATH="$REPO_DIR/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md"
LABEL_PREFIX="contract-suite"
LIST_ONLY=0

CONTRACTS=(
  check-buster-operator-surface.mjs
  check-buster-repo-scoped-paths.mjs
  check-nova-buster-task-envelope-acceptance.mjs
  check-redis-task-lifecycle-acceptance.mjs
  check-redis-completion-selection-acceptance.mjs
  check-buster-output-artifact-acceptance.mjs
  check-artifact-authority-matrix-acceptance.mjs
  check-lifecycle-read-model-replay-acceptance.mjs
  check-gate-evidence-authority-acceptance.mjs
  check-manual-degraded-terminal-acceptance.mjs
  check-suite-timeout-config-acceptance.mjs
  check-notification-operator-identity-acceptance.mjs
  check-capability-env-degradation-acceptance.mjs
  check-deploy-runtime-gate-acceptance.mjs
  check-restart-session-recovery-acceptance.mjs
  check-buster-verify-task-scope.mjs
  check-redis-log-ownership.mjs
  check-redis-completion-service-surface.mjs
  check-redis-transport-policy.mjs
  check-gate-active-session-surface.mjs
  check-gate-fix-scaffold-surface.mjs
  check-gate-control-result-surface.mjs
  check-worker-control-result-surface.mjs
  check-pipeline-step-result-surface.mjs
  check-generator-result-surface.mjs
  check-validator-control-result-surface.mjs
  check-pipeline-entrypoint-shim-surface.mjs
  check-prompt-ingress-surface.mjs
  check-acp-gateway-contract-surface.mjs
  check-agent-observability-contract.mjs
  check-openclaw-agent-observer-plugin.mjs
  check-agent-observability-ingester.mjs
  check-agent-observability-parallel-run-evidence.mjs
  check-agent-observability-forge-completion-surface.mjs
  check-gateway-operation-boundary-surface.mjs
  check-common-helper-import-surface.mjs
  check-common-pipeline-facades-surface.mjs
  check-pipeline-complexity-budgets.mjs
  check-strict-cli-args-surface.mjs
  check-blueprint-commit-scope.mjs
  check-module-runner-slice-surface.mjs
  check-rate-limit-slice-surface.mjs
  check-time-budget-surface.mjs
  check-buster-pipeline-slice-surface.mjs
  check-pipeline-runner-slice-surface.mjs
  check-runner-facade-surface.mjs
  check-phase9-unpaired-js-surface.mjs
  check-phase10-paired-facade-surface.mjs
  check-phase10-executable-delegate-surface.mjs
  check-phase10-nova-agent-prompt-runner-facades.mjs
  check-phase10-nova-service-facades.mjs
  check-phase10-nova-tool-adapter-surface.mjs
  check-phase10-final-reference-surface.mjs
  check-remediation-handoff-surface.mjs
  check-stage-envelope-primitives-surface.mjs
  check-status-store-slice-surface.mjs
  check-canonical-pipeline-compat-freeze.mjs
  check-canonical-pipeline-compat-debt-free.mjs
  check-artifact-authority-slice-surface.mjs
  check-observability-catch-reporting.mjs
  check-operator-alert-surface.mjs
  check-critical-dynamic-imports.mjs
  check-session-authority-slice-surface.mjs
  check-session-polling-surface.mjs
  check-verification-wrapper-surface.mjs
  check-implementation-map-sync-surface.mjs
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-root)
      SOURCE_ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    --contract)
      CONTRACT_PATH="$2"
      shift 2
      ;;
    --label-prefix)
      LABEL_PREFIX="$2"
      shift 2
      ;;
    --list)
      LIST_ONLY=1
      shift
      ;;
    *)
      echo "[run-contract-suite] unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$LIST_ONLY" == "1" ]]; then
  echo "check-telemetry-contract.mjs"
  printf '%s\n' "${CONTRACTS[@]}"
  exit 0
fi

run_step() {
  local label="$1"
  shift
  echo ""
  echo "[$LABEL_PREFIX] === $label ==="
  "$@"
}

cd "$SOURCE_ROOT"
export REPO_ROOT="$SOURCE_ROOT"

run_step "telemetry contract" \
  node tests/verification/contracts/check-telemetry-contract.mjs \
  --source-root "$SOURCE_ROOT" \
  --contract "$CONTRACT_PATH"

for contract in "${CONTRACTS[@]}"; do
  run_step "contract: ${contract%.mjs}" \
    node "tests/verification/contracts/$contract" \
    --source-root "$SOURCE_ROOT"
done

#!/usr/bin/env bash
set -euo pipefail

HOME_ROOT="${VERIFICATION_HOME_ROOT:-/home}"
WORKSPACE_ROOT="${VERIFICATION_WORKSPACE_ROOT:-/home/node/.openclaw/workspace}"

if [[ $HOME_ROOT != "/home" ]]; then
  echo "[verification-cleanup] refusing non-/home root: $HOME_ROOT" >&2
  exit 1
fi

if [[ $WORKSPACE_ROOT != "/home/node/.openclaw/workspace" ]]; then
  echo "[verification-cleanup] refusing unexpected workspace root: $WORKSPACE_ROOT" >&2
  exit 1
fi

home_patterns=(
  behavior-poll-dual-*
  buster-gate-completion-*
  buster-gate-runner-*
  debug-poll-*
  buster-prompt-*
  forge-prompt-*
  gate-projection-*
  lint-report-test-*
  module-completion-test-*
  obs-debug-*
  operator-alert-contract-*
  operator-alert-fallback-contract-*
  observability-budget-test-*
  observability-ingester-test-*
  review-prompt-*
  status-store-slice-*
)

workspace_patterns=(
  behavior-poll-dual-*
  debug-poll-*
  status-store-slice-*
)

deleted=0

clean_root() {
  local root="$1"
  shift
  [[ -d $root ]] || return 0
  local pattern
  for pattern in "$@"; do
    while IFS= read -r -d '' path; do
      rm -rf -- "$path"
      deleted=$((deleted + 1))
    done < <(find "$root" -mindepth 1 -maxdepth 1 -type d -name "$pattern" -print0)
  done
}

clean_root "$HOME_ROOT" "${home_patterns[@]}"
clean_root "$WORKSPACE_ROOT" "${workspace_patterns[@]}"

if [[ $deleted -gt 0 ]]; then
  echo "[verification-cleanup] removed $deleted verification artifact(s)"
fi

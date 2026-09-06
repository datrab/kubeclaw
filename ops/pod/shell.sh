#!/usr/bin/env bash
# kubectl exec does not inherit the supervisor's child-process environment.
set -euo pipefail
KUBECLAW_MCP_TOKEN=$(cat /var/run/kubeclaw-ops/bearer/token)
if (( ${#KUBECLAW_MCP_TOKEN} < 32 )); then
  echo 'MCP bearer is missing or too short; check the mounted Secret' >&2
  exit 1
fi
export KUBECLAW_MCP_TOKEN
exec bash "$@"

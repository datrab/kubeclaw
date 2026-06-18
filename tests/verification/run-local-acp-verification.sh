#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[local-acp-verification] missing required command: node" >&2
  exit 1
fi

cd "$REPO_DIR"

echo "[local-acp-verification] ACP launch reachability is a local/provider smoke."
echo "[local-acp-verification] Failures here mean local ACP agent/provider/gateway status setup needs attention."
node tests/verification/runtime/check-acp-launch.mjs "$@"

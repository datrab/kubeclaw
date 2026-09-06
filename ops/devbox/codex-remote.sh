#!/bin/sh
set -eu
KUBECLAW_MCP_TOKEN="$(cat /etc/kubeclaw-ops/client-token)"
export KUBECLAW_MCP_TOKEN
exec /usr/local/bin/codex remote-control

#!/usr/bin/env bash
# Render for GitOps, or bootstrap once. Never deploy a mutable image reference.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
MODE="${1:-render}"
: "${OPS_MCP_IMAGE:?Set OPS_MCP_IMAGE to the tested ghcr.io/datrab/kubeclaw-ops-mcp@sha256 digest}"
[[ "$OPS_MCP_IMAGE" =~ ^ghcr.io/datrab/kubeclaw-ops-mcp@sha256:[a-f0-9]{64}$ ]] || { echo 'A full Ops MCP image digest is required.' >&2; exit 2; }
render() { sed "s|ghcr.io/datrab/kubeclaw-ops-mcp:REQUIRES_DIGEST|$OPS_MCP_IMAGE|g" "$REPO_DIR/my-values/infra/ops-mcp.yaml"; }
case "$MODE" in
  render) render ;;
  apply)
    render | kubectl apply -f -
    kubectl -n kubeclaw rollout status deployment/ops-mcp --timeout=180s
    ;;
  *) echo 'usage: deploy-ops-mcp.sh [render|apply]' >&2; exit 2 ;;
esac

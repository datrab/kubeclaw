#!/usr/bin/env bash
# Render for GitOps, or bootstrap once. Never deploy a mutable image reference.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
MODE="${1:-render}"
TAILSCALE_OPERATOR_NAMESPACE="${TAILSCALE_OPERATOR_NAMESPACE:-tailscale}"
[[ "$TAILSCALE_OPERATOR_NAMESPACE" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ && ${#TAILSCALE_OPERATOR_NAMESPACE} -le 63 ]] || { echo 'Invalid Tailscale operator namespace.' >&2; exit 2; }
render_policies() {
  sed "s|k8s:io.kubernetes.pod.namespace: tailscale$|k8s:io.kubernetes.pod.namespace: $TAILSCALE_OPERATOR_NAMESPACE|" "$REPO_DIR/my-values/infra/ops-mcp-network-policies.yaml"
}
# Policy-only rendering is needed during CNI cutover before restarting Ops.
if [[ "$MODE" == policies ]]; then render_policies; exit 0; fi
: "${OPS_MCP_IMAGE:?Set OPS_MCP_IMAGE to the tested ghcr.io/datrab/kubeclaw-ops-mcp@sha256 digest}"
[[ "$OPS_MCP_IMAGE" =~ ^ghcr.io/datrab/kubeclaw-ops-mcp@sha256:[a-f0-9]{64}$ ]] || { echo 'A full Ops MCP image digest is required.' >&2; exit 2; }
render() {
  render_policies
  printf '\n---\n'
  sed -e "s|ghcr.io/datrab/kubeclaw-ops-mcp:REQUIRES_DIGEST|$OPS_MCP_IMAGE|g" \
      -e "s|kubernetes.io/metadata.name: tailscale$|kubernetes.io/metadata.name: $TAILSCALE_OPERATOR_NAMESPACE|" \
      "$REPO_DIR/my-values/infra/ops-mcp.yaml"
}
case "$MODE" in
  render) render ;;
  apply)
    # In PR #2 the policies are Ops-owned, separate from agent connectivity.
    kubectl get crd ciliumnetworkpolicies.cilium.io >/dev/null
    # Authentication must be provisioned before the new backend starts.
    kubectl -n kubeclaw get secret ops-mcp-auth >/dev/null
    render | kubectl apply -f -
    # Applying a Role does not remove a historical cluster-wide binding.
    # Revoke only this backend's obsolete named grant, never other Ops access.
    kubectl delete clusterrolebinding kubeclaw-ops-mcp-readonly --ignore-not-found
    kubectl delete clusterrole kubeclaw-ops-mcp-readonly --ignore-not-found
    kubectl -n kubeclaw rollout status deployment/ops-mcp --timeout=180s
    ;;
  *) echo 'usage: deploy-ops-mcp.sh [render|policies|apply]' >&2; exit 2 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="${NAMESPACE:-kubeclaw}"
POLICY_FILE="${POLICY_FILE:-$REPO_DIR/my-values/infra/network-policies.yaml}"
MODE="${1:-apply}"

command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }
kubectl get crd ciliumnetworkpolicies.cilium.io >/dev/null

legacy_policies=(
  kubeclaw-default-deny
  kubeclaw-allow-dns-egress
  kubeclaw-agents-egress
  kubeclaw-agents-ingress
  kubeclaw-nova-buster-test-gates
  kubeclaw-buster-test-gates-from-nova
  kubeclaw-nova-prism-agent-trust
  kubeclaw-redis-ingress
  kubeclaw-clawdeck-redis-egress
  kubeclaw-qdrant-ingress
  kubeclaw-litellm-ingress
  kubeclaw-litellm-egress
  kubeclaw-postgresql-ingress
  kubeclaw-registry-local-ingress
  kubeclaw-registry-mirror-ingress
  kubeclaw-registry-mirror-egress
  ops-mcp-ingress
  ops-mcp-kubernetes-api-egress
  ops-mcp-tunnel-egress
)

case "$MODE" in
  apply)
    kubectl apply -n "$NAMESPACE" -f "$POLICY_FILE"
    echo
    echo "Cilium project policies applied. Verify before cleanup:"
    echo "  kubectl -n $NAMESPACE get ciliumnetworkpolicies"
    echo "  kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg policy get"
    echo
    echo "After verification, remove the legacy Kubernetes NetworkPolicy objects with:"
    echo "  $0 cleanup"
    ;;
  cleanup)
    # Fail closed: do not remove the legacy policy objects unless the replacement
    # Cilium policies exist in the target namespace.
    kubectl -n "$NAMESPACE" get ciliumnetworkpolicy kubeclaw-default-deny >/dev/null
    kubectl -n "$NAMESPACE" get ciliumnetworkpolicy kubeclaw-allow-dns-egress >/dev/null
    for policy in "${legacy_policies[@]}"; do
      kubectl -n "$NAMESPACE" delete networkpolicy "$policy" --ignore-not-found
    done
    echo "Legacy Kubernetes NetworkPolicy objects removed from namespace $NAMESPACE."
    ;;
  *)
    echo "usage: $0 [apply|cleanup]" >&2
    exit 2
    ;;
esac

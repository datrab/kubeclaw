#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="${NAMESPACE:-kubeclaw}"
POLICY_FILE="${POLICY_FILE:-$REPO_DIR/my-values/infra/network-policies.yaml}"
MODE="${1:-apply}"

command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }
kubectl get crd ciliumnetworkpolicies.cilium.io >/dev/null

if [[ "${CILIUM_DATAPLANE_VERIFIED:-false}" != "true" ]]; then
  cat >&2 <<'EOF'
Refusing project-policy cutover without an explicit dataplane verification.

Existing pods retain the CNI configuration of the pod sandbox that created them.
For the single-node Flannel -> Cilium replacement, reboot/recycle the node's pods,
verify Cilium and application connectivity, then run for example:

  CILIUM_DATAPLANE_VERIFIED=true ./scripts/migrate-kubeclaw-network-policies-to-cilium.sh apply
EOF
  exit 2
fi

# Static KubeClaw policies have a 1:1 replacement with the same name. Dynamic
# and chart-owned Kubernetes NetworkPolicy objects (for example temporary Buster
# namespaces and Prism) intentionally remain portable KNP and are enforced by
# Cilium directly.
replacement_policies=(
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
  ops-mcp-hubble-relay-egress
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
    echo "After verification, remove the superseded static Kubernetes NetworkPolicy objects with:"
    echo "  CILIUM_DATAPLANE_VERIFIED=true $0 cleanup"
    ;;
  cleanup)
    # Fail closed: verify every native replacement before deleting any legacy
    # object. A partial/invalid Cilium apply must never create an allow-all gap.
    for policy in "${replacement_policies[@]}"; do
      kubectl -n "$NAMESPACE" get ciliumnetworkpolicy "$policy" >/dev/null
    done
    for policy in "${replacement_policies[@]}"; do
      kubectl -n "$NAMESPACE" delete networkpolicy "$policy" --ignore-not-found
    done
    echo "Superseded static Kubernetes NetworkPolicy objects removed from namespace $NAMESPACE."
    ;;
  *)
    echo "usage: $0 [apply|cleanup]" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="${NAMESPACE:-kubeclaw}"
POLICY_FILE="${POLICY_FILE:-$REPO_DIR/my-values/infra/network-policies.yaml}"
BASELINE_FILE="$REPO_DIR/my-values/infra/cilium-cluster-policies.yaml"
MODE="${1:-apply}"

command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 1; }
kubectl get crd ciliumnetworkpolicies.cilium.io >/dev/null
kubectl get crd ciliumclusterwidenetworkpolicies.cilium.io >/dev/null

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

# The cluster-owned baseline replaces the legacy KubeClaw default-deny + DNS
# NetworkPolicy objects. Most project rules move to CiliumNetworkPolicy. A small
# number deliberately remain portable Kubernetes NetworkPolicy when the native
# KNP semantics are simpler and safer (for example same-namespace podSelector
# scoping). Cilium enforces both APIs.
baseline_policies=(
  dtlabs-workload-default-deny
  dtlabs-workload-allow-dns
)

legacy_policies=(
  kubeclaw-allow-dns-egress
  kubeclaw-agents-egress
  kubeclaw-nova-buster-test-gates
  kubeclaw-buster-test-gates-from-nova
  kubeclaw-nova-prism-agent-trust
  kubeclaw-redis-ingress
  kubeclaw-clawdeck-redis-egress
  kubeclaw-litellm-ingress
  kubeclaw-litellm-egress
  kubeclaw-postgresql-ingress
  kubeclaw-registry-local-ingress
  kubeclaw-registry-mirror-ingress
  kubeclaw-registry-mirror-egress
)

case "$MODE" in
  apply)
    for policy in "${baseline_policies[@]}"; do
      kubectl get ciliumclusterwidenetworkpolicy "$policy" >/dev/null || {
        echo "Required central baseline missing: $policy" >&2
        echo "Run ./scripts/deploy-cilium.sh and verify the cluster policies first." >&2
        exit 3
      }
    done

    kubectl apply -n "$NAMESPACE" -f "$POLICY_FILE"
    echo
    echo "Project network allow policies applied on top of the central fail-closed baseline."
    echo "Verify before cleanup:"
    echo "  kubectl get ciliumclusterwidenetworkpolicies"
    echo "  kubectl -n $NAMESPACE get ciliumnetworkpolicies"
    echo "  kubectl -n $NAMESPACE get networkpolicies"
    echo "  kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg policy get"
    echo
    echo "After verification, remove superseded static Kubernetes NetworkPolicy objects with:"
    echo "  CILIUM_DATAPLANE_VERIFIED=true $0 cleanup"
    ;;
  cleanup)
    # Keep the legacy default-deny as a redundant safety belt through cleanup.
    # It may be retired separately after post-cleanup negative tests; no allow gap.
    [[ "${CILIUM_TRAFFIC_VERIFIED:-false}" == true ]] || { echo 'Pipeline and negative traffic tests must pass; set CILIUM_TRAFFIC_VERIFIED=true.' >&2; exit 2; }
    python3 "$SCRIPT_DIR/verify-cilium-policies.py" "$NAMESPACE" "$BASELINE_FILE" "$POLICY_FILE"
    for policy in "${legacy_policies[@]}"; do
      kubectl -n "$NAMESPACE" delete networkpolicy "$policy" --ignore-not-found
    done
    echo "Superseded static Kubernetes NetworkPolicy objects removed from namespace $NAMESPACE."
    echo "Retained: kubeclaw-agents-ingress and legacy kubeclaw-default-deny. Repeat traffic tests now."
    ;;
  *)
    echo "usage: $0 [apply|cleanup]" >&2
    exit 2
    ;;
esac

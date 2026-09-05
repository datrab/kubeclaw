#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

CILIUM_NAMESPACE="cilium"
CILIUM_RELEASE="cilium"
CILIUM_VERSION="${CILIUM_VERSION:-1.20.1}"
CILIUM_VALUES_FILE="${CILIUM_VALUES_FILE:-$REPO_DIR/my-values/infra/cilium-values.yaml}"
CILIUM_CLUSTER_POLICIES="${CILIUM_CLUSTER_POLICIES:-$REPO_DIR/my-values/infra/cilium-cluster-policies.yaml}"

for command in helm kubectl; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

[[ -f "$CILIUM_VALUES_FILE" ]] || { echo "Cilium values file not found: $CILIUM_VALUES_FILE" >&2; exit 1; }
[[ -f "$CILIUM_CLUSTER_POLICIES" ]] || { echo "Cilium cluster policy file not found: $CILIUM_CLUSTER_POLICIES" >&2; exit 1; }

# Installing Cilium as the primary CNI on an existing K3s cluster is a dataplane
# migration, not a normal application rollout. Require an explicit operator
# acknowledgement on first install instead of silently changing networking from
# scripts/deploy.sh all.
if ! helm status "$CILIUM_RELEASE" -n "$CILIUM_NAMESPACE" >/dev/null 2>&1; then
  if [[ "${CILIUM_K3S_READY:-false}" != "true" ]]; then
    cat >&2 <<'EOF'
Refusing first Cilium install without an explicit K3s migration acknowledgement.

Before continuing, configure every K3s server/agent for Cilium as the primary CNI.
For the server, /etc/rancher/k3s/config.yaml must include at least:

  flannel-backend: none
  disable-network-policy: true

Plan this as a maintenance-window dataplane migration and ensure you retain SSH/
console access to the node. Then run:

  CILIUM_K3S_READY=true ./scripts/deploy-cilium.sh

This guard is skipped for upgrades of an existing cilium/cilium Helm release.
EOF
    exit 2
  fi
fi

kubectl create namespace "$CILIUM_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

helm repo add cilium https://helm.cilium.io/ --force-update >/dev/null
helm repo update cilium >/dev/null

helm upgrade --install "$CILIUM_RELEASE" cilium/cilium \
  --version "$CILIUM_VERSION" \
  --namespace "$CILIUM_NAMESPACE" \
  --values "$CILIUM_VALUES_FILE" \
  --wait \
  --timeout 10m

kubectl -n "$CILIUM_NAMESPACE" rollout status daemonset/cilium --timeout=5m
kubectl -n "$CILIUM_NAMESPACE" rollout status deployment/cilium-operator --timeout=5m

for crd in ciliumnetworkpolicies.cilium.io ciliumclusterwidenetworkpolicies.cilium.io; do
  kubectl wait --for=condition=Established "crd/$crd" --timeout=2m
done

kubectl apply -f "$CILIUM_CLUSTER_POLICIES"

for deployment in hubble-relay hubble-ui; do
  if kubectl -n "$CILIUM_NAMESPACE" get "deployment/$deployment" >/dev/null 2>&1; then
    kubectl -n "$CILIUM_NAMESPACE" rollout status "deployment/$deployment" --timeout=5m
  fi
done

cat <<EOF

Cilium ${CILIUM_VERSION} is installed in namespace ${CILIUM_NAMESPACE}.

Check:
  kubectl -n ${CILIUM_NAMESPACE} get pods
  kubectl get ciliumclusterwidenetworkpolicies
  kubectl get ciliumnetworkpolicies -A

Hubble UI (private local access):
  kubectl -n ${CILIUM_NAMESPACE} port-forward svc/hubble-ui 12000:80
  # open http://127.0.0.1:12000

Project policy is intentionally NOT applied by this script. Each project owns
its namespaced CiliumNetworkPolicy objects and deploys them with that project.
EOF

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

CILIUM_NAMESPACE="cilium"
CILIUM_RELEASE="cilium"
CILIUM_VERSION="${CILIUM_VERSION:-1.20.1}"
CILIUM_VALUES_FILE="${CILIUM_VALUES_FILE:-$REPO_DIR/my-values/infra/cilium-values.yaml}"
CILIUM_CLUSTER_POLICIES="${CILIUM_CLUSTER_POLICIES:-$REPO_DIR/my-values/infra/cilium-cluster-policies.yaml}"
FIRST_INSTALL=false

for command in helm kubectl; do
  command -v "$command" >/dev/null || { echo "$command is required" >&2; exit 1; }
done

[[ -f "$CILIUM_VALUES_FILE" ]] || { echo "Cilium values file not found: $CILIUM_VALUES_FILE" >&2; exit 1; }
[[ -f "$CILIUM_CLUSTER_POLICIES" ]] || { echo "Cilium cluster policy file not found: $CILIUM_CLUSTER_POLICIES" >&2; exit 1; }

# This bootstrap deliberately implements the simple disruptive replacement path
# for the current single-node K3s cluster. A multi-node cluster requires the
# upstream Cilium CNI migration procedure (secondary overlay + per-node cutover)
# and must not accidentally use this same-CIDR replacement script.
if ! helm status "$CILIUM_RELEASE" -n "$CILIUM_NAMESPACE" >/dev/null 2>&1; then
  FIRST_INSTALL=true
  NODE_COUNT="$(kubectl get nodes -o name | wc -l | tr -d ' ')"
  if [[ "$NODE_COUNT" != "1" ]]; then
    cat >&2 <<EOF
Refusing the disruptive Cilium replacement on a ${NODE_COUNT}-node cluster.

This bootstrap intentionally supports the single-node K3s replacement path only.
For multiple nodes, use Cilium's documented live CNI migration with a distinct
migration CIDR/overlay and a controlled per-node cutover.
EOF
    exit 2
  fi

  if [[ "${CILIUM_K3S_READY:-false}" != "true" ]]; then
    cat >&2 <<'EOF'
Refusing first Cilium install without an explicit K3s migration acknowledgement.

Before continuing, configure the K3s server for Cilium as the primary CNI.
/etc/rancher/k3s/config.yaml must include at least:

  flannel-backend: none
  disable-network-policy: true

This is a disruptive single-node maintenance-window replacement, not Cilium's
multi-node live migration path. Keep SSH/console access to the node. After the
K3s configuration has been changed and K3s restarted, run:

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
its namespaced policy objects and deploys them with that project.
EOF

if [[ "$FIRST_INSTALL" == "true" ]]; then
  cat <<'EOF'

IMPORTANT — finish the CNI replacement before applying native project policy:
  1. Reboot the K3s node so pod sandboxes created by Flannel are recycled.
  2. Re-run ./scripts/deploy-cilium.sh after the node is reachable.
  3. Verify Cilium is healthy and application traffic works.
  4. Only then run the policy migration with CILIUM_DATAPLANE_VERIFIED=true.

Do not merge this migration PR into the operational branch before that cutover
has completed; deploy.sh will use Cilium CRDs after the PR is merged.
EOF
fi

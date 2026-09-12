#!/usr/bin/env bash
# Single-node, disruptive same-CIDR cutover. No workload restart or host cleanup here.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
MODE="${1:-install}"
for command in helm kubectl python3; do command -v "$command" >/dev/null || { echo "$command required" >&2; exit 1; }; done
case "$MODE" in
  install)
    # Check on EVERY attempt, including retries after a failed Helm release.
    [[ "${CILIUM_K3S_READY:-false}" == true ]] || { echo 'Complete the host preflight in docs/ops/cilium-networking.md; set CILIUM_K3S_READY=true.' >&2; exit 2; }
    command -v k3s >/dev/null || { echo 'Run the initial cutover on the K3s host with CRI access.' >&2; exit 2; }
    kubectl get nodes -o json | python3 -c 'import json,sys; n=json.load(sys.stdin)["items"]; assert len(n)==1 and n[0]["spec"].get("unschedulable"), "Initial cutover requires exactly one cordoned node"'
    # Network namespace mode NODE=2 is hostNetwork. No old ready ordinary sandbox
    # may overlap the new allocator. Run with permission to inspect the local CRI.
    python3 - <<'PYCRI'
import json, subprocess
pods = json.loads(subprocess.check_output(['k3s', 'crictl', 'pods', '-o', 'json']))
for pod in pods.get('items', []):
    if pod.get('state') != 'SANDBOX_READY':
        continue
    info = json.loads(subprocess.check_output(['k3s', 'crictl', 'inspectp', pod['id']]))
    mode = info.get('status', {}).get('linux', {}).get('namespaces', {}).get('options', {}).get('network')
    assert str(mode) in ('2', 'NODE'), 'Old or unknown non-host sandbox still ready: ' + pod['id']
PYCRI

    ;;
  upgrade)
    kubectl -n cilium get configmap kubeclaw-cutover-verified >/dev/null || { echo 'Initial cutover is not verified; use install and its recovery gates.' >&2; exit 2; }
    ;;
  *) echo 'usage: deploy-cilium.sh [install|upgrade]' >&2; exit 2 ;;
esac
kubectl create namespace cilium --dry-run=client -o yaml | kubectl apply -f -
helm repo add cilium https://helm.cilium.io/ --force-update >/dev/null
helm repo update cilium >/dev/null
# Deliberately no --wait: Relay/UI pods cannot schedule while the node is cordoned.
helm upgrade --install cilium cilium/cilium --version 1.20.1 --namespace cilium \
  --values "$REPO_DIR/my-values/infra/cilium-values.yaml" --timeout 10m
for crd in ciliumnetworkpolicies.cilium.io ciliumclusterwidenetworkpolicies.cilium.io; do
  kubectl wait --for=condition=Established "crd/$crd" --timeout=2m
done
kubectl apply -f "$REPO_DIR/my-values/infra/cilium-cluster-policies.yaml"
kubectl -n cilium rollout status daemonset/cilium --timeout=5m
kubectl -n cilium rollout status deployment/cilium-operator --timeout=5m
cat <<'MSG'
Dataplane rollout and baseline apply completed. This is NOT workload/cutover approval.
The node is still cordoned. Before uncordon:
  * Apply and verify KubeClaw, Ops, SPIRE and other required dependency policies.
  * Verify agent policy import and endpoint realization; run the migration verifier.
  * Paperless alone has an owner-approved temporary baseline exemption.
Then uncordon deliberately, check all recreated pods and run the pipeline/Paperless
and negative connectivity checks in docs/ops/cilium-networking.md. Check Relay/UI
readiness only after scheduling resumes. Create the cutover marker only after
those tests and legacy cleanup have passed. A failed run leaves the node cordoned.
MSG

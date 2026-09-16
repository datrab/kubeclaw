#!/usr/bin/env bash
# Retire the former kubeclaw/qdrant installation, including its data.
set -euo pipefail
umask 077

[[ ${1:-} == --delete-data && $# == 1 ]] || {
  echo 'Usage: KUBE_CONTEXT=... bash scripts/remove-qdrant.sh --delete-data' >&2
  exit 1
}
: "${KUBE_CONTEXT:?Select the target Kubernetes context first}"
command -v python3 >/dev/null
command -v helm >/dev/null
command -v kubectl >/dev/null
kube=(kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw)

inventory=$(mktemp -d)
trap 'rm -f "$inventory/claims.json" "$inventory/claims.tsv"; rmdir "$inventory"' EXIT
"${kube[@]}" get pvc -o json > "$inventory/claims.json"
python3 - "$inventory/claims.json" > "$inventory/claims.tsv" <<'PY'
import json, sys
with open(sys.argv[1]) as stream:
    claims = json.load(stream)['items']
for claim in claims:
    m = claim['metadata']
    labels = m.get('labels', {})
    known = m['name'] in ('qdrant-storage-qdrant-0', 'qdrant-snapshots-qdrant-0')
    owned = (labels.get('app.kubernetes.io/instance') == 'qdrant'
             and labels.get('app.kubernetes.io/name', labels.get('app')) == 'qdrant')
    if known or owned:
        print(m['name'], m['uid'], claim['spec'].get('volumeName', '-'), sep='\t')
PY

# Verify volume ownership before changing reclaim policy. PVC deletion alone
# would leave retained PVs and their data behind.
while IFS=$'\t' read -r claim uid volume; do
  [[ $volume != - ]] || continue
  kubectl --context "$KUBE_CONTEXT" get pv "$volume" -o json |
    python3 -c '
import json, sys
pv = json.load(sys.stdin)
ref = pv["spec"].get("claimRef", {})
if (ref.get("namespace"), ref.get("name"), ref.get("uid")) != ("kubeclaw", sys.argv[1], sys.argv[2]):
    raise SystemExit("QDRANT_VOLUME_OWNERSHIP_MISMATCH")
' "$claim" "$uid"
done < "$inventory/claims.tsv"

helm --kube-context "$KUBE_CONTEXT" --namespace kubeclaw uninstall qdrant \
  --ignore-not-found --wait --timeout 180s
"${kube[@]}" delete statefulset qdrant --ignore-not-found --wait=true
"${kube[@]}" delete service qdrant qdrant-headless --ignore-not-found
"${kube[@]}" delete secret qdrant-auth qdrant-tls --ignore-not-found
"${kube[@]}" delete networkpolicy kubeclaw-qdrant-ingress --ignore-not-found
if kubectl --context "$KUBE_CONTEXT" api-resources -o name | grep -qx ciliumnetworkpolicies.cilium.io; then
  "${kube[@]}" delete ciliumnetworkpolicy kubeclaw-qdrant-ingress --ignore-not-found
fi

while IFS=$'\t' read -r claim uid volume; do
  if [[ $volume != - ]]; then
    patch=$(python3 - "$claim" "$uid" <<'PY'
import json, sys
print(json.dumps([
    {"op": "test", "path": "/spec/claimRef/namespace", "value": "kubeclaw"},
    {"op": "test", "path": "/spec/claimRef/name", "value": sys.argv[1]},
    {"op": "test", "path": "/spec/claimRef/uid", "value": sys.argv[2]},
    {"op": "add", "path": "/spec/persistentVolumeReclaimPolicy", "value": "Delete"},
]))
PY
)
    kubectl --context "$KUBE_CONTEXT" patch pv "$volume" --type=json -p "$patch"
  fi
  "${kube[@]}" delete pvc "$claim" --ignore-not-found --wait=true --timeout=180s
  if [[ $volume != - ]]; then
    kubectl --context "$KUBE_CONTEXT" wait --for=delete "pv/$volume" --timeout=180s
  fi
done < "$inventory/claims.tsv"

echo 'Qdrant release and selected storage removed. Roll out updated agents to remove old health probes.'

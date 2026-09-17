#!/usr/bin/env bash
# Extend the existing delegated pool without restarting K3s or its pool service.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on AX41' >&2; exit 1; }
repository="$(cd "$(dirname "$0")/.." && pwd)"
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
[[ "$(systemctl show kubeclaw-native-pools.service -p SubState --value)" == running ]]
k3s kubectl -n kubeclaw get deployment agent-buster -o json | python3 -c '
import json,sys
d=json.load(sys.stdin)
assert d["spec"].get("replicas",1)==0 and d.get("status",{}).get("replicas",0)==0, "Buster must be scaled down before preparation"
'
/usr/local/bin/node "$repository/scripts/native-worker-node-preflight.mjs" "$repository/my-values/infra/native-worker-pools-ax41.yaml"
backup="$(mktemp -d /root/kubeclaw-buster-browser.XXXXXX)"
cp -a /opt/kubeclaw/native/prepare-native-worker-pools.mjs "$backup/prepare-native-worker-pools.mjs"
printf 'Backup: %s\n' "$backup"
# Run checked repository code first; persist it only when preparation succeeds.
/usr/local/bin/node "$repository/scripts/prepare-native-worker-pools.mjs" /etc/kubeclaw/native-node-policy.json
install -o root -g root -m 0644 "$repository/scripts/prepare-native-worker-pools.mjs" /opt/kubeclaw/native/prepare-native-worker-pools.mjs
echo 'Browser subtree prepared; persistent setup updated. No service restarted.'

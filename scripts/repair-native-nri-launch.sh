#!/usr/bin/env bash
# Installer-Step: repair.native-nri-launch; category: repair-only. See scripts/install/README.md.
# Repair the pre-registration SDK identity failure on an activated AX41 node.
set -euo pipefail
umask 077
[[ $EUID == 0 && $# == 0 ]]
cd "$(dirname "$0")/.."
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
systemctl is-active --quiet kubeclaw-native-pools.service
if pgrep -f '^/opt/nri/plugins/10-kubeclaw-native( |$)' >/dev/null; then
  echo 'STOP: plugin is already running; this repair is for a failed launch only' >&2
  exit 1
fi
node scripts/native-worker-node-preflight.mjs my-values/infra/native-worker-pools-ax41.yaml
backup="$(mktemp -d /root/kubeclaw-nri-launch-repair.XXXXXX)"
echo "Repair backup: $backup"
cp -a /opt/nri/plugins/10-kubeclaw-native "$backup/original-plugin"
(
  cd tools/native-worker-nri
  GOTOOLCHAIN=local CGO_ENABLED=0 go test -mod=readonly ./...
)
node scripts/build-native-worker-nri.mjs "$backup/10-kubeclaw-native"
"$backup/10-kubeclaw-native" --check-policy /etc/kubeclaw/native-nri.json
install -o root -g root -m 0755 "$backup/10-kubeclaw-native" /opt/nri/plugins/10-kubeclaw-native
echo 'Restarting K3s to register the repaired plugin; retain SSH access.'
systemctl restart k3s
for attempt in {1..60}; do
  if k3s kubectl get node ax41-production >/dev/null 2>&1; then break; fi
  sleep 2
done
k3s kubectl wait --for=condition=Ready node/ax41-production --timeout=180s
node scripts/native-worker-node-preflight.mjs my-values/infra/native-worker-pools-ax41.yaml
pgrep -af '^/opt/nri/plugins/10-kubeclaw-native( |$)'
grep -iE 'nri|kubeclaw-native' /var/lib/rancher/k3s/agent/containerd/containerd.log | tail -n 35
echo 'Review registration/configuration messages above. Real worker adjustment remains a separate live check.'

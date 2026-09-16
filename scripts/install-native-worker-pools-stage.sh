#!/usr/bin/env bash
# Initial host-file installation only. Does not restart K3s or activate NRI.
set -euo pipefail
umask 077

[[ $EUID == 0 && $# == 1 ]] || { echo 'Usage as root: bash scripts/install-native-worker-pools-stage.sh BUNDLE' >&2; exit 1; }
bundle="$(realpath -e "$1")"
generated="$bundle/generated"
node=/usr/local/bin/node
unit=/etc/systemd/system/kubeclaw-native-pools.service
[[ -x "$node" && -x "$bundle/10-kubeclaw-native" ]]
"$bundle/10-kubeclaw-native" --check-policy "$generated/native-nri.json"
"$node" -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1])); if(p.nodeVersion!==process.versions.node) throw Error("Selected host Node version mismatch")' "$generated/native-node-policy.json"

# Initial installation deliberately refuses existing files or a running pool.
# Reconfiguration requires draining native workers and a separate maintenance plan.
if systemctl is-active --quiet kubeclaw-native-pools.service; then
  echo 'STOP: pool service is already active; do not restart it with this installer' >&2
  exit 1
fi
sources=(native-node-policy.json buster-pool.json prism-pool.json native-nri.json)
targets=(/etc/kubeclaw/native-node-policy.json /etc/kubeclaw/buster-pool.json /etc/kubeclaw/prism-pool.json /etc/kubeclaw/native-nri.json)
for target in "${targets[@]}" "$unit" /opt/kubeclaw/native/prepare-native-worker-pools.mjs /opt/nri/plugins/10-kubeclaw-native; do
  if [[ -e "$target" || -L "$target" ]]; then
    echo "STOP: existing installation file requires review: $target" >&2
    exit 1
  fi
done
for source in "${sources[@]}" prepare-native-worker-pools.mjs kubeclaw-native-pools.service; do
  [[ -f "$generated/$source" && ! -L "$generated/$source" ]]
done

# Pin systemd's executable path to the already verified host runtime.
staged_unit="$bundle/kubeclaw-native-pools.service"
[[ ! -e "$staged_unit" ]]
"$node" - "$generated/kubeclaw-native-pools.service" "$staged_unit" <<'JS'
const fs = require('fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const expected = 'ExecStart=/usr/bin/env node /opt/kubeclaw/native/prepare-native-worker-pools.mjs';
if (source.split(expected).length !== 2) throw Error('Unexpected generated service');
fs.writeFileSync(process.argv[3], source.replace(expected, 'ExecStart=/usr/local/bin/node /opt/kubeclaw/native/prepare-native-worker-pools.mjs'), {flag:'wx', mode:0o600});
JS

install -d -m 0755 /etc/kubeclaw /opt/kubeclaw/native /opt/nri/plugins
install -d -m 0700 /var/lib/kubeclaw/native/buster /var/lib/kubeclaw/native/prism
for index in "${!sources[@]}"; do
  install -o root -g root -m 0600 "$generated/${sources[$index]}" "${targets[$index]}"
done
install -o root -g root -m 0644 "$generated/prepare-native-worker-pools.mjs" /opt/kubeclaw/native/prepare-native-worker-pools.mjs
install -o root -g root -m 0755 "$bundle/10-kubeclaw-native" /opt/nri/plugins/10-kubeclaw-native
install -o root -g root -m 0644 "$staged_unit" "$unit"
systemd-analyze verify "$unit"
systemctl daemon-reload
systemctl start kubeclaw-native-pools.service
systemctl is-active kubeclaw-native-pools.service
for role in buster prism; do
  root="/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service/$role"
  printf '\n%s pool\n' "$role"
  for control in cpu.max memory.max memory.swap.max pids.max; do
    printf '%s: ' "$control"
    cat "$root/$control"
  done
done
echo 'HOST FILES INSTALLED; POOLS STARTED FOR THIS BOOT ONLY.'
echo 'Not enabled for boot yet. Kubelet reservations, Pod PID enforcement and NRI activation remain pending.'

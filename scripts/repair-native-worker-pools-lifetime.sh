#!/usr/bin/env bash
# Repair only the observed initial active(exited), empty-cgroup installation.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root on AX41' >&2; exit 1; }
repository="$(cd "$(dirname "$0")/.." && pwd)"
service=kubeclaw-native-pools.service
root=/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service
[[ "$(systemctl show "$service" -p SubState --value)" == exited ]]
[[ "$(systemctl show "$service" -p MainPID --value)" == 0 ]]
[[ -z "$(systemctl show "$service" -p ControlGroup --value)" && ! -e "$root" ]]
[[ -x /usr/bin/systemd-notify ]]

backup="$(mktemp -d /root/kubeclaw-pool-lifetime-repair.XXXXXX)"
/usr/local/bin/node "$repository/scripts/render-native-worker-node.mjs" \
  "$repository/my-values/infra/native-worker-pools-ax41.yaml" "$backup/generated"
# This repair must not change capacity, NRI selection or node identity policy.
for policy in native-node-policy.json native-nri.json buster-pool.json prism-pool.json; do
  cmp "$backup/generated/$policy" "/etc/kubeclaw/$policy"
done
cp -a /etc/systemd/system/kubeclaw-native-pools.service "$backup/original.service"
cp -a /opt/kubeclaw/native/prepare-native-worker-pools.mjs "$backup/original-setup.mjs"
sed 's|ExecStart=/usr/bin/env node |ExecStart=/usr/local/bin/node |' \
  "$backup/generated/kubeclaw-native-pools.service" > "$backup/kubeclaw-native-pools.service"
grep -qx 'Type=notify' "$backup/kubeclaw-native-pools.service"
grep -qx 'ExecStart=/usr/local/bin/node /opt/kubeclaw/native/prepare-native-worker-pools.mjs /etc/kubeclaw/native-node-policy.json --serve' "$backup/kubeclaw-native-pools.service"
systemd-analyze verify "$backup/kubeclaw-native-pools.service"
printf 'Repair backup: %s\n' "$backup"

# Recheck immediately before stopping: never use this to restart active workers.
[[ -z "$(systemctl show "$service" -p ControlGroup --value)" && ! -e "$root" ]]
[[ "$(systemctl show "$service" -p MainPID --value)" == 0 ]]
systemctl stop "$service"
install -o root -g root -m 0644 "$backup/generated/prepare-native-worker-pools.mjs" /opt/kubeclaw/native/prepare-native-worker-pools.mjs
install -o root -g root -m 0644 "$backup/kubeclaw-native-pools.service" /etc/systemd/system/kubeclaw-native-pools.service
systemctl daemon-reload
systemctl start "$service"
sleep 2
[[ "$(systemctl show "$service" -p SubState --value)" == running ]]
[[ "$(systemctl show "$service" -p ControlGroup --value)" == /kubeclaw.slice/kubeclaw-native-pools.service ]]
systemctl show "$service" -p ActiveState -p SubState -p MainPID -p ControlGroup
for role in buster prism; do
  printf '\n%s pool\n' "$role"
  for control in cpu.max memory.max memory.swap.max pids.max; do
    printf '%s: ' "$control"
    cat "$root/$role/$control"
  done
done
echo 'Pool lifetime repair complete. K3s was not restarted; reservations and NRI activation remain pending.'

#!/bin/sh
# Runs only inside the approved isolated VM, never on the workspace host.
set -eu
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev
mkdir -p /dev/pts /run /tmp /repo /results /root
mount -t devpts devpts /dev/pts
chmod 1777 /tmp
# Cache extraction used the host unprivileged owner. Correct only the new guest
# disk before exposing uid 1000 workloads; never chown the readonly export.
chown -R 0:0 /bin /sbin /lib /usr /etc
chown 0:0 / /root /run /tmp /repo /results
mount -t 9p -o trans=virtio,version=9p2000.L,ro repo /repo
exec > /dev/console 2>&1
status=1
finish() {
  echo "VM_REVIEW_EXIT=$status"
  sync
  poweroff -f
}
trap finish EXIT
printf 'VM_BOOTED=1\nGuest identity and versions\n'
uname -a
/usr/bin/flock --version
node --version
test "$(node --version)" = v24.21.0
mount -t cgroup2 none /sys/fs/cgroup
for controller in cpu memory pids; do
  grep -qw "$controller" /sys/fs/cgroup/cgroup.controllers
 done
printf '+cpu +memory +pids\n' > /sys/fs/cgroup/cgroup.subtree_control
mkdir /sys/fs/cgroup/native-test-pool
printf '536870912\n' > /sys/fs/cgroup/native-test-pool/memory.max
printf '0\n' > /sys/fs/cgroup/native-test-pool/memory.swap.max
printf '4096\n' > /sys/fs/cgroup/native-test-pool/pids.max
printf '100000 100000\n' > /sys/fs/cgroup/native-test-pool/cpu.max
printf '+cpu +memory +pids\n' > /sys/fs/cgroup/native-test-pool/cgroup.subtree_control
printf '%s\n' '{"memoryBytes":536870912,"tasks":4096,"cpuQuotaMicroseconds":100000,"cpuPeriodMicroseconds":100000}' > /run/pool-limits.json
chmod 600 /run/pool-limits.json
printf 'VM_PHASE=startup-storage-diagnostic\n'
cd /repo
node /diagnostics/guest-diagnostic.mjs
status=0
exit "$status"

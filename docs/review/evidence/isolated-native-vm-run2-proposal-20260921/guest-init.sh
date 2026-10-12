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
printf 'VM_PHASE=identity-preflight\n'
cd /repo
node --input-type=module -e 'import { readNativeWorkerNodeIdentity } from "./skills/worker/core/worker/native-node-identity.ts"; console.log(readNativeWorkerNodeIdentity("/etc/machine-id"));'
printf 'VM_IDENTITY_STATUS=0\nVM_PHASE=compile\n'
cc -std=c11 -Wall -Wextra -Werror -O2 -fstack-protector-strong \
  -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -fPIE -pie -Wl,-z,relro,-z,now \
  -o /usr/local/bin/native-worker-launcher \
  /repo/skills/worker/core/worker/native-worker-launcher.c
printf 'VM_COMPILE_STATUS=0\n'
chown 0:0 /usr/local/bin/native-worker-launcher
chmod 755 /usr/local/bin/native-worker-launcher
export KUBECLAW_WORKER_TEST_CGROUP_ROOT=/sys/fs/cgroup/native-test-pool
export KUBECLAW_WORKER_TEST_LAUNCHER=/usr/local/bin/native-worker-launcher
export KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE=/etc/machine-id
export KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE=/run/pool-limits.json
cd /repo
# Original native gate commands; no altered deadlines, skips, or assertion edits.
printf 'VM_PHASE=typecheck\n'
node node_modules/typescript/bin/tsc --noEmit -p tests/verification/reliability/tsconfig.native-scope.json
printf 'VM_TYPECHECK_STATUS=0\nVM_PHASE=native\n'
set +e
node --test --test-concurrency=1 \
  tests/verification/reliability/worker-native-scope-live.mts \
  tests/verification/reliability/worker-native-topology-live.mts
native_status=$?
printf 'VM_NATIVE_STATUS=%s\nVM_PHASE=node-pools\n' "$native_status"
# Same node-pools cases, serialized to fit the fixed VM budget.
node --test --test-concurrency=1 \
  tests/verification/reliability/worker-resource-reservations.test.mts \
  tests/verification/reliability/worker-owned-children.test.mts \
  tests/verification/reliability/worker-native-quiescence.test.mts \
  tests/verification/reliability/worker-terminal-capacity.test.mts \
  tests/verification/reliability/worker-ownership-store.test.mts \
  tests/verification/reliability/worker-native-journal.test.mts \
  tests/verification/deployment/native-worker-node.test.mjs
pool_status=$?
set -e
printf 'VM_NATIVE_STATUS=%s VM_NODE_POOLS_STATUS=%s\n' "$native_status" "$pool_status"
status=0
if [ "$native_status" -ne 0 ] || [ "$pool_status" -ne 0 ]; then status=1; fi
exit "$status"

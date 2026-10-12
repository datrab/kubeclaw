#!/bin/sh
# Guest-only driver. No workspace-host privilege operations.
set -eu
export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev
mkdir -p /dev/pts /run /tmp /repo /results /root
mount -t devpts devpts /dev/pts
chmod 1777 /tmp
chown -R 0:0 /bin /sbin /lib /usr /etc
chown 0:0 / /root /run /tmp /repo /results
mount -t 9p -o trans=virtio,version=9p2000.L,ro repo /repo
exec > /dev/console 2>&1
status=1
finish() { echo "VM_REVIEW_EXIT=$status"; sync; poweroff -f; }
trap finish EXIT
printf 'VM_BOOTED=1\nVM_PHASE=prerequisites\n'
uname -a
node --version
test "$(node --version)" = v24.21.0
command -v setcap
command -v getcap
mkdir -p /opt/ha-proof /run/ha-build/skills/common/plugin-runtime/foundation/isolation
chmod 755 /opt /opt/ha-proof /run/ha-build
cp /repo/skills/common/plugin-runtime/foundation/isolation/sandbox.c /run/ha-build/skills/common/plugin-runtime/foundation/isolation/sandbox.c
cd /run/ha-build
printf 'VM_PHASE=compile\n'
node /repo/scripts/build-plugin-sandbox.mjs
cp skills/common/plugin-runtime/foundation/isolation/plugin-sandbox /opt/ha-proof/generic
node /repo/scripts/build-plugin-sandbox.mjs --buster-browser-helper /opt/ha-proof/restricted
cp /repo/ha-proof/sandbox.before.c /run/ha-build/skills/common/plugin-runtime/foundation/isolation/sandbox.c
node /repo/scripts/build-plugin-sandbox.mjs
cp skills/common/plugin-runtime/foundation/isolation/plugin-sandbox /opt/ha-proof/old-filecap-helper
chown 0:1000 /opt/ha-proof/restricted /opt/ha-proof/old-filecap-helper
chmod 750 /opt/ha-proof/restricted /opt/ha-proof/old-filecap-helper
chmod 755 /opt/ha-proof/generic
setcap cap_setuid,cap_setgid=ep /opt/ha-proof/restricted
setcap cap_setuid,cap_setgid=ep /opt/ha-proof/old-filecap-helper
getcap /opt/ha-proof/restricted /opt/ha-proof/old-filecap-helper /opt/ha-proof/generic
printf 'VM_COMPILE_STATUS=0\n'
cd /repo
set +e
node ha-proof/guest-tests.mjs
status=$?
set -e

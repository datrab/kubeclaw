#!/bin/sh
# Disposable guest PID1 only. Never execute on the workspace host.
set -eu
export PATH=/usr/bin:/bin
status=1
finish() {
  printf 'VM_REVIEW_EXIT=%s\n' "$status"
  sync
  poweroff -f
}
trap finish EXIT
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev
mkdir -p /run /tmp /repo /results /var/lib
chmod 1777 /tmp
# The source packages were extracted/copied by UID1000. Change ownership only
# on this new guest disk, before starting children. The export remains readonly.
chown -R 0:0 /bin /lib /usr /etc /var
chown 0:0 / /run /tmp /repo /results /guest-init
mount -t 9p -o trans=virtio,version=9p2000.L,ro repo /repo
printf 'LIS-disposable-ext4-v1\n' > /run/legacy-seal-disposable-guest
chmod 600 /run/legacy-seal-disposable-guest
printf 'VM_BOOTED=1\n'
for attempt in 1 2 3 4 5; do
  [ -b /dev/vdb ] && break
  /bin/busybox sleep 1
done
test -b /dev/vda
test -b /dev/vdb
set +e
/usr/bin/python3 -I /repo/run.py
status=$?
set -e

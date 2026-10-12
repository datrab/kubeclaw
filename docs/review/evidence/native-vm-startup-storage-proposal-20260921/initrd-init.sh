#!/bin/sh
set -eu
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox insmod /modules/virtio_blk.ko
/bin/busybox insmod /modules/crc16.ko
/bin/busybox insmod /modules/mbcache.ko
/bin/busybox insmod /modules/jbd2.ko
/bin/busybox insmod /modules/ext4.ko
/bin/busybox insmod /modules/netfs.ko
/bin/busybox insmod /modules/9pnet.ko
/bin/busybox insmod /modules/9p.ko
/bin/busybox insmod /modules/9pnet_virtio.ko
/bin/busybox insmod /modules/rng-core.ko
/bin/busybox insmod /modules/virtio-rng.ko
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -b /dev/vda ] && break
  /bin/busybox sleep 1
done
/bin/busybox mount -t ext4 /dev/vda /newroot
/bin/busybox umount /proc
/bin/busybox umount /sys
/bin/busybox umount /dev
exec /bin/busybox switch_root /newroot /guest-init

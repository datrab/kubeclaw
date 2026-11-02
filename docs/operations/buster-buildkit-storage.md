# Rootless BuildKit cache storage

The Buster image defaults `BUILDKIT_STATE_DIR` to
`/var/lib/buster-v2/buildkit`, under the existing worker data-volume mount.
Keep `/var/lib/buster-v2` on the worker's writable persistent filesystem.
Do not place the cache in the container's writable overlay layer: nested
rootless overlay can cause automatic fallback to the native snapshotter, whose
full-directory copies make multi-layer application images disproportionately slow.

The entrypoint creates the cache as UID/GID 1000 with mode 0700. Existing
builder-owned private caches work on restart; child files are not recursively
chowned or erased. Relative paths and a symlink cache root fail closed. The
image also creates the unmounted parent with the right owner for local usage.
Old home-directory caches are not migrated or deleted; images in the registry
and archived job results are separate from this disposable build cache.

BuildKit still selects the snapshotter automatically. On unsupported filesystems
it can fall back to native; do not add capabilities or host-device mounts merely
to force overlayfs. Check startup logs and `buildctl debug workers` rather than
assuming the selected mode. No new privileges, process-sandbox setting or
registry credentials are introduced by this path change.

On the existing worker, a disposable daemon on the mounted ext4 filesystem
selected overlayfs, while the old container-layer root selected native. The
probe executed no project jobs, was stopped and removed. After an idle-only
switch, the actual Familyclaw Agent build unpacked its base in about 33 seconds;
its SSH and Python venv checks passed and the image was registry-verified.
The separate restricted-supervisor fixture reproduces the old private-parent
creation failure, verifies correct creation/restart preservation, and rejects
symlink/relative roots. This same fixture is mandatory in the image build.

# Rootless BuildKit cache storage

Status: release-scoped operating procedure; no new execution claim
Audience: operator, release maintainer
Owner: Buster and platform operations
Evidence: https://github.com/datrab/kubeclaw/blob/f821e4357e074c0d6c3e0ddd4749b5cc5324a89f/docs/operations/buster-buildkit-storage.md
Applies to: the selected matching source and deployed runtime release
Last verified: 2026-11-02; content comparison only, no deployment or live test

> **Release scope:** Reconciled from upstream source `f821e4357e074c0d6c3e0ddd4749b5cc5324a89f`.
> Use its complete reviewed release checkout, not an older PR13 product example.
> Check that named commands, inputs and schemas exist in that release before
> execution. Historical rollout observations and test results below are not fresh
> execution claims. This page does not authorize a deployment or host change.

Use the [shared maintenance and authority prerequisites](maintenance.md) before
any mutation. Preserve independent access, existing data and the previous compatible
selection. A local render or source check is not a live readiness result.

The Buster image defaults `BUILDKIT_STATE_DIR` to
`/var/lib/buster-v2/buildkit`, under the existing worker data-volume mount.
Keep `/var/lib/buster-v2` on the worker's writable persistent filesystem.
Do not place the cache in the container's writable overlay layer: nested
rootless overlay can cause automatic fallback to the native snapshotter, whose
full-directory copies make multi-layer application images disproportionately slow.

For the fixed default path, the entrypoint initializes only the service-owned
volume top directory for UID/GID 1000, including fresh root-owned mounts. It
creates the cache as UID/GID 1000 with mode 0700. Existing
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

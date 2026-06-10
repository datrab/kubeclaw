# Persistent Storage

Status: current
Audience: operator

## Purpose

Document PVCs and ephemeral storage.

## Current Behavior

The chart can render two PVCs per agent:

- `<release>-config`
- `<release>-workspace`

Defaults:

- config PVC: enabled, `10Gi`, `ReadWriteOnce`, cluster default storage class unless set
- workspace PVC: enabled, `20Gi`, `ReadWriteOnce`, cluster default storage class unless set

PVCs have `helm.sh/resource-policy: keep`, so Helm uninstall does not remove them automatically.

Buster sandbox mode also uses `emptyDir` for Podman storage with `sandbox.storageSize` default `50Gi` and `/sandbox` with size limit `2Gi`. Production Buster values also set container `ephemeral-storage` requests and `50Gi` limits for both the gateway and pipeline containers, so Podman-in-Pod storage is bounded at the volume and container levels.

Buster cleanup reports before/after disk usage for `/sandbox` and `/var/lib/containers` in its sandbox cleanup result and telemetry.

Registry mirror uses a `5Gi` PVC for cache. Registry-local has no PVC and is ephemeral.

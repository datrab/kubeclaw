# Isolated native VM proposal — run 2

Prepared only; coordinator review precedes execution. Run 1 remains a failed,
preserved checkpoint in [its execution record](isolated-native-vm-execution-20260921.md).
This retry fixes only the disposable guest identity and adds guest phase/status
markers. No production source, maintained test, assertion, deadline or resource
limit changes.

The fresh 8-GiB logical ext4 disk is built from the extracted guest tree, never
from the used run-1 disk. A newly generated UUID is persisted in `/etc/machine-id`
(mode 0444); guest initialization makes `/etc` root-owned before invoking the
unchanged `readNativeWorkerNodeIdentity` on that actual file. Failure stops before
compilation/tests. The UUID and construction command are bound in the evidence.
The host's identity is never read or changed.

The [original proposal](isolated-native-vm-proposal-20260921.md) supplies package
provenance and isolation design. Immutable tools and the same frozen source
snapshot are reused read-only through cache symlinks. There is no network,
KVM/device passthrough, host installation, mount, cgroup or namespace change.
The guest alone mutates its new disk. Node remains v24.21.0; actual util-linux
flock, compiler and Linux headers are retained. `systemd-analyze` remains absent:
the full unchanged node-pools case is retained and expected to report its missing
prerequisite. TCG timeouts are retained as test results, not relaxed.

Budgets remain 1 GiB guest RAM, 2 virtual CPUs, 64 MiB TCG cache, 2 GiB QEMU
address-space limit, 120-second boot and 900-second overall watchdogs, 64 MiB
console cap, 1200-second process CPU budget, and 2.75 GiB shared-memory stop.
The 512-MiB initial nonreclaimable-memory preflight and exclusive heavy-test slot
remain required. The guest pool stays 512 MiB / 4096 tasks / one CPU quota.
Original test-case deadlines remain untouched.

Exact commands and scripts are under
`docs/review/evidence/isolated-native-vm-run2-proposal-20260921/`:

```sh
python3 docs/review/evidence/isolated-native-vm-run2-proposal-20260921/launch-approved.py --verify-only
# Only after coordinator review and exclusive heavy-test slot:
python3 docs/review/evidence/isolated-native-vm-run2-proposal-20260921/launch-approved.py --execute-reviewed-proposal --confirm-no-heavy-tests
```

`artifact-manifest.json` binds the initial disk, kernel, initrd, QEMU and source
manifest; the launcher verifies these before boot and exact snapshot entry sets,
types and content before/after execution. Initial/final mutable-disk hashes stay
separate. `native-snapshot-current.json` compares only explicitly listed native
inputs: 131 of 134 still match. The chart config, shared swarm schema and
shared swarm loader changed during separate Buster work; run 2 deliberately
tests their frozen run-1 versions. Native Core and original test inputs match.
Current whole-workspace identity is not claimed. This can establish bounded guest-kernel functional evidence, never
physical-host performance, production deployment or full IFR16 acceptance.

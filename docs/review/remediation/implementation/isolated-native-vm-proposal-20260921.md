# Isolated Linux VM proposal for native worker tests

**Prepared, not booted.** The downloaded emulator runs `--version`; no VM,
resource-pressure workload, host package installation, host namespace/cgroup
mutation or privileged host operation has run. The coordinator must review this
exact scope and resource envelope and wait for all other heavy workspace tests
to finish before deciding whether execution is authorized by the existing task.
This document does not itself grant execution permission.

## Concrete artifacts

All binaries, packages, root filesystem and source snapshot are under ignored
`node_modules/.cache/native-test-vm-20260921/`. Reviewable scripts, logs and
[artifact hashes](../../evidence/isolated-native-vm-proposal-20260921/artifact-manifest.json)
are in `docs/review/evidence/isolated-native-vm-proposal-20260921/`.

- **QEMU 11.0.3**, downloaded from the configured official Alpine v3.24 repository.
  Its cached `--version` invocation passed. No emulator boot command was issued.
- **Linux 6.18.52-0-virt**, with configured real cgroup/memcg/CPU/pids support.
  The kernel configuration is frozen in evidence. Virtio block, ext4, 9p and
  entropy-device modules and dependencies are included in the minimal initrd.
- **94 verified APKs**, 150,870,376 downloaded bytes. `apk verify` returned zero
  using the existing trusted keys, without `--allow-untrusted`. Package URLs,
  SHA-256 hashes and trusted-key fingerprints are retained. `apk extract
  --no-chown` only populated cache directories; package installation scripts were
  not run and the host package database was not modified.
- **Guest Node v24.21.0** is an exact copied/hash-bound `/usr/local/bin/node`,
  with its musl/libstdc++/libgcc dependencies in the guest. The repository's
  runtime is preserved; Alpine's different Node version is not substituted.
- **Minimal initrd:** 5,745,004 bytes uncompressed, 1,899,633 bytes compressed.
  It contains BusyBox, musl, eleven required kernel modules and the boot script.
  The full package tree is not placed in unreclaimable initramfs memory.
- **Guest-only ext4 disk:** 8 GiB logical, 485,994,496 bytes initially allocated,
  populated with 55 selected guest packages, compiler, Node and guest init using
  userspace `mke2fs -d`. No host mount was used. All writes during a later run
  are confined to this new test disk and bounded console/result files.
- **Read-only source/dependency snapshot:** 35,542 file/link entries plus 4,134 directories, 446,932,168 file
  bytes. It excludes Git metadata and ignored caches. Relative package links are
  retained; any link escaping the snapshot causes preparation to fail. The
  complete manifest is hash-bound, and the launcher verifies source bytes both
  before and after execution. Test sources and deadlines are unchanged.

Additional prerequisite review found Alpine's separate `flock` package and
Linux userspace headers were needed. Both are now signed, verified guest inputs;
`/usr/bin/flock --version` reports util-linux 2.42.3. Bash is also present. The
exact original launcher compiles successfully using the cached GCC with
`--sysroot=guest-root`, all original hardening flags, and `-U_FORTIFY_SOURCE`
immediately before `-D_FORTIFY_SOURCE=3` to replace Alpine's built-in definition
without weakening the selected level. The initial missing-header failure remains
visible. This is a compiler prerequisite check, not execution of the launcher.

## Fixed resource and I/O envelope

| Boundary | Prepared value |
| --- | --- |
| Guest RAM | 1 GiB; no automatic increase after failure |
| vCPUs / execution | 2, software TCG only; no KVM device |
| TCG translation cache | 64 MiB |
| QEMU process virtual-address ceiling | 2 GiB, including guest memory and emulator overhead |
| Host starting non-file-cache usage | At most 512 MiB of anon + kernel + shmem |
| Shared workspace requirement | At least the observed 3 GiB memory limit; no other heavy tests |
| Conservative shared-memory stop | Terminate this QEMU process group above 2.75 GiB |
| VM boot/readonly-export watchdog | 120 seconds to `VM_BOOTED=1` |
| Entire emulator run watchdog | 900 seconds; 1,200-second process CPU budget |
| Console evidence | Strict 64 MiB output cap |
| Guest worker pool | 512 MiB, 4,096 tasks, CPU quota 100,000 / period 100,000 µs |
| Host access exposed to guest | Read-only snapshot and the new guest disk; no host device passthrough |
| Networking | No NIC, no user-mode networking, no host networking |

The 1 GiB guest allocation is not the total host cost. The separate address-space
limit, starting-memory check and shared-memory monitor cover emulator overhead.
These conservative bounds may abort startup or execution; an abort is retained
as incomplete/failed evidence and never authorizes a larger budget. The CPU
limit and low host priority apply only to the new QEMU process. A parent-death
signal stops that process if its monitoring launcher disappears. Memory/cgroup
monitoring reads the host's existing files; it does not change them.

## Exact execution plan

The cached full QEMU argv is in
[`launch-command.json`](../../evidence/isolated-native-vm-proposal-20260921/launch-command.json).
Its important boundaries are `-accel tcg,thread=multi,tb-size=64`, `-m 1024`,
`-smp 2`, `-nic none`, `-nodefaults`, a read-only `-fsdev` export, and one new raw
ext4 disk. The virtual RNG uses QEMU's built-in source, without passing a host
character device to the guest. These options follow the official
[QEMU invocation documentation](https://www.qemu.org/docs/master/system/invocation.html).

The default command only prints the proposed argv and has already been used:

```sh
python3 docs/review/evidence/isolated-native-vm-proposal-20260921/launch-approved.py
```

A separate `--verify-only` mode checks all frozen artifacts and the exact snapshot
entry set/types/contained symlinks without starting QEMU. The 134 native-relevant
production/test/config inputs also match current workspace bytes
(`native-snapshot-current.json`); no whole-repository-current equality is claimed.

Only after coordinator scope/resource review and exclusive heavy-test access,
the concrete execution entry point would be:

```sh
python3 docs/review/evidence/isolated-native-vm-proposal-20260921/launch-approved.py \
  --execute-reviewed-proposal --confirm-no-heavy-tests
```

The flags are execution guards, not a substitute for authorization. The launcher
refuses an existing console log, verifies the frozen snapshot plus emulator,
kernel, initrd and initial disk hashes against the prepared manifest, uses the fixed
process bounds and records exit status and watchdog reason. It reports success
only if QEMU exits cleanly, the guest emits `VM_REVIEW_EXIT=0`, no watchdog fired,
and the source snapshot still matches. Initial and final mutable-disk hashes are
recorded separately; expected guest-disk writes are not confused with immutable
source verification. Per-file cache hints discard reads of this fixture's own
artifacts after hashing; no global host cache or cgroup setting is changed.

The exact guest initialization and test commands are in
[`guest-init.sh`](../../evidence/isolated-native-vm-proposal-20260921/guest-init.sh).
They restore root ownership of the new guest disk's system files before exposing
uid 1000 workloads, mount the guest's real cgroup-v2 filesystem, configure a new empty guest
pool, write guest-owned trusted node identity/pool files, and compile the original
production launcher with its existing hardening flags. They then run the original
native-suite typecheck, both complete native scope/topology modules, and every
maintained node-pools module. Node-pools cases are serialized to the fixed VM
budget. No assertion, required case, inner readiness limit or test deadline is
changed; failures are kept and no unavailable prerequisite becomes a skip.

## What remains unproven

`systemd-analyze` is not available in the prepared Alpine guest. The unchanged
node-pools generated-unit-parser case therefore remains an expected prerequisite
failure, even if the native modules pass. Its case is still executed, never
removed or mocked; separate native/node-pools exit codes remain in console
output and aggregate success remains false. The plan supplies native guest
functionality evidence, not a promised complete node-pools pass.

No boot or guest operation has been demonstrated. Kernel module loading, virtio
I/O, read-only 9p mounting, guest compilation and all test behavior still require
execution. Cached binary strings identify the needed devices, but that static
check is not a successful device initialization. The unaccelerated TCG guest may
miss the original 10-second readiness or 30-second test deadlines. Those limits
will not be extended to manufacture a pass; a slower fixture remains a failure
or incomplete result requiring separate review.

The native topology modules deliberately exercise guest OOM/task pressure. Any
later run therefore uses only the new guest's real kernel and cgroups, never the
workspace host's delegated groups. A pass would establish functionality on this
isolated Linux guest. It would not establish physical-host scheduling, available
production capacity, deployment performance, Kubernetes/NRI integration or full
IFR16 acceptance. The current physical-host prerequisites and broader integration
gates retain their separate status.

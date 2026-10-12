# Proposed isolated ext4 legacy-seal tests

## Current execution checkpoint

**Latest result: Run 5 passed all 29 maintained cases in 90.137 seconds**, with
normal guest/QEMU termination and no watchdog or source/tool drift. The
[original 27 cases](independent-legacy-seal-run5-20260921.md) and the
[two added descendant cases](independent-legacy-seal-descendants-20260921.md)
have separate nonauthor execution reviews. The
[raw result and case summary](../../evidence/buster-legacy-seal-vm-20260921/run5/summary.json)
bind the exact Generation 5 source/export and artifact preparation. Session
97246 is terminal; QEMU PID 295685 is absent. The tmpfs case now reaches the
required `EXT4_REQUIRED` rejection. All original test and memory limits remain
unchanged. This is the enumerated suite result, not full LIS/migration acceptance:
replaced-original-store association, writer-stop and importer authority remain
open. Earlier failures and memory interruptions below are retained as history.

The proposal and preparation notes below preserve their original stage. The first
two actual disposable guest runs are recorded here before the subsequent attempts. [Run 1](../../evidence/buster-legacy-seal-vm-20260921/run1/summary.json)
failed all 27 cases at the shared BusyBox mount prerequisite, before verification.
The mount correction retained every case and limit and received an independent
source review. [Generation 2](independent-legacy-seal-generation2-20260921.md)
received a fresh complete artifact review before execution.

[Run 2](../../evidence/buster-legacy-seal-vm-20260921/run2/summary.json) invoked all
27 cases: 26 passed; `tmpfs-root` failed because the verifier returned
`BUSTER_LEGACY_SEAL_AUTHORITY_INVALID` instead of the required `EXT4_REQUIRED`.
The expected rejection is unchanged. The full run remains failed pending diagnosis
and correction. The [independent raw-evidence review](independent-legacy-seal-run2-20260921.md)
confirms the 26 successful cases and their bounded kernel observations.
The [raw terminal result](../../evidence/buster-legacy-seal-vm-20260921/run2/vm-result.json)
records 78.011 seconds, normal QEMU shutdown, guest review exit 1, no watchdog or
source/tool drift, and both terminal disk hashes. Root exec session 35985 is
terminal and QEMU PID 262646 is absent. Original run artifacts and logs are retained.
No production host operation was performed. Neither run proves old-writer stop
authority or completes historical Buster migration.

The [tmpfs fixture correction](independent-legacy-seal-tmpfs-correction-20260921.md)
now mounts that negative fixture with explicit mode `0755` and checks/emits actual
UID/GID 0 and mode before invoking the unchanged `EXT4_REQUIRED` oracle. The
original default writable tmpfs root had correctly failed the earlier authority
guard. All other cases and limits are unchanged. Generation 3 has independent
runtime/source copies and fresh disks; the source driver is bound to
`d571b72b9f936e059782fb5cbdd5926e3077568cea2ab67c0019b254b78d8292`.
Its first [verify-only refusal](../../evidence/buster-legacy-seal-vm-20260921/generation3/verify-refusal.json)
occurred at the original memory guard before artifact checking or QEMU launch.
The subsequent observation found a live unrelated documentation-check chain.
No limit was raised or external process stopped. After that process ended,
verify-only session 64857 passed with the same limits and the independently
accepted [generation-3 artifacts](independent-legacy-seal-generation3-20260921.md).
[Run 3](../../evidence/buster-legacy-seal-vm-20260921/run3/summary.json) then booted,
but the unchanged 2.75-GiB workspace memory stop terminated QEMU after 26.805
seconds. New unrelated documentation processes were observed after the stop.
No case output or guest terminal review marker was published; outcomes are
unknown, not passed. Session 99297 is terminal and QEMU PID 277340 is absent.
The [criterion audit](independent-legacy-seal-criteria-audit-20260921.md) also
identifies missing descendant-authority and replaced-original-store association
proofs; merely passing the current 27 cases would not close the full contract.

Two descendant-authority cases have since been added and independently
[source-reviewed](independent-legacy-seal-descendants-20260921.md), preserving
every original case and limit. The complete driver now contains 29 cases.
[Generation 4](independent-legacy-seal-generation4-20260921.md) passed artifact
review and verify-only before launch. [Run 4](../../evidence/buster-legacy-seal-vm-20260921/run4/summary.json)
booted but was stopped after 34.902 seconds by the unchanged workspace memory
guard. It published no case result. No foreign workload was observed in the
post-run process list; the cause is not established. Session 93173 is terminal
and QEMU PID 290201 is absent. All four runs remain preserved.

The [cache-hygiene review](independent-legacy-image-cache-hygiene-20260921.md)
identifies full reads of preserved image files without subsequent cache hints as
a plausible contributor. Its proposed remedy is limited to read-only hash checks
and advisory eviction hints for those exact private images. It changes neither
guest/test limits nor the host memory guard, performs no global cache operation,
and does not establish that a subsequent run will fit.

The concrete helper was independently reviewed, including a requested exact
permission-mode check, and then executed successfully. Its
[actual measurements](../../evidence/buster-legacy-seal-vm-20260921/run4/own-image-cache-hints-result.json)
bind all eight images to their recorded terminal hashes and unchanged held-file
identities. After the advisory hints, observed workspace memory changed from
2,562,461,696 to 1,705,263,104 bytes and file cache from 1,790,156,800 to
934,522,880 bytes. These are shared-cgroup observations, not an exclusive causal
measurement or a no-OOM guarantee. No guest was launched by the helper. Future
preservation hash reads must apply the same bounded hints or they can refill the
cache; all runtime and test limits remain unchanged.

## Original preparation proposal

Preparation proposal only: no package download, image creation or VM execution is authorized by this artifact. This is a separate disposable fixture from the pending systemd/native guest. It tests the read-only verifier and physical immutable behavior, not the maintained old-workload stop producer or completed Buster migration.

## Fixed execution envelope

Reuse the reviewed launcher's existing limits unchanged: 1 GiB guest RAM, two vCPUs, bounded TCG cache, disabled networking, no device passthrough, read-only independently copied repository export, guest-only ext4 disk, fixed host memory refusal threshold, bounded console and boot/overall watchdogs. Carry their exact values from the frozen launch manifest when materializing; any difference requires review. No host mount, chattr, capabilities, cgroup mutation, package installation or global cache drop. Only one VM/heavy preparation window at a time. The existing test deadlines remain untouched.

New cache namespace: `node_modules/.cache/buster-legacy-seal-vm-20260921`. Use independent regular-file copies, no shared writable links to previous guests. Guest fixtures live exclusively under `/var/lib/legacy-seal-tests`, a real ext4 subtree of the disposable guest disk. Root-owned ancestors are checked before each verifier invocation. A second guest tmpfs/bind mount is used solely for negative controls. No imported user job or production PVC is involved.

Python3 is an actual guest prerequisite. In the coordinated preparation window fetch exact official Alpine Python3 package and recursive runtime dependencies using `apk fetch --recursive`, then `apk verify` every archive against existing trusted keys before extract-only installation into the new guest root. Freeze package version/size/SHA256, signature output and every extracted entry including contained symlinks. Do not assume the current cache includes Python. Pin the resolved version before creating images; stop rather than substitute a mock interpreter. Proposed incremental package ceilings: 64 MiB compressed and 192 MiB regular extracted bytes, with the existing total fixture limits also enforced. No pip, network inside the guest or maintainer scripts.

## Actual test execution design

A root guest driver creates small deterministic fixtures (at most 4 MiB data, 128 entries and 32 cases), records actual ext4 mount IDs, then sets and reads back FS_IMMUTABLE_FL using real ioctls. Preparation authority is confined to that guest driver. A separate child drops privileges to the production parent profile before verification. The child runs the unchanged verifier with isolated Python (`python3 -I`); the driver captures actual `/proc/self/status` capability sets and checks UID/GID before treating any case as meaningful.

The positive profile has CapBnd/CapPrm/CapEff exactly bits 0, 5, 6, 7, 8 (CHOWN/KILL/SETGID/SETUID/SETPCAP), empty inheritable/ambient sets, and UID/GID 0. The fixed Python child imports the unchanged verifier, applies actual prctl/capset transitions and invokes verification in that same process; no fabricated proc files or simulated ioctl results. The negative profile retains effective authority absent from the bounding set, with no intervening exec erasing that condition. Both profiles print their actual capability observation immediately before calling verify.

Every case runs in a separate process with a fixed 10-second case watchdog, at most 256 KiB stdout/stderr, and an overall 120-second driver watchdog. Parent reports failure on any missing phase, crash, timeout or unexpected status. These are new test deadlines, not changes to existing acceptance tests. A setup capability failure is a failed prerequisite, not a skip.

| Case | Required genuine observation |
| --- | --- |
| Complete sealed tree | Exact production profile, original store digest, full inventory and byte/entry/result totals match independently calculated fixture truth. |
| Exact quotas | Same complete tree succeeds at measured exact bytes/entries; one byte less and one entry less fail with the corresponding limit code. |
| Mutable regular child | Parent sealed, one original child missing immutable flag; rejects IMMUTABLE_REQUIRED. |
| Mutable directory child | Nested directory lacks immutable flag while surrounding tree is sealed; rejects IMMUTABLE_REQUIRED. |
| Plan-store symlink | In plan mode a real symlink below a sealed directory rejects ENTRY_INVALID before target access. Runtime mode has the distinct retained-link cases below. |
| Hardlink | Two names for one real regular inode reject ENTRY_INVALID. |
| Character device and FIFO | Genuine special entries reject ENTRY_INVALID. A syscall trace or seccomp audit verifies no data-open attempt occurs for either; O_PATH inspection alone is allowed. No device read is needed. |
| Nested bind mount | Same-device different mount ID rejects MOUNT_CHANGED; a different-device mount is also rejected. |
| Non-ext4 root | Root-protected tmpfs rejects EXT4_REQUIRED. |
| Capability outside allowlist | Real extra bounding/effective authority rejects CAPABILITY_BOUND_INVALID, including a child that retains effective SYS_ADMIN after dropping that bounding bit. Record all five actual sets. |
| Foreign/writable ancestor | Foreign ownership and group/world writable ancestry reject AUTHORITY_INVALID independently. |
| Missing original store | Complete sealed tree without records/store.json rejects STORE_REQUIRED. |
| Interrupted seal | Set flags on only a prefix, never publish a successful observation; rejection retained. |
| Physical mutation denial | Exact production-profile child attempts append, truncate, create, unlink, rename, chmod, chown and flag clearing against sealed entries. All fail, original bytes/inodes/flags unchanged. Corresponding unsealed private controls must succeed where authority permits, so DAC-only denial cannot masquerade as immutable proof. |
| UID1000 result read | Real UID/GID1000 child retrieves fixed legacy result bytes through pre-established read/traverse permissions; result hash remains unchanged. Mutation attempts are separately rejected. |
| Separate runtime inventory (LIS8) | A sealed runtime tree with no records/store.json succeeds only with the runtime schema and exact independently counted bytes/entries; plan mode rejects that same tree with STORE_REQUIRED. Runtime output contains neither store nor result-store counters. |
| Inert runtime links (LIS9) | Under an immutable runtime parent, retain one relative link to an internal file, one absolute link to a mutable external file and one dangling link. The independent inventory includes each link inode, actual text and encoded byte length exactly once. Changing the external file leaves the runtime inventory unchanged; changing it must still be possible in the privileged fixture control. Use a separate link to a FIFO with a data-open audit to prove target access is absent, rather than relying on a timeout or a readable-target coincidence. Plan mode rejects these entries. |
| Namespace-stable identity (LIS10) | Observe the same sealed ext4 tree through two real private mount namespaces with separately created bind mounts. Record that their mount IDs differ, while UUID, inode, inventory digest and totals match. Independently compare the UUID with the prepared ext4 superblock identity. A separate ext4 filesystem with a distinct UUID must not match the completed-source identity even when its logical file bytes match. No changed observation field may be overwritten to manufacture agreement. |

The mutation probe sets no flags itself after dropping authority. Only the guest driver can prepare or clean up its disposable trees. A pre-opened writable FD or mmap is not treated as revoked by setting immutable: no old-writer quiescence claim is made. An actual old entrypoint restart negative and captured CRI/cgroup stop proof remain separate maintenance-producer prerequisites.

### Capability child materialized; privileged execution pending

The test-only [capability child](../../../../tests/fixtures/test-gate/legacy-seal-capabilities.py)
now implements the two capability profiles with actual Linux `prctl` and `capset`.
It requires real root UID/GID and a normalized fixture below the fixed guest
directory, imports the unchanged verifier, applies the selected profile and
compares all five actual `/proc/self/status` sets to their exact expected values.
It prints that observation before calling the verifier. The `retained-extra`
profile retains permitted/effective SYS_ADMIN while removing its bounding bit;
there is deliberately no intervening exec that could erase the tested condition.
The `parent` profile has exactly the production capability sets described above.

Python parsing/help and whitespace checks have run. A real UID1000 invocation
[rejected before any capability transition](../../evidence/buster-legacy-capability-child-20260921/unprivileged-rejection.json).
Independent source review found no blocking defect in the two profile transitions
or same-process verifier call. This is source review, not privileged execution.
The guest driver, external watchdog, bounded output capture and frozen launch
artifacts remain required. In particular the driver must hash-bind the verifier
before import and distinguish the expected capability rejection from an unrelated
fixture/setup error. This child is not a standalone VM runner, stop authority or
executed LIS6 proof. No privileged capability transition has been attempted on
the host.

## Before launch

### Runtime materialization, not a booted guest

The [retained preparation recipe](../../evidence/buster-legacy-seal-vm-20260921/prepare-runtime.py)
has created the new private guest runtime: 51,666,020 regular-file bytes and
1,515 total entries under `node_modules/.cache/buster-legacy-seal-vm-20260921/guest-root`.
It verifies the complete Python/strace prerequisite entry sets and identities,
rejects conflicting overlapping package entries, then makes independent regular
copies. BusyBox, util-linux unshare and the matching musl loader are bound to the
existing tool-runtime manifest. Source identities were checked again after
materialization. All runtime links resolve within the new guest root.

[Source identities](../../evidence/buster-legacy-seal-vm-20260921/runtime-sources.json),
the [resulting runtime manifest](../../evidence/buster-legacy-seal-vm-20260921/runtime-identities.json)
and [actual private-loader probes](../../evidence/buster-legacy-seal-vm-20260921/runtime-probes.json)
are retained. Python imported fcntl/ctypes, strace reported its version and the
actual unshare/mount binaries returned help successfully. These are unprivileged
prerequisite checks; they performed no mount, namespace creation or ptrace.
The [independent materialization review](independent-buster-legacy-seal-runtime-20260921.md)
confirmed the complete entry set, byte count, 32 contained links, independent
inodes, four private probes and the resolved ELF library dependencies. This
acceptance is limited to runtime preparation.

LIS10 additionally requires an independently formatted second ext4 filesystem,
not a fabricated UUID field. The proposed disk layout is a 256-MiB private root
image at guest `/dev/vda` and a 16-MiB private second image at guest `/dev/vdb`.
Their combined 272 MiB stays below the existing 8-GiB logical disk ceiling.
Both are newly created regular cache files; neither is a host block device or
an existing guest's writable disk. The second device and exact QEMU attachment
must be included in the independent launch review before execution. The driver
checks actual block-device identities and reads both ext4 superblock UUIDs;
mounts remain confined to the guest.

The [image preparation recipe](../../evidence/buster-legacy-seal-vm-20260921/prepare-images.py)
has now created both new regular-file ext4 images, without host mounting or
booting. Actual mke2fs commands, distinct UUIDs, allocated/logical sizes and
hashes are retained in the [image-build record](../../evidence/buster-legacy-seal-vm-20260921/image-build.json).
The runtime and complete existing mke2fs tool closure were checked before use;
the tool closure and original driver sources were checked again afterwards.
The unchanged driver, capability child and verifier are independent copies in
the [frozen source export](../../evidence/buster-legacy-seal-vm-20260921/source-export-identities.json).
The [guest boot script](../../evidence/buster-legacy-seal-vm-20260921/guest-init.sh)
mounts only guest filesystems, fixes copied guest ownership before test children,
mounts the source export read-only and invokes the complete frozen driver.
Its exit marker preserves the actual driver status. The inherited kernel/initrd
were copied and matched against their existing artifact identities.

[Prepared artifact hashes](../../evidence/buster-legacy-seal-vm-20260921/prepared-artifacts.json)
and [guest payload identities](../../evidence/buster-legacy-seal-vm-20260921/guest-payload-identities.json)
bind this stage. The [launch wrapper](../../evidence/buster-legacy-seal-vm-20260921/launch.py)
and its [printed exact command](../../evidence/buster-legacy-seal-vm-20260921/launch-command.json)
are now materialized. The existing reviewed CPU/RAM/address-space, boot/wall,
console and host-memory guards remain unchanged. The wrapper verifies the
complete source export and emulator runtime before/after, and checks prepared
artifact regular-file types, modes, lengths and hashes. Both disposable disks
are expected to mutate during the tests; their final hashes are retained.
The [launch artifact manifest](../../evidence/buster-legacy-seal-vm-20260921/artifact-manifest.json)
binds those inputs and the wrapper itself. The emulator/tool closure is reused
read-only; no prior guest disk is shared. Only default command printing and
Python parsing have run. Independent boot/image/launch review and resource
preflight remain required. Neither a successful mke2fs command nor a source review is a
boot, immutable-filesystem or LIS test result.

### Separately reviewed fixed smaller-address-space corridor

The original launcher/manifest remain unchanged. The independent
[memory audit](independent-vm-memory-guard-20260921.md) rejected subtracting
potentially reclaimable slab from the initial observation: reclaim is not a
reservation. A separate [fixed-corridor audit](independent-vm-fixed-corridor-20260921.md)
supports the same limited additive budget argument with **768 MiB initial
`anon + kernel + shmem` and 1,792 MiB QEMU address space**, replacing the original
512 + 2,048 MiB pair. Both pairs total 2,560 MiB, leaving the same 256 MiB
arithmetic margin before the unchanged 2,816 MiB shared-memory stop threshold.
This does not promise no OOM or prove that QEMU fits the smaller virtual limit.

The new [fixed variant](../../evidence/buster-legacy-seal-vm-20260921/launch-smaller-as.py)
couples those constants with an explicit sum assertion, requires the three real
memory observations, and applies both address-space soft/hard limits before
exec. Guest RAM remains 1 GiB; CPUs, TCG cache, test deadlines, host CPU/wall/boot
watchdogs and console limits are unchanged. There is no slab subtraction,
automatic parameter choice or fallback to a larger address-space limit. Failure
to start or allocate remains a recorded failure; it cannot justify removing cases.

The [separate manifest](../../evidence/buster-legacy-seal-vm-20260921/artifact-manifest-smaller-as.json)
binds the variant and prior artifacts. It has a separate log destination and
[printed command](../../evidence/buster-legacy-seal-vm-20260921/launch-command-smaller-as.json).
The [independent implementation review](independent-vm-smaller-as-implementation-20260921.md)
checked the real pre-exec limits, paired boundaries, missing/invalid observations,
unchanged guest/isolation/watchdog parameters and manifest binding. Its actual
verify-only run passed with `vmBooted: false`.

The first subsequent execution request was refused by the same fixed memory
preflight **before QEMU started**. A [separate observation after refusal](../../evidence/buster-legacy-seal-vm-20260921/launch-refusal-smaller-as.json)
records a concurrent documentation-inventory process and the higher baseline;
it is explicitly not the exact earlier decision sample. No limit was raised and
no unrelated process was terminated. A passed preparation sample is not a promise
that later execution admission will pass. At that refusal no VM had started. All earlier
original-corridor refusals remain evidence, not retrospectively successful checks.

### First actual guest run: common mount prerequisite failure

After the observed documentation-inventory process was positively confirmed
terminal/absent, the unchanged smaller-address-space launcher admitted the run.
QEMU booted the real guest and both ext4 devices. It powered down normally after
40.55 seconds; no watchdog or source-drift check fired. The driver returned failure
and the wrapper correctly reported failure despite QEMU's normal exit status.

All 27 cases were invoked and all failed before verifier execution at the same
setup command: BusyBox `mount -o rprivate /` attempted to consult absent
`/etc/fstab`. Help-text/source inspection had not proved that invocation. These
are **27 failed prerequisites, zero passed verifier cases**, not skipped or
accepted kernel tests. The [raw console](../../evidence/buster-legacy-seal-vm-20260921/run1/vm-console.txt),
[wrapper result and artifact identities](../../evidence/buster-legacy-seal-vm-20260921/run1/vm-result.json)
and [case summary](../../evidence/buster-legacy-seal-vm-20260921/run1/summary.json)
are retained. Both original images and the frozen source export remain unchanged
as evidence of the exact run, except the explicitly mutable guest disk bytes
whose final hash is recorded.

The maintained driver requires a corrected real mount operation and a fresh
independently bound guest generation. No case, deadline or resource ceiling is
removed or increased to address this preparation failure.

Materialize and freeze the driver/launcher, original verifier hash, package inventory, kernel/initrd/disk hashes, source snapshot and exact launch command. First compile and syntax-check the test helpers, run verify-only without a VM, and obtain independent artifact review. Preserve failed preparations as evidence. Root coordinates any launch after the separate current guest and its review are terminal. This document makes no passing LIS1–LIS10 claim.


## Python prerequisite prepared; no guest execution

The separate private cache `node_modules/.cache/buster-legacy-python-20260921`
now contains official Alpine Python **3.14.7-r1** and its complete resolved
21-package dependency set. All archives passed actual `apk verify` against the
existing Alpine public keys before extraction. Compressed bytes total
18,259,765; extracted regular files total 48,106,065 across 1,483 total entries.
Archive headers were inspected before extraction against the 192-MiB ceiling;
all extracted symlinks remain within the private runtime. No maintainer scripts,
host installation, mount or guest boot occurred.

An actual isolated-interpreter probe used the extracted musl loader, Python and
libraries. Python reported version 3.14.7 and the private prefix; both `fcntl`
and `ctypes` loaded from that same private runtime. The [probe](../../evidence/buster-legacy-python-20260921/runtime-probe.json),
[signatures](../../evidence/buster-legacy-python-20260921/signatures.json),
[entry manifest](../../evidence/buster-legacy-python-20260921/runtime-identities.json)
and [extraction commands](../../evidence/buster-legacy-python-20260921/extraction.json)
are retained. The [independent prerequisite review](independent-buster-legacy-python-20260921.md)
accepted the exact package/runtime preparation after rechecking all 21 signatures,
42 dependency constraints, 1,483 entries and 19 contained links, and running its
own interpreter probe. This acceptance is not a LIS kernel result or a completed
VM fixture.

Preparation deviations are explicit in the [download record](../../evidence/buster-legacy-python-20260921/download.json):
`apk fetch --recursive --url` also downloaded into its initial working directory.
The unchanged archives were moved into the private cache. The established
64-MiB download ceiling was checked against the actual total afterwards, not
enforced incrementally by that first command. An initial relocation check used
mtime and rejected the archived upstream timestamps; it moved nothing. The
corrected check bound the exact fetched names and fresh inode change times.
Neither deviation is represented as an executed resource guard or installation.

## Syscall-audit prerequisite independently checked; guest execution pending

Actual `strace` **6.19-r1** and its nine resolved Alpine packages are independently
extracted under `node_modules/.cache/buster-legacy-strace-20260921/runtime`.
The retained [preparation recipe](../../evidence/buster-legacy-strace-20260921/prepare.py)
uses `apk fetch --simulate` solely to resolve exact URLs, streams downloads under
a 64-MiB aggregate ceiling, verifies every APK signature before extraction and
preflights archive paths/types/regular bytes under the 192-MiB ceiling. It invokes
only extract operations, without installation or maintainer scripts.

The nine archives total 1,781,557 bytes; signed archive headers account for
3,811,248 regular bytes including metadata. All 22 extracted entries and contained
links are bound in the [runtime manifest](../../evidence/buster-legacy-strace-20260921/runtime-identities.json).
The [command record](../../evidence/buster-legacy-strace-20260921/commands.json)
retains signatures, extraction and a successful real private-loader `strace -V`.
The [archive record](../../evidence/buster-legacy-strace-20260921/archives.json)
binds official URLs, sizes and hashes. The
[independent prerequisite review](independent-buster-strace-prerequisite-20260921.md)
reverified all nine signatures, exact dependency closure, signed payloads,
22 runtime entries and the private-loader version probe. A separately corrupted
archive was rejected. No traced verifier, privileged operation or guest boot has
run; this is not a LIS3/LIS9 syscall-audit result.

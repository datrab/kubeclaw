# Buster legacy immutable-source verification contract

Implementation preparation for historical import (HI1–HI9), not migration
acceptance. The chosen source is the immutable original `plan-jobs` tree; all
new writable state belongs in sibling `plan-jobs-v2`. A copied snapshot is not
an alternative cutover authority. See the [consumer inventory](buster-historical-consumer-boundary-20260921.md)
and [independent boundary review](buster-legacy-stop-boundary-proposal-20260921.md).

The read-only verifier below establishes a physical filesystem property only.
It does not establish earlier writer termination, remove writable mappings,
authenticate an external stop receipt, or prevent a privileged host administrator
from modifying storage. The production importer must additionally bind the
maintained stop transaction, original writer locks, old runtime capability bounds
and retained runtime artifact inventory. Until then nonempty startup remains
fail-closed.

## Execution checkpoint

The table retains the original requirements and records current bounded evidence.
Run 5 passed all 29 maintained cases. Its [27 original cases](independent-legacy-seal-run5-20260921.md)
and [two descendant cases](independent-legacy-seal-descendants-20260921.md) have
separate nonauthor execution reviews. The previously failing tmpfs case now
returns the unchanged expected `EXT4_REQUIRED` rejection. The execution history
preserves Runs 1/2 as failures and Runs 3/4 as memory-watchdog interruptions.

This is not final acceptance of every LIS/HI requirement. LIS7's replaced-original
association remains unproved at the maintained trusted consumer. Original writer
termination, completed receipt authentication and importer integration remain
separate requirements; the physical verifier does not invent those authorities.

## Acceptance requirements and current evidence

| Case | Production boundary and input | Required observation | Environment / state |
| --- | --- | --- | --- |
| LIS1 | Root-protected ext4 tree; every directory and file immutable | Streamed inventory and original store digest match actual bytes and identities | Run 5: complete-tree observation passed |
| LIS2 | One mutable child inside an immutable directory | Reject at that child's actual ioctl flags | Run 5: mutable file/directory cases passed |
| LIS3 | Plan-store symlink, multiply linked file, special file or nested mount | Reject before treating the entry as trusted source content | Run 5: link/hardlink/special/mount negatives passed |
| LIS4 | Foreign or writable ancestor/tree entry | Reject actual ownership/mode authority | Run 5: ancestor and both descendant negatives passed |
| LIS5 | Exact caller-supplied existing byte/entry quota, then one byte/entry less | Exact fit succeeds; insufficient quota fails during bounded traversal | Run 5: exact/short quota cases passed |
| LIS6 | Non-ext4 source or caller able to clear flags/substitute mounts | Reject unsupported mount or capability bounds | Run 5: capability negatives and exact non-ext4 rejection passed |
| LIS7 | Interrupted/partial seal, missing or replaced original store | No usable verification result; neither chmod-only nor a receipt is enough | Run 5: interrupted/missing cases passed; replaced-original association proof missing |
| LIS8 | Separately sealed legacy runtime tree, explicitly selected by trusted caller | Bind runtime identity/inventory/counts without requiring a plan record store; plan mode still requires its original store | Run 5: separate runtime/plan observations passed |
| LIS9 | Runtime workspace contains a retained symlink below an immutable directory | Preserve/hash the link itself without opening its target; plan mode still rejects symlinks; external targets never become sealed evidence | Run 5: retained link metadata and syscall observations passed |
| LIS10 | Same ext4 filesystem observed through distinct mount namespaces | Bind its real filesystem UUID and inode/content inventory, while using device/mount IDs only for current-traversal checks; foreign UUID rejects comparison | Run 5: real namespace/UUID observations passed; importer association remains separate |
| LIS-DOC | Verifier usage, supported filesystem and authority limits | Instructions distinguish tree verification from complete migration authorization | Current evidence updated; full usage/migration DOC acceptance pending |

The verifier reads regular files through held descriptors after no-follow type
inspection, binds the actual mount ID, rejects crossing that mount and checks
inode identities before/after reading. Runtime symlinks are a separate metadata
case described below; their targets are never opened by this verifier.
It hashes a deterministic streamed inventory instead of returning bulk records.
It applies existing byte/entry limits supplied by the trusted parent; it must not
invent larger migration quotas. Root subprocess execution uses isolated Python
(`python3 -I`) from the existing runtime image. This component neither sets flags
nor stops processes, changes permissions, creates locks or deletes data.

## Implemented read-only component; kernel acceptance pending

[`buster-legacy-store-verify.py`](../../../../scripts/buster-legacy-store-verify.py)
implements the observation. The trusted caller supplies `--maximum-bytes` and
`--maximum-entries` from its existing storage policy; the default root is the
fixed legacy location. Invoke it with `python3 -I`. Its single JSON result
contains the original store identity/digest, tree identity, deterministic
inventory digest, total regular-file bytes/entries and retained result counts.
No result is emitted on rejection. `--root` exists for trusted maintenance and
isolated verification; a request must never select this argument.
The trusted producer selects `--kind runtime` for the separate legacy `runs`
tree. Its distinct `buster-legacy-immutable-runtime.v1` observation has no plan
store or result-store fields. The default `plan` kind retains the required
`records/store.json` check. Neither kind authorizes import by itself. Runtime
symlinks are retained as root-owned, single-link inode metadata under their
already-verified immutable parent. The verifier uses `O_PATH` and `readlinkat`
to hash the actual link text, charging its byte count and one entry. It neither
follows the target nor claims that an external target is preserved or sealed.
Plan-store symlinks remain rejected. Historical artifact reads retain their
existing resolved-job-root containment and content-digest checks.

The first [independent source review](independent-buster-legacy-seal-verification-20260921.md)
found two issues, both corrected: all five capability sets are checked, and
children are inspected through `O_PATH` before any data-opening operation.
Only held regular-file/directory descriptors are reopened, with identity checks.
The capability allowlist is the existing parent profile (`CHOWN`, `KILL`,
`SETGID`, `SETUID`, `SETPCAP`); extra privileges are rejected. Its numeric
identities follow the [Linux capability definitions](https://raw.githubusercontent.com/torvalds/linux/v6.12/include/uapi/linux/capability.h).

Syntax and command help were checked during initial implementation. Subsequent
actual kernel results are recorded in the checkpoint and table above. This is
neither a stop-receipt producer nor a completed
production migration; no historical data has been changed or imported.


## Stable filesystem identity

Both observations include the ext4 filesystem UUID, read through the real
`EXT4_IOC_GETFSUUID` ioctl and checked again after traversal. The format and
read operation are defined in the [Linux 6.8 ext4 UAPI](https://raw.githubusercontent.com/torvalds/linux/v6.8/include/uapi/linux/ext4.h)
and [ext4 ioctl implementation](https://raw.githubusercontent.com/torvalds/linux/v6.8/fs/ext4/ioctl.c).
The deterministic inventory begins with this UUID and includes inode identities,
entry metadata and content digests. It excludes namespace/lifetime-local device
and mount numbers from its digest. Actual device/mount IDs are still required to
remain consistent within each traversal and are returned as current observations.

Completed-receipt verification must compare the stable UUID, inode and inventory
association to the captured volume. Historical device/mount/boot values remain
provenance; they must not be mistaken for an invariant Pod mount ID after restart.
The import descriptor binds the *current* verified device while streaming the
original inode. In-progress maintenance resume retains its stricter original
boot and restart-fence requirements.

Independent source review found no blocker in the UUID/inert-link delta. A real
unprivileged `O_PATH`/`readlinkat` probe read a link to a nonexistent target without
following it; this proves only that descriptor API behavior. No ioctl, complete
immutable-tree verification or LIS kernel acceptance is claimed from that probe.

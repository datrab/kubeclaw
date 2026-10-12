# Disposable VM proof for the Buster helper authority boundary

Status: artifacts prepared for independent coordinator review; no boot performed
by their author. The coordinator reviews the frozen
artifacts and executes the exact bounded wrapper under the existing user goal.
This reviewer did not implement the helper correction. This is a helper/identity
proof, not a Docker image build or completed Buster preparation integration.

## Fixed execution envelope

Reuse the previously reviewed native VM launcher isolation and unchanged limits:
1 GiB guest RAM, two TCG vCPUs, 64 MiB TCG translation cache, 2 GiB process address
space, 1,200-second CPU limit, 120-second boot and 900-second wall watchdogs,
64 MiB console cap, 2.75 GiB shared-memory cutoff and at most 512 MiB initial
nonreclaimable memory. Keep no network, no KVM/device passthrough, readonly source
export and an independent 8 GiB guest scratch disk. The coordinator alone boots
it when the heavy-test slot is free. No host root, setcap, mount or cgroup action.
Stop on the original bounds; never extend limits after a failed run.

Use a separate cache/export/disk/log namespace; preserve all prior VM artifacts.
Freeze only after the helper author finishes correcting the tests described
below. Bind every helper, build script, entrypoint, config/subordinate-ID module,
test and guest driver to exact hashes, plus compiler/tool packages, kernel,
initrd, Node and initial disk. Record the delta from the earlier frozen export
and all excluded current workspace changes. Verify export entry set, types,
containment and hashes before and after; record the changed scratch disk hash
separately. A reviewer other than the fixture preparer checks that manifest.

The existing guest lacks setcap/getcap. Before building its new disk, obtain
signature-verified distribution packages for the actual tools and dependency
closure, retaining exact versions/hashes. Execute these tools only inside the
guest. No fabricated getcap output or user-space capability emulation is allowed.
Compile both actual source variants with the production build script and exact
hardening flags, retaining compiler output. Install the restricted variant under
a guest-root-owned, nonwritable ancestor as root:GID1000 mode 0750, then apply and
read back its actual SETUID/SETGID file capabilities. The generic helper retains
no file capabilities. Missing prerequisites fail explicitly before proof tests.

## Required positive and adversarial cases

1. Run the maintained ordinary helper-authority suite as actual UID/GID1000.
   Preserve page-size, subordinate-ID normalization and every forbidden-target
   assertion. Denial must precede writes to genuinely UID1000-writable cgroup
   sentinel files; those files demonstrate ordering only, not kernel cgroups.
2. Run the maintained root-only suite in the guest. Actual service1000 executes
   the allowed 1001/1000 pair; `/proc/self/status` must show exactly those IDs,
   no supplementary groups, zero effective/permitted/inheritable/ambient
   capabilities and NoNewPrivs=1. Wrong callers with GID1000 must reach the C
   rejection policy; separate inaccessible-group probes establish ACL denial.
   Root and preparation1003 targets, partial/repeated flags and unrelated groups
   remain denied before any sentinel mutation. Explicit chmod is required for
   root-created sentinel write permissions; creation mode alone is umask-filtered.
3. Actual UID1000 attempts writes and rename/replacement beneath the root config
   namespace and immutable code fixture. Exercise the real config-root validator
   against wrong ownership, writable ancestors, symlinks and unexpected entries.
   These are actual Unix permission/validator proofs on a guest fixture, not
   assertions that the complete Docker image has been built and inspected.
4. Add a clearly labelled preparation-identity permission fixture: root-controlled
   ancestor, UID1003-private directory and sentinel. UID1000 cannot read/replace
   it directly or by requesting 1003 through the restricted file-cap helper.
   A legitimate UID1003 read confirms the sentinel exists and is accessible to
   its owner. This proves the identity boundary only; no unpublished/published
   source-ledger authorization or BP closure is inferred.
5. Preserve the actual production-derived fd9 regression: both service branches
   close the descriptor, attempted child unlock fails and a competitor remains
   blocked while the parent holds the lock. The inherited-descriptor negative
   control must unlock the same open-file-description. This Linux flock check
   already passes locally; retain its source/hash and raw output. It is not a
   claim that full entrypoint/BuildKit startup was executed.
6. A private guest negative-control binary built from the preserved old helper
   with the same actual file capabilities must demonstrate why the denied-target
   assertion matters: its UID1003 request can reach that sentinel, or the same
   maintained denial oracle fails at the intended boundary. Do not modify current
   production sources. Keep the separate current generic helper unprivileged and
   run a legitimate same-identity generic command to protect its original use.

All commands and expected case counts must be frozen before launch. Capture raw
exit statuses and test summaries, including failed prerequisites, cancellations
and negative-control failures. A positive run supports the bounded Linux guest
helper/permission semantics only; full browser behavior, built-image ancestry,
Buster source ownership/publication, cleanup reconciliation, physical hosts and
complete IFR-16 remain separately unaccepted.

## Current review findings and readiness

The initial root-only test used UID1001/GID1001 and UID1003/GID1003 against a
root:GID1000 mode 0750 executable, so it would hit EACCES before the expected C
policy exit 77. Root-created sentinel files also need explicit chmod 0666 after
creation. Both issues were corrected in the author's frozen local source snapshot before
this fixture was prepared. Both entrypoint service branches now
close fd9; the independent rerun of the production-derived Linux flock test and
its old-inheritance negative controls passed. Root's original vulnerability proof
remains preserved.


## Prepared artifacts and exact commands

The separate cache is `node_modules/.cache/buster-helper-vm-20260921`; scripts,
package signature checks, hashes and retained initial preparation failures are in
`docs/review/evidence/isolated-buster-helper-vm-proposal-20260921/`.
The export independently copies all 35,441 prior regular files and overlays
exactly the twelve frozen author paths plus three proof files beneath a new
`ha-proof` directory. It deliberately retains the earlier unrelated baseline;
this does not include current journal-capacity or Buster work in progress.

The guest executes the unchanged three-case service helper suite as UID1000 and
the unchanged two-case root helper suite plus two additional permission/generic
cases as root: **seven total tests**, with the actual vulnerable old-helper
negative control inside the source-permission case. It builds the current generic
and restricted helpers and the preserved old source with the actual production
build script. Only restricted and private old-control copies receive file
capabilities. No full browser, BuildKit or original native ownership suite is
substituted or claimed by these focused tests.

Signed libcap getcap/setcap version 2.78-r0 and util-linux setpriv 2.42.3-r1,
with their verified dependency closure, are added only to the new guest tree.
Initial preparation stopped on existing dependency files; the corrected merge
requires matching bytes for existing regular dependencies. A separately recorded
stop found `/bin/setpriv` was a BusyBox applet symlink; only that new-guest link
was replaced with the signed util-linux executable, without following or changing
its BusyBox target. Original VM trees/disks remain untouched. Both failed attempts
are retained; no VM ran during preparation.

`artifact-manifest.json` binds the disk, snapshot, guest driver, launcher and
packages. `snapshot-delta.json` gives exact source additions/changes and inode
independence. The readonly export is checked both before and after a run.

```sh
python3 docs/review/evidence/isolated-buster-helper-vm-proposal-20260921/launch-approved.py --verify-only
# Coordinator only, after independent artifact review and heavy-slot clearance:
python3 docs/review/evidence/isolated-buster-helper-vm-proposal-20260921/launch-approved.py --execute-reviewed-proposal --confirm-no-heavy-tests
```

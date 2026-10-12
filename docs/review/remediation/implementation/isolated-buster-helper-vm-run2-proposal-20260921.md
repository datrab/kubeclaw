# Corrected Buster helper guest proposal — run 2

Prepared for independent artifact review; no VM launched by the preparer. This
uses the failed HA export as an independently copied baseline and changes exactly
two root-authored test files: the original root test now invokes the new ordinary
caller bridge. No production helper or other source/test changes are included.
The original failed 6/7 run and subsequent ACL diagnostic remain preserved.

The correction follows measured guest evidence: root-started setpriv retained
effective DAC override before exec. The ordinary UID/GID1003 bridge instead
records its real IDs, empty groups and zero inheritable/permitted/effective/
ambient capabilities before asserting actual EACCES. It does not broaden the
expected helper-policy status or skip filesystem denial. All subsequent original
sentinel, allowed-browser identity, capability-drop and NoNewPrivs assertions
remain. The same seven cases run: service three, root two, additional permission/
generic two. Existing timeouts/assertions and the fixed VM limits are retained.

The fixture independently copies regular files (no shared inodes/hardlinks),
checks the exact two-file manifest delta, generates a fresh UUID, and constructs
a new 8-GiB guest disk. Signed package closure, production compiler commands,
actual guest filecap setup, readonly source export and old-helper negative
control are unchanged. It does not include later UID1004 or journal/Buster work.
Source identity means this frozen baseline plus the declared test correction,
not the whole current repository.

The unchanged isolation/resource envelope is 1 GiB RAM, two TCG vCPUs, 64 MiB TCG
cache, 2 GiB process address space, 120/900-second boot/run watchdogs, 1200-second
CPU limit, 64 MiB console cap, 2.75-GiB shared-memory stop and 512-MiB initial
nonreclaimable-memory preflight. No network, host mount/install/cgroup changes,
device passthrough or simultaneous VM. Root controls launch after fresh review.

Evidence and exact scripts:
`docs/review/evidence/isolated-buster-helper-vm-run2-proposal-20260921/`.
`artifact-manifest.json` binds initial disk, kernel, initrd, QEMU and snapshot;
`snapshot-delta.json` binds the precise correction. Previous mutable disks and
snapshots are untouched. A passing guest suite would prove bounded helper and
permission behavior, not complete image/Buster/source-ledger/IFR16 acceptance.

```sh
python3 docs/review/evidence/isolated-buster-helper-vm-run2-proposal-20260921/launch-approved.py --verify-only
# Coordinator only, after fresh review and exclusive heavy-slot clearance:
python3 docs/review/evidence/isolated-buster-helper-vm-run2-proposal-20260921/launch-approved.py --execute-reviewed-proposal --confirm-no-heavy-tests
```

Final `--verify-only` passed without boot. An initial attempt correctly refused
the fixed 512-MiB nonreclaimable-memory guard by a small margin; its log is
preserved. Only this new fixture's file-cache hints and quiescence preceded the
successful retry. No resource threshold or global cache setting changed.

# Independent immutable-tree verifier source review

Source review only; not kernel acceptance or completed historical migration. Python compilation passes. Reviewed identities are retained under `docs/review/evidence/independent-buster-legacy-seal-verification-20260921/`.

The initial review identified two findings, both corrected in the source recheck below:

1. `verify()` rejects dangerous bits only in CapBnd. Linux capability bounding-set removal does not clear capabilities already held in the effective/permitted sets. Reject the dangerous bits in the actual effective, permitted, inheritable and ambient sets as well as the bounding set. Guest tests must include a process whose bounding set is reduced while effective authority is still retained.
2. Child traversal opens arbitrary entries with O_RDONLY before checking their type. Opening a device can have effects before the subsequent fstat rejection. Inspect via O_PATH|O_NOFOLLOW first, reject symlinks/special files and mount changes, then reopen only the descriptor-bound allowed inode for reading and compare identities. The negative test must demonstrate rejection without opening the device for I/O.

The remaining design is suitably narrow: actual ext4 mount-ID checks per inode, immutable flag checks on every file/directory, root-owned nonwritable ancestry, regular-file hardlink rejection, streamed byte digests, explicit byte/entry limits, deterministic bounded directory sorting and before/after identity checks. It does not parse V1 JSON. It correctly declines to prove old process quiescence or revoke existing mappings. Root-protected ancestors and external restart exclusion remain separate prerequisites.

Readability and ownership checks do not prove UID1000 can retrieve old results; required read/traverse modes must be established and tested before the immutable seal. Runtime artifact paths lie outside this tree and retain their own inventory/accounting requirement. No LIS1–LIS7 case has been executed by this review, and a positive JSON observation must not be promoted to stop authority or a VerifiedHistoricalSource.

## Exact corrective source recheck

Both findings are resolved at source level. The verifier now requires every named capability field and rejects forbidden bits independently in CapBnd, CapEff, CapPrm, CapInh and CapAmb. Traversal first opens O_PATH|O_NOFOLLOW, checks type, root authority, hardlink count and mount identity, and only then reopens the held allowed inode through the fixed `/proc/self/fd/<fd>` path. The opened inode must match the inspected identity before recursion/read. The deliberate procfs reopening does not re-resolve the untrusted directory entry. Python compilation passes again.

The separately retained initial reviewed manifest remains unchanged; `corrected-identities.json` binds this recheck. Source acceptance resolves these two findings only. Actual capability-set and no-device-I/O controls plus LIS1–LIS7 remain unexecuted. No stop authority or complete-import acceptance follows from this correction.

## Production capability allowlist recheck

The verifier now rejects every bit outside CHOWN, KILL, SETGID, SETUID and SETPCAP in all five capability sets. Bit positions 0/5/6/7/8 match the production values file's explicit add list after drop ALL. This also excludes module loading, ptrace and any future bit; it is stronger than the previous three-bit denial. The predicate accepts subsets, not only equality, so the eventual positive guest case must deliberately establish and record the actual full production set rather than calling a cap-free process equivalent. Exact updated verifier and values hashes are retained in `allowlist-identities.json`. No actual capability/kernel case has run.

## Separate runtime observation source recheck

Reviewed the `--kind runtime` delta against LIS8. The default remains `plan`, which still requires `records/store.json`; runtime emits the separate `buster-legacy-immutable-runtime.v1` schema without pretending to contain a plan store. Both modes traverse the same bounded ext4/immutable/authority checks. Runtime selection is trusted-maintenance input, not request authority. The current runtime path deliberately rejects symlinks, so it cannot yet accept every legitimate legacy checkout; no symlink-following fallback or data removal was introduced. The change has source review only and no executed LIS8 kernel result. Updated hashes are retained in `runtime-kind-identities.json`.

## Filesystem UUID and inert runtime links

The exact ext4-specific GETFSUUID ioctl encoding and eight-byte header plus sixteen-byte result agree with the [Linux 6.18 ext4 UAPI](https://raw.githubusercontent.com/torvalds/linux/v6.18/include/uapi/linux/ext4.h) and [kernel implementation](https://raw.githubusercontent.com/torvalds/linux/v6.18/fs/ext4/ioctl.c). The verifier checks UUID before and after traversal and seeds the inventory with it. Inode/content metadata stays in that digest; namespace-local device/mount IDs remain actual traversal checks rather than portable digest components. Stable receipt comparison must use UUID/inode/digest; local mount/device observations must not be confused with portable authority.

Runtime-only links are read via the held O_PATH descriptor using readlinkat with an empty path. Their target strings, inode metadata and byte cost are hashed without opening or trusting the target. The already verified immutable parent prevents directory-entry replacement. Plan mode still rejects links. This does not certify external targets or permit result readers to escape their original confinement checks. No blocking source finding remains in this delta; LIS9/LIS10 kernel tests remain open. The contract's paragraph claiming all runtime links are rejected was reported as stale documentation.

Historical TypeScript observation decoders were aligned separately with the required nonzero lowercase filesystemUuid and distinct runtime schema; five decoder-only cases pass. These are not kernel or stop-authority proofs. `uuid-link-identities.json` records the exact reviewed verifier and decoder/test hashes.

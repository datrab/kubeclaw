# Prism content-addressed artifact acknowledgement

PCR-PRISM-STORAGE-001. The existing public ContentAddressedArtifactStore is now
implemented in storage/artifacts.ts; the original storage export remains its
public entry. Database/corpus behavior is outside this change.

put snapshots input bytes before its first await. It writes a private exclusive
pending file, fsyncs and closes it, then installs via an atomic no-clobber hardlink.
Concurrent identical writers cannot overwrite an object. Existing targets must be
regular files opened without following symlinks, match their digest, and be fsynced
before acknowledgement. Directory entries are fsynced, including ancestor entries
that another concurrent creator might not yet have flushed. Owned pending files
are removed and the directory synced before a successful call settles. A write,
verification, install, sync or cleanup failure returns an error, never an ACK.

Corruption policy is fail-closed preservation: get and repeated put reject the
corrupt object, leave its bytes untouched, and retain its identity for explicit
operator recovery. No automatic replacement, destructive quarantine, log deletion
or silent healing is introduced. A killed process may leave unacknowledged pending
files; those remain identifiable and manually cleanable. Readers do not require
write access or perform fsync. The root directory is trusted operator-owned storage;
this is not protection against a privileged process changing its namespace.

Independent review found a FIFO opening hazard in the first implementation. Opens
now also use O_NONBLOCK before the regular-file check, so a nonregular object is
rejected instead of hanging a request. The exact native FIFO regression passes.

Before: the original put returned success for an existing corrupted object, then
get rejected the same ID with digest mismatch. After: five real filesystem/native
process tests pass: corruption and symlink rejection without replacement; caller
buffer reuse; four independent concurrent writers; acknowledged content readable
after writer SIGKILL; FIFO get/put rejection under a bounded native-child assertion.
Original storage and Prism archive-integrity tests pass, as do Prism TypeScript and
canonical lint of new source/tests. Another agent independently repeated all five
new tests and reviewed the final protocol. No filesystem primitive is replaced.

Command: node --test skills/prism/tests/artifact-durability.test.mts.
Process SIGKILL proves process-restart behavior only. Powerloss, remote filesystem
semantics, storage-controller durability and complete Control/Worker deployment
have not been tested. Linux/POSIX hardlink and directory-fsync support are required;
unsupported storage fails visibly rather than returning an unproven durable ACK.

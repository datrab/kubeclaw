# Independent Buster strace guest prerequisite review

Accepted only as a prepared, authenticated private runtime prerequisite. This
review is separate from Buster preparation, historical cutover, and kernel
acceptance. The reviewer did not author the prerequisite producer.

Reviewed `buster-legacy-strace-20260921/prepare.py` and its archive, command and
runtime manifests. The script uses recursive simulated package resolution,
fixed official Alpine v3.24 main x86_64 URLs, a new private cache, signature
verification before extraction, and explicit 64 MiB download / 192 MiB regular
archive-header ceilings. It rejects absolute/traversal names, unsupported entry
types and escaping links. Its extract-only commands do not install packages,
run package installation scripts, alter the host package database, or boot a
guest. No traced process is executed by its `-V` probe.

Independent execution in
`docs/review/evidence/independent-buster-strace-20260921/review.py` verified:

- All nine actual APK hashes and sizes, and reran `apk verify` successfully.
- Dependency closure from the authenticated `.PKGINFO` data, including exact
  `libelf=0.195-r0` and all shared-library providers.
- Every extracted regular payload byte against its authenticated archive, every
  link target and its final containment, and the complete 22-entry runtime
  manifest including modes, sizes and hashes.
- Exact totals: 1,781,557 compressed bytes and 3,811,248 regular archive-header
  bytes. Metadata headers are included in the latter figure.
- Actual private musl-loader execution of strace, reporting version 6.19.
- A private one-byte corruption of the strace APK rejected by `apk verify`.
  The original archive remained untouched.

The raw independent commands, results and reviewed author source hashes are
retained beside the script. There is no ptrace execution, privileged host action,
guest run, deployed image verification or historical source-open audit in this
acceptance. Those remain separate gates.

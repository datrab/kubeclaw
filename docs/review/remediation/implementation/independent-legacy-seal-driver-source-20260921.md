# Fresh independent LIS driver source review

Bounded source review accepted for fixture preparation. This reviewer authored
neither the driver, capability helper nor production verifier. This is **not**
LIS kernel acceptance, artifact/launcher approval, a stop proof, or a VM result.
The root review's earlier lifetime and mount-namespace findings remain historical
failures; this review inspects their corrected source.

Reviewed files are `tests/fixtures/test-gate/legacy-seal-guest.py`,
`tests/fixtures/test-gate/legacy-seal-capabilities.py`, and
`scripts/buster-legacy-store-verify.py`. Exact SHA-256 values and unprivileged
results are recorded in [result.json](../../evidence/buster-legacy-driver-fresh-20260921/result.json).
No source changed during those probes.

The fixed 27-case inventory covers the declared LIS1–LIS10 edges, with a maximum
of 32 cases, 4 MiB / 128 fixture entries, ten-second individual and 120-second
driver watchdogs, 256 KiB child output and 8 MiB aggregate output. No case skips
or permissive prerequisite fallbacks exist. A case must exit successfully and
publish its exact terminal success record; otherwise it contributes a failure.
Infrastructure uncertainty aborts before cleanup or another case. Final output
explicitly denies stop authority.

Positive verification uses the real capability helper and unchanged verifier.
The helper checks all five actual capability sets; retained-effective SYS_ADMIN
is tested without an exec erasing the negative condition. Independently computed
fixture inventories bind UUID, inode, byte counts, link text and file digests.
The second filesystem and concurrent mount-namespace cases inspect genuine
block-device/mount identities, not fabricated UUID fields. Runtime-link controls
change the external target while requiring the retained metadata inventory to
remain identical.

The syscall audit requires actual matching opens and only allows O_PATH access
to the protected special/link inode. Deliberate real data opens are positive
controls for rejection. The readonly source distinguishes that audit from mere
completion without a blocked FIFO. Mutation denial includes unsealed controls
and unchanged original bytes/inodes/flags; flag-clear authority limitations are
explicit rather than reported as successful privileged controls.

Each privileged case is designed to run as PID1 in a separate real PID namespace.
Before fixture creation, its acknowledgment binds the outer-observed namespace
init through pidfd. Ordinary cleanup requires positive init termination; Linux
PID-namespace teardown supplies the descendant lifetime boundary. Namespace
workers remain alive together for the mount comparison. None of these privileged
mechanisms was executed in this review. An unkillable kernel wait remains subject
to the outer guest watchdog; source-level child timeouts are not a claim that
arbitrary kernel failures can always be resolved within ten seconds.

Own unprivileged probes executed a successful child and exercised actual child
timeout, output overflow and nonzero status. Synthetic *audit text only* checked
a valid O_PATH row, detected a data reopen through `/proc/self/fd`, and rejected
missing target observations. All five negative controls and both positives
passed. The audit-text probes do not substitute for the mandatory actual guest
strace observations. No capabilities, namespaces, mounts, immutable ioctls or
host-root operations were used.

One documentation correction remains: the proposal describes a positive
capability transition followed by exec, whereas the helper imports the verifier
and applies real capability changes in the same process for both profiles. The
actual exact-set checks are adequate for the proposed verifier boundary, but the
text should describe that implementation accurately. This does not establish a
packaged executable's separate exec-time capability behavior.

The final independently reviewed disk/launcher manifest must bind these exact
sources and genuine prerequisite packages, both private ext4 devices, and the
unchanged resource guards before any root-coordinated launch. Every real guest
case must still execute and pass; source review does not waive a missing case,
capability failure, syscall-audit failure, timeout or failed post-run binding.

# Independent isolated native VM run 2 review

**Bounded fixture preparation accepted for the unchanged launch envelope.** No
run 2 VM was booted by this reviewer. This follows the
[failed first run and missed identity check](independent-isolated-native-vm-proposal-20260921.md);
its raw failures remain preserved and are not reclassified as passes.

The launcher differs only in separate cache, VM name and manifest paths. RAM,
vCPU/TCG, address-space/CPU/wall watchdogs, memory monitor, output cap, no-network
configuration and read-only export are identical. The fresh ext4 disk has a
different inode from run 1; original mutable disk and logs remain separate.
Both original test command lists and their cases/deadlines remain unchanged.
Phase markers add observability without changing test control flow.

The new guest-specific UUID was generated once with Python uuid4 and persisted
as `/etc/machine-id`, mode `0444`. The preparation recipe validates its exact content
and UUID before image creation. Guest initialization makes `/etc` root-owned before
calling the unchanged production identity reader on that exact file. Only a
successful actual reader call permits compile/typecheck/tests to continue. This
is a prepared identity generated for this disposable guest, not a claim about a
physical host or synthetic kernel measurements.

`run2-delta.json` in `../../evidence/isolated-native-vm-independent-20260921/`
records exact script comparison and identity checks. `run2-final-binding.json`
verifies the final small artifact hashes and records the author's actual
verification-only success. Initial disk SHA-256 is
`e214e47071eba919812e05f820ae9acb3021e7902a3d59c20804bf11cf81e9bf`.
The immutable source manifest remains
`38f9e278cc33b49dcc0668d43c5019be36601879df07e81ad44b0b7039c11d67`.
This reviewer did not repeat the whole 8 GiB disk hash read.

The snapshot deliberately retains the exact run 1 source. The current-source
comparator matches 131 of 134 rows; the concurrently changed authored swarm JSON,
shared schema and loader remain at their frozen earlier versions in the guest.
A result therefore cannot claim coverage of the complete current repository or
those later configuration edits. Native Core and test bytes remain unchanged.

Systemd-analyze is still missing and must produce the original case failure.
Run 1's four original test-timeout cancellations remain unresolved; no deadline
has been enlarged. Preparation acceptance covers this bounded fixture only; it is not native-test,
full node-pools, deployment or overall goal acceptance.
The coordinator performs the actual launch and retains its outcome.

## Actual execution outcome

Run 2 failed. The coordinator's exact bounded wrapper recorded normal QEMU
poweroff, no watchdog stop, 507.97 seconds elapsed and `passed: false`.
Identity, full launcher compile and native typecheck each passed. Original native
cases finished **11/12 passed, one failed, zero cancelled/skipped**. The passing
cases include real helper memory/task exhaustion with parent event propagation,
unrelated leaves retained, unknown/replaced/nested child refusal and actual
subtree drain after a metadata failure. These are guest-kernel observations,
not directory models or proof of physical host deployment.

The remaining production-launcher/whole-host case failed because
`runNativeWorkerProcess` forwarded the complete process policy to scope allocation;
the newly strict scope decoder rejected non-scope fields with
`WORKER_NATIVE_LIMIT_INVALID`. Root identified the concrete call boundary from
this stack. This is a production regression missed by the previous topology
implementation/review, not a guest fixture failure. The reviewer of this VM
is now authoring the small boundary correction, so a different fresh reviewer
must accept that correction. Run 2's frozen source does not contain it.

Original node-pools cases finished **30/35 passed, one failed, four cancelled,
zero skipped**: the missing actual systemd parser remains the failure, and the
same accepted/sealed journal, contention and supervisor deadlines cancelled.
Their cause is not established by this execution and their deadlines were not
changed. Neither native nor node-pools full acceptance is granted.

Exact raw console/result copies and hashes, parsed counts and wrapper result are
retained in `run2-independent-result.json` beside the earlier review evidence.
This preserves both the first run's missed UUID prerequisite and the second
run's newly exposed product failure; neither failed run is relabelled green.

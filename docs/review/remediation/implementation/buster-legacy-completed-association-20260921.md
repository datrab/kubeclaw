# Completed legacy receipt association: local consumer boundary

The following cases are recorded before adding the consumer tests. They exercise
`complete(..., phase='completed')` in the maintained stop transaction module.
Verifier observations are explicit protocol fixtures; verifier execution, receipt
publication and service restoration are replaced only at these external boundaries.
No host operation is allowed in this suite. This is not the missing LIS7 ext4
replacement proof, not a genuine stop receipt and not importer integration.

| Case | Required result |
| --- | --- |
| Completed plan observation has a different store inode with equal bytes/digest | Exact `BUSTER_LEGACY_STOP_PLAN_SEAL_CHANGED`; no runtime verification, publication or unit restoration. |
| Plan matches, completed runtime observation has a different inventory digest | Exact `BUSTER_LEGACY_STOP_RUNTIME_SEAL_CHANGED`; neither publication nor restoration. |
| Both stable observations match but namespace-local mount/device identifiers differ | Both actual comparator calls accept; original encoded receipt goes to publication before restoration; returned receipt is the original. |

The original fourteen unprivileged tests must remain intact. New tests must fail
if the maintained completed-transaction comparison is removed. Kernel tests with
real original/replacement observations remain separately required and are being
prepared without changing their existing limits or original cases.

## Local result

The full maintained unprivileged suite now passes **17/17**: the fourteen existing
cases plus these three completed-consumer cases. No production source was edited.
[Raw result](../../evidence/buster-legacy-completed-association-20260921/tests.txt).
The original test bodies were left untouched; this report does not claim a saved
pre-edit source hash or an independent pre/post AST comparison for that edit.

Two isolated-process mutations replace the maintained comparator's decision for
plan-shaped or runtime-shaped observations. Each runs all three new cases and
fails exactly its corresponding rejection case with `ValueError not raised`;
the other two cases pass, with no errors or skips. The runner checks those exact
outcomes and does not count import failures or timeouts as detection.
[Plan mutant](../../evidence/buster-legacy-completed-association-20260921/mutant-plan.txt),
[runtime mutant](../../evidence/buster-legacy-completed-association-20260921/mutant-runtime.txt),
[runner](../../evidence/buster-legacy-completed-association-20260921/mutants.py),
[bound source identities](../../evidence/buster-legacy-completed-association-20260921/identities.json).

The [fresh nonauthor review](independent-buster-legacy-completed-association-20260921.md)
accepts this bounded slice with its own 17/17 run and both detected mutants.
The production K3s stop boundary remains
unresolved, the kernel replacement case is not executed by these tests, and
neither legacy import nor either full Buster finding is closed.

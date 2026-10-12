# Nova source cleanup error retention — 2026-09-21

Status: independently source-reviewed correction integrated; real tests and runtime acceptance pending. This is not CONFIG or a whole original finding closure.

Nova previously collected timed KILL failures without rejecting when native close and group acknowledgement subsequently succeeded. A failed initial TERM also skipped installation of the native-close wait entirely; sourceGit correctly rejected with CLEANUP_UNCONFIRMED but could settle before actual termination. The correction preserves observed signal/group causes, still awaits native close under the unchanged existing deadline, and rejects after an observed failure even if the child later closes.

Three added regressions own genuine detached Node children and narrowly inject TERM, KILL or group-observation errors. They require exact cause identity and actual OS close; the group case deliberately holds close notification after OS close and requires the original cleanup timeout as well. This is injected-error coverage, not real kernel EPERM/EACCES evidence. Original nova-source-deadline.test.mts tests and deadlines are unchanged and remain required in full.

Nova still authors 1500/250/10 ms locally. Shared Foundation identity capture still authors 250 ms; no configuration migration is implied. The [process-group inventory](../../evidence/process-group-authority-inventory-20260921/inventory.md) retains all affected consumer distinctions.

The [integration identities](../../evidence/nova-source-cleanup-errors-20260921/integration-result.json) bind the reviewed production correction and new test. Required next gates: Nova types, canonical affected-source lint, complete original deadline suite plus new tests, old-implementation negative control, relevant sourceGit integration and independent final review. No cluster, deployment or host changes are involved.

## Subsequent independent verification

The [independent runtime review](independent-nova-source-cleanup-implementation-20260921.md)
accepts this bounded correction: Nova type checking and the affected canonical
lint passed, all three original deadline cases and three added error cases
passed, and substitution of the exact old lifecycle produced the three intended
assertion failures. Source bindings did not drift during those runs. The original
tests include a real Git compressor, kernel-lock draining and an escaped pipe
owner; the new injected-error cases retain their explicitly limited scope.
The Kubernetes cleanup contract integrated afterwards is a separate change and
does not inherit these results. Local Nova timing authors and CONFIG remain open.

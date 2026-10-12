# Buster v2 runtime

Nova owns the pipeline graph, lifecycle journal, effects, waits, and final stage
transitions. Buster owns deterministic test execution and Buster agent sessions.

The [execution configuration reference](buster-execution-configuration.md)
describes the central Buster policy, required fields, durable-store capacities
and ownership boundary with Worker Core.
The [fixture cleanup contract](buster-fixture-cleanup.md) explains the host's
explicit cleanup authority, retained fixtures, replacement provider sessions
and the remaining historical recovery boundary.
The [parallel failure contract](buster-runner-failure-drain.md) describes settling
already-started nodes before fixture cleanup after an unexpected rejection.

All suites use `test.plan.execute` on port 18891. Buster verifies the
signed source archive, resolves installed providers, runs granted capabilities,
and stores the typed result.

Deterministic execution uses one neutral capability and one Buster-owned
protocol:

1. Nova invokes `test.plan.execute`.
2. The adapter creates a bounded `git archive` of the exact committed revision.
3. It submits one authenticated provider-plan request to Buster.
4. Buster validates the closed request, digest, suites, limits, and paths before
   accepting it.
5. Buster extracts the snapshot into a disposable job directory and runs the
   provider graph with exact grants and isolated attempt directories.
6. Nova polls the durable plan receipt and commits the typed result into the
   normal v2 effect and lifecycle journals.

Nova owns the Git archive process until native close and process-group cleanup
are acknowledged, or its cleanup deadline fails. A TERM or timed KILL error is
retained even if the child subsequently closes. Failed group observation is
recorded immediately while the native-close wait continues under the same bound.
Unconfirmed cleanup reaches the caller as `NOVA_SOURCE_CLEANUP_UNCONFIRMED`;
destroyed pipes alone are not evidence that the child terminated. Nova's current
cleanup, grace and polling values are still local policies; Buster's central
`execution.processInput` configuration does not configure this Nova path.

The Buster judgment stages compose two independently routed capabilities in a
strict order:

1. `test.plan.execute` returns validated evidence and a
   `test-plan-receipt.v1`.
2. Only then may the extension invoke `runtime.dispatch` for the Buster role.
3. The reasoning adapter receives the immutable suite evidence and returns the
   typed judgment.

Both Buster judgment registrations require grants for both capabilities.
Missing, failed, or malformed plan receipts block the stage before
`runtime.dispatch`; the agent cannot manufacture or bypass objective evidence.

Plan IDs derive from the v2 effect idempotency key. Repeated submissions with
the same ID and body return the same durable status. A different body with the
same ID is rejected. Cancellation terminates the job process. A worker restart
turns an interrupted job into an explicit failure so the pipeline retry policy,
not the worker, decides whether to execute it again.

The resolved provider graph determines the exact runtime capabilities. A node sees
the BuildKit socket only when image building is required and receives a
short-lived, job-local Kubernetes configuration only when Kubernetes is
required. Worker authentication and durable status storage never enter the
job process or its writable filesystem. The worker retains only the compact
terminal receipt; archives and extracted repositories are deleted at terminal
completion. A late cancellation cannot replace a completed or failed receipt.
Authoritative job receipts live on a sidecar-only ephemeral volume; the Buster
gateway shares neither that volume nor the worker's process filesystem.

Buster agent sessions currently use the OpenClaw implementation of
`runtime.dispatch`. Their atomically written result files live on Buster's
workspace volume and are read through the same authenticated Buster service.
Nova never receives Buster's filesystem, BuildKit socket, Kubernetes token,
gateway token, or process authority. OpenClaw is an adapter choice, not a core
contract.

There is no Redis task queue, local Nova suite execution, shared cross-pod
filesystem, legacy suite-worker contract, or compatibility fallback in this path.

## Provider-result and report boundary

`TestPlanRunner` validates each provider result through
`skills/buster/engine/test-gates/provider-result-validation.ts` before freezing
and staging it. The boundary checks serialized size, the provider-result schema,
count consistency, provider-specific details, evidence declarations and report
references in that order. Report finalization lives in
`specialist-report-finalization.ts`: it consumes retained evidence and resolves
the exact registered adapter/package before adapting reports within the existing
shared report budget. For direct commands it derives the final verdict and counts
from the reports and the configured result mode.

The report adapter's total deadline covers source preparation, package snapshot
and child execution. An expired internal deadline is reported as
`REPORT_ADAPTER_TIMEOUT`, including when child shutdown first reports a wrapped
signal cancellation. Only the exact internal deadline cause is translated;
caller cancellation retains its own meaning, even with identical error text.
An unconfirmed process cleanup remains `REPORT_ADAPTER_CLEANUP_FAILED` and keeps
the package snapshot for diagnosis. The deadline correction does not override
that failure or claim that external effects were rolled back.

The finalizer receives contract data separately from its registry, adapter
executor and cancellation signal. This makes the phase independently testable;
it does not create a native process boundary. These internal inputs are not an
independently admitted wire request. The production runner still uses its V1
attempt operation; complete native attempt ownership, retained fixture lifetime,
and capability/helper accounting remain open work in the
[native integration design](../review/remediation/implementation/buster-native-integration-seam-20260921.md).
The [extraction record](../review/remediation/implementation/buster-specialist-extraction-20260921.md)
records the exact slice and its validation limits, including original tests that
could not pass in the current workspace.

Within the adapter runtime, `report-adapter-package.ts` owns bounded package
snapshot reading/writing and `report-artifact-reader.ts` owns file artifact
verification. `report-adapter-runtime.ts` continues to expose the reader API and
owns deadlines, process execution, authoritative result binding and snapshot
cleanup after confirmed process disposal. The
[report runtime extraction record](../review/remediation/implementation/buster-report-runtime-extraction-20260921.md)
records the unchanged limits and tests; this module split adds no native
whole-attempt ownership guarantee.

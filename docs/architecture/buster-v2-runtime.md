# Buster v2 runtime

Nova owns the pipeline graph, lifecycle journal, effects, waits, and final stage
transitions. Buster owns deterministic test execution and Buster agent sessions.

Deterministic execution uses one neutral capability and one Buster-owned
protocol:

1. Nova invokes `test.suite.execute`.
2. The adapter creates a bounded `git archive` of the exact committed revision.
3. It submits one authenticated `buster-suite-job.v2` request to Buster.
4. Buster validates the closed request, digest, suites, limits, and paths before
   accepting it.
5. Buster extracts the snapshot into a disposable job directory and runs the
   suite engine sequentially under a separate UID with all Linux capabilities
   dropped and a private PID namespace. Cancelling the namespace supervisor
   destroys every descendant, including processes that create a new session.
6. Nova polls the durable `buster-suite-status.v2` receipt and commits the
   returned `buster-suite-result.v2` into the normal v2 effect and lifecycle
   journals.

The Buster judgment stages compose two independently routed capabilities in a
strict order:

1. `test.suite.execute` returns validated evidence and a
   `test-suite-receipt.v1`.
2. Only then may the extension invoke `runtime.dispatch` for the Buster role.
3. The reasoning adapter receives the immutable suite evidence and returns the
   typed judgment.

Both Buster judgment registrations require grants for both capabilities.
Missing, failed, or malformed suite receipts block the stage before
`runtime.dispatch`; the agent cannot manufacture or bypass objective evidence.

Job IDs derive from the v2 effect idempotency key. Repeated submissions with
the same ID and body return the same durable status. A different body with the
same ID is rejected. Cancellation terminates the job process. A worker restart
turns an interrupted job into an explicit failure so the pipeline retry policy,
not the worker, decides whether to execute it again.

The submitted suite list determines the exact runtime capabilities. A job sees
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
filesystem, legacy contract, or compatibility fallback in this path.

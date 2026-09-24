# Pipeline Test-Gate Phase 5 Audit

Status: complete

## Scope

Phase 5 adds the test-plan runner.

The runner executes the immutable plan from Phase 4.

It does not make the final gate decision. Nova keeps that authority.

## Implemented Parts

### Provider Execution

The runner:

- Matches each plan node to the locked provider registration.
- Checks the frozen package digest before it loads provider code.
- Copies the verified package and its runtime dependencies into one immutable attempt snapshot.
- Loads the declared package export.
- Starts one killable provider process for each attempt.
- Creates one provider instance inside that process.
- Rejects an invalid provider export.
- Requires every fixture provider to support cleanup.

### Scheduling

The runner:

- Starts independent ready nodes in parallel.
- Applies the operator-wide parallel-work limit.
- Applies named concurrency-group limits.
- Waits for all declared dependencies.
- Applies dependency result filters.
- Skips a node when a required result is not accepted.
- Runs each expanded matrix node as a separate node.

### Retries

The runner:

- Uses the retry count from the resolved plan.
- Preserves every attempt result.
- Does not retry a cancelled attempt.
- Marks a fail-then-pass node as unstable.
- Requests cleanup before it retries an attempt.

### Typed Data Links

The runner:

- Transfers only declared value and artifact links.
- Checks each provider output against its declared output port.
- Requires every required provider output.
- Rejects missing or incompatible outputs.
- Gives an artifact consumer the stored artifact reference.

### Evidence

The runner:

- Accepts only explicit provider evidence entries.
- Rejects duplicate evidence IDs and file paths.
- Rejects unsupported evidence types.
- Uses the resolved evidence policy for pass, fail, and error results.
- Adds runner-captured provider logs when `log` evidence is selected.
- Prevents evidence paths from leaving the attempt evidence directory.
- Stores evidence before it creates an artifact reference.
- Calculates a SHA-256 digest for every stored artifact.
- Enforces artifact file and byte limits.

### Limits and Cancellation

The runner:

- Enforces the wall-time limit.
- Terminates a provider that does not respond to cancellation.
- Enforces the provider-result byte limit.
- Enforces the log byte limit.
- Enforces artifact file and byte limits.
- Applies CPU, memory, open-file, and process limits at the process boundary.
- Measures the provider process and its child processes.
- Denies direct network, subprocess, worker, native-addon, symlink, and hard-link access.
- Grants read access only to the package snapshot, repository, and declared artifact inputs.
- Grants write access only to the attempt scratch and evidence directories.
- Supports pipeline cancellation.
- Uses a separate bounded cleanup time.

The provider process is inside the shared Buster worker Pod. A separate Pod is
not required for a normal provider.

### Results and Receipts

The runner:

- Validates the provider result contract.
- Checks that test counts add up.
- Creates one immutable attempt result.
- Creates one immutable final node result.
- Records CPU time, maximum memory, log bytes, and artifact bytes.
- Calculates result digests.
- Creates receipts outside provider control.
- Keeps blocking and advisory modes as facts only.

### Cleanup

The runner:

- Requests test cleanup after each attempt when the provider supports it.
- Requests cleanup for a failed fixture attempt before a retry.
- Keeps a successful fixture until dependent work is complete.
- Cleans successful fixtures in reverse completion order.
- Records cleanup failures.
- Changes the affected final node to `errored` when cleanup fails.
- Publishes an immediate cleanup failure before dependent scheduling.
- Removes the verified package snapshot after cleanup.

## Contract Correction

A provider can complete an attempt with the outcome `skipped`.

The Phase 2 node-result schema did not permit a completed skipped node with a
real attempt. Phase 5 corrects this rule. A completed provider skip now keeps
its attempt and can satisfy a dependency that accepts `skipped`.

## Decision Coverage

Phase 5 completes the runtime part of:

- D-072: explicit dependencies.
- D-074: bounded parallel execution.
- D-075: default retry behavior and unstable results.
- D-076: matrix-node execution.
- D-078: explicit evidence lists.
- D-079: provider evidence defaults and project evidence settings.
- D-081: installed trusted provider execution.
- D-086: typed value and artifact links.
- D-087: provider execution with fixture cleanup.
- D-088: dependency result filters.
- D-092: basic resource measurements.

D-082 remains open only for the final Buster capability-policy connection.
Phase 5 enforces the provider filesystem, network, subprocess, worker,
native-addon, and resource boundary.

## Proof

The Phase 5 proof checks:

- Parallel ready-node execution.
- Named concurrency limits.
- Default retries and unstable results.
- Failed-result dependencies.
- Rejected dependencies.
- Planned and provider-selected skips.
- Matrix execution.
- Typed value transfer.
- Typed artifact transfer.
- Evidence storage and digests.
- Time limits.
- Cancellation.
- CPU limits.
- Log limits.
- Artifact limits.
- Capability grants and denials.
- Cleanup success and failure.
- Plan-digest rejection.
- Installed provider loading.
- Package-change rejection after registry freeze.
- Forced termination of a provider that ignores cancellation.
- Cooperative cancellation through the provider signal.
- Direct filesystem, subprocess, network, symlink, and hard-link denial.
- Verified package snapshots with runtime dependencies.
- Package replacement after snapshot verification.
- Snapshot removal after cleanup.
- Isolated producer-to-consumer artifact transfer.
- Cleanup-failure propagation before dependent scheduling.

## Independent review

Closeout used only:

```text
model: gpt-5.6-terra
reasoning: high
```

The review accepted 18 findings across the implementation cycles. Each
accepted finding was fixed and added to the proof where applicable.

The accepted findings were:

1. Recheck the installed package digest when a cached provider factory is
   reused.
2. Convert a missing linked output into an errored attempt and node result.
3. Terminate a provider that does not cooperate with its time limit.
4. Measure and enforce the declared provider process limit.
5. Apply filesystem and capability restrictions to every provider process.
6. Reject a fixture provider that does not implement cleanup.
7. Stop a provider when it exceeds its log-byte limit.
8. Prevent evidence-file replacement through a symbolic-link race.
9. Terminate a provider when cleanup exceeds its cleanup time limit.
10. Deliver cooperative cancellation to the provider execution context.
11. Give a consumer access to only its declared stored artifact inputs.
12. Remove UID-wide `RLIMIT_NPROC` use from the shared worker process model.
13. Prevent provider evidence from colliding with runner-owned log evidence.
14. Copy and pin verified provider package bytes before execution.
15. Prevent symbolic-link escape from provider-writable directories.
16. Include locked runtime dependencies in the verified provider snapshot.
17. Publish cleanup failure before dependent nodes can start.
18. Delete each per-attempt provider snapshot after termination and cleanup.

Two findings were rejected:

- A Node-only network warning was not applicable because the native seccomp
  filter already denies network syscalls. A direct network-denial proof was
  added.
- `RLIMIT_NPROC` was not restored. It counts every process for the shared
  worker user and is not a provider-scoped limit. Direct child processes,
  workers, and native add-ons are denied. The parent also enforces the provider
  process-tree limit. A PID namespace or cgroup remains optional defense in
  depth for a future worker-isolation phase.

Proof command:

```text
npm run verify:test-gate:plan-runner
```

Proof file:

```text
tests/verification/contracts/check-pipeline-test-plan-runner.mts
```

## Later Work

Phase 5 does not:

- Parse JUnit reports. Phase 6 owns report adapters.
- Connect Nova to Buster. Phase 7 owns that connection.
- Add the unit provider. Phase 8 owns the first provider migration.
- Make blocking or advisory gate decisions.
- Remove the legacy suite runner.

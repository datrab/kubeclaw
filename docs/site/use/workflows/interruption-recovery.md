# Interrupt a Core Attempt and Recover Its Original Checkpoint

Status: executable local checkpoint recovery rehearsal. External-effect recovery has explicit stop outcomes
Audience: pipeline operators and runtime maintainers
Owner: Nova Core maintainers
Evidence: tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs; tests/fixtures/plugin-system-v2/resume-plugin; tests/verification/reliability/external-effect-recovery.test.mts; skills/nova/core/execution/effect-recovery.ts
Applies to: local pipeline-definition.v2 execution and recovery, not Worker native supervision or project deployment
Last verified: 2026-10-21. Actual checkpoint child interruption/recover CLI and three external-effect interruption controls passed

## Choose the recovery boundary

An interrupted process is not a cancelled run. This rehearsal kills one owned
local child only after its artifact checkpoint is durable. It then uses the real
Core recovery CLI with the original platform, graph and run ID. Its test stage
is intentionally a checkpoint producer/reader, not a fake implementation agent
or remote quality provider. Core, the filesystem artifact store, effect receipts,
checkpoint propagation and recovered stage attempts are real.

The successful case has no external mutation that requires a separate
continuation. Run the negative exercise too: a completed HTTP request is not
permission to repeat an interrupted external operation. A safe recovery stop is
a result to retain, not a test failure to bypass.

## Prepare the owned local exercise

Use a selected isolated checkout with the
[locked development dependencies and Node.js 24 toolchain](../../extend/developer-handbook.md#prepare-a-clean-checkout).
Also require Git, GNU `flock`, writable private temporary storage and permission to spawn and signal your own children. Run the following commands from the repository root.
They create and remove only their own temporary fixtures. Do not point them at
a production storage root, an operator platform or a deployed service.

```bash
node tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs
node --test tests/verification/reliability/external-effect-recovery.test.mts
```

Require the first command to exit zero and print
`{"ok":true,"contract":"plugin-system-v2-checkpoint-recovery"}`. Require all
three tests in the second command to pass with no skipped case. Retain stdout,
stderr, exit statuses and the selected Source revision outside the disposable
fixtures. An early error, missing dependency, unexpected signal or failed
assertion is not an observed recovery.

## Follow the checkpoint interruption

The first command owns this exact sequence:

1. Write one platform and graph. The graph has one `test.checkpoint` stage,
   three allowed attempts, no remediation and a 60-second stage timeout. Its
   grants select the actual artifact store for `artifacts.write` and
   `artifacts.read` in namespace `test.checkpoint`.
2. Start a child with the real Core execution engine and fixed run ID
   `run:checkpoint-recovery`. The first stage attempt writes artifact
   `checkpoint:batch-1` with `checkpoint: true`, waits for its real response,
   then writes the owned readiness marker and stays in flight.
3. Wait at most 20 seconds for that marker, observing premature child exit.
   Only this marker authorizes the fixture to send `SIGKILL` to its own child.
   Wait for confirmed child exit. A submitted signal alone proves nothing.
4. Read the original lifecycle bytes after exit. Exactly one `artifact.created`
   must describe the checkpoint. No terminal run event may exist yet. This is
   an interrupted first attempt, not a completed stage or terminal run.
5. Spawn the actual Core CLI with the same platform file, graph file and
   `--recover run:checkpoint-recovery`. The engine checks its retained snapshot,
   registry/configuration identities and effect-recovery conditions. No edited
   snapshot, new run ID, changed graph or replacement artifact supplies success.
6. In attempt 2, the test stage receives the original checkpoint through
   `context.artifact`, then reads the exact namespace/ID/digest with the real
   artifact adapter. It checks the stored value before returning `passed`.
7. Require CLI exit zero, returned status `succeeded` and stage attempt number
   2. Read original lifecycle bytes again: `attempt.created` numbers are exactly
   `[1,2]`. `run.resumed` and `run.succeeded` exist. `artifact.created` still
   occurs once. Returning the earlier checkpoint does not create a second
   artifact-created event.

The script also executes a separate producer→consumer graph to check that a
declared dependent stage receives the producer's checkpoint. That is a second
run, not another attempt in the interrupted run. Its success must not hide a
failure in the first scenario.

The fixture reads its original lifecycle bytes directly and asserts the
checkpoint/attempt transition. It does not produce a retained operator incident
archive or claim that killing an arbitrary process yields a complete journal.
Its finalizer removes its private temporary tree. For a real incident, use the
next section's preservation procedure instead of treating test output as your
run's audit.

## Contrast three real external-mutation stops

The second command runs a local HTTP service that appends and fsyncs one real
mutation record. A trusted test stage invokes it through the shipped generic
runtime-dispatch, network-http and secret-resolver adapters with scoped grants.
The service is a controlled local mutation authority, not an agent completion
simulator. Its ephemeral test secret stays in the fixture environment.

- **Before receipt:** the server has durably mutated but withholds its response.
  The fixture kills the Core child. Recovery must reject with
  `RECOVERY_EFFECT_OUTCOME_UNRESOLVED`. The server mutation count stays one.
- **After receipt:** the server returns success and the stage marks receipt
  before the fixture kills the still-running child. Recovery must reject with
  `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED`. A successful receipt cannot supply
  the interrupted plugin's missing continuation.
- **Lost response:** the server mutates then closes the connection. Core returns
  `blocked` after one stage attempt, despite a three-attempt ceiling. Recovery
  rejects the terminal run with `RECOVERY_RUN_TERMINAL`. The mutation count
  still stays one.

Each case requires exactly one original mutation line. No test clears a durable
request or manufactures a terminal receipt so the operation can run again.
These are explicit recovery stops, not evidence of a general reconciliation
CLI. Core permits local artifact checkpoint recovery and repeated reads. Its
safe-operation list does not include arbitrary external mutations.

## Apply the procedure to an owned real run

Use [Inspect a Run](../operate.md#inspect-a-run) before audit or recovery.
Confirm that the run owner exited. Stop original run and owning-adapter writers.
Retain complete raw copies and manifests. Strictly parse each copied journal.

Opening audit/recovery can create locks or truncate an incomplete tail. Never
use it to make an uninspected original pass. Unknown writer ownership, a
partial/corrupt chain or an unexplained external outcome stops the task.

Keep the original platform, pipeline/project, package/configuration snapshot,
storage root and run ID. Use the exact explicit-graph/project command in
[Recover After Interruption](../operate.md#recover-after-interruption), not a
new start command. Observe the actual returned status and exit code.

A wait needs its matching signal. A cooldown needs its recorded time.
A missing receipt/continuation needs the owning authority. A larger attempt budget
cannot waive these checks.

After the recovery process exits, repeat stopped-writer raw preservation and
strict inspection before the final audit. Compare original identities, journal
heads, attempts, checkpoint artifact producer/digest and external receipts.
Claim successful recovery only when the returned terminal state and final audit
agree without unexplained duplicated effects. Otherwise retain the exact stop
and owning follow-up. Do not recover a terminal run or edit its journal.

Cleanup belongs to the original run and adapter owners. The local test's
finalizer has no authority over a deployed run, external resource, credential or
artifact retention policy. Preserve the initial failure and all recovery
attempts. Evidence removal is not a recovery action.

## Source authority

- [Checkpoint graph/platform and owned child controls](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs#L35-L90).
- [Actual SIGKILL, original identity recovery CLI and no duplicate artifact event](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/contracts/check-plugin-system-v2-checkpoint-recovery.mjs#L91-L136).
- [Fixture first-attempt checkpoint and recovered read](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/fixtures/plugin-system-v2/resume-plugin/checkpoint.js#L1-L46).
- [Core rejects unresolved outcomes and missing external continuations](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/skills/nova/core/execution/effect-recovery.ts#L1-L29).
- [Real external mutation setup and durable write](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/reliability/external-effect-recovery.test.mts#L13-L54).
- [Observed interruption/recovery stops and exact one-mutation assertions](https://github.com/datrab/kubeclaw/blob/ce7740252864a9b547bee8a35260d6ab10c9f05e/tests/verification/reliability/external-effect-recovery.test.mts#L95-L102).

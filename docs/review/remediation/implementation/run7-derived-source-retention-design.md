# Derived-source retention: original authority boundary, not implementation

Status: documentation-only design checkpoint. No product source changed, no
derived-source retention enabled, no native/provider pass and no Finding closure.
Read-only source trace at remote repair head
`4f70d8f13e282e01d014fe82557d37c90d52cb71`. The frozen register at
`c38779c71bb92bc15c3fcb89930348e5417aa475` again yielded exactly 47 implemented
IDs, identical to `partial-47-scope.json`. PCR-OBS-002 remains incomplete under its
original requirements: explicit run retention, consumer checkpoints, complete
referenced evidence, preserved idempotency and actual mixed-run quota/replay tests.

The preceding bounded dispatch implementation is separately preserved at
`ccdea8e3e57904202d73b92dade8a2f90a655df5`, with independent bounded approval at
`5db3cedc8520d9d9c1be3aee27dcaae2c22a4a04`. That package deliberately refuses
derived `sourceStageId` and missing explicit revision. Do not infer its integration
from this design or remove that refusal without the original evidence below.

## Original producer and consumer trace

`skills/common/plugin-runtime/sdk/src/source-revision.ts` selects the highest
attempt-number implementation artifact visible to the invoking quality stage:
same run, selected source stage, namespace `kubeclaw.implementation-agent`, ID
prefix `implementation:`. Exactly one artifact must exist at that selected
attempt. Its original `artifacts.read` / `get_json_bytes` response is verified by
`verifiedArtifactJsonText`; the value must be `ready_for_testing` with an exact
40- or 64-character Git source revision. It does not read ambient repository HEAD.

`skills/nova/core/execution/stage-executor.ts` gives an attempt only its own stage
and transitive-dependency artifacts from the original checkpoint recorder.
`artifact-checkpoints.ts` derives `artifact.created` records from completed stage
results (or explicit original write checkpoints), preserves exact producer
attempts and rejects conflicting references. The relevant selection is the
artifact prefix **before the quality attempt is created**, not whichever artifact
has the highest attempt number at the end of the whole run.

`skills/nova/plugins/implementation-agent/src/stage.ts` can emit a non-null
implementation `sourceRevision` only after its original workspace lifecycle:
`git.workspace.create`, successful `runtime.dispatch` completion, `git.commit`,
`git.merge`, then the implementation artifact write. Without workspace integration
the stored source revision is null; a hand-written ready-for-testing object is not
an equivalent producer. The completed source attempt returns the artifact, and
its facts carry the integrated revision where one exists.

`skills/common/plugins/git-workspace/src/operations.ts` performs a real
`git merge --no-edit --no-ff`. Therefore the merge input must match the original
commit output, but the **merge output can be a different revision**. The source
artifact and downstream quality request must bind that merge output, not assume
commit and merge revisions are equal. Original workspace references bind
repository, workspace path, branch, initial revision and owning attempt.

`skills/nova/plugins/buster-quality-gate/src/stage.ts` first resolves that exact
source artifact through `artifacts.read`, then submits `test.plan.execute` with
the resolved revision and full original provider plan. It stores the original
decision artifact even for execution_error. This gives a concrete consumer chain;
a matching runId or operator-supplied revision alone does not.

## Proposed eligibility proof

1. Retain the existing original run → import → distinct dispatch fence order,
   bounded no-follow inventory, full import/result/evidence validation and final
   synchronous dispatch CAS authorization. Old/unprovable histories fail closed.
2. Identify the selected quality attempt and its original configured stage owner.
   Its sourceStageId must be in the actual transitive dependency graph. Reconstruct
   the visible artifact-created prefix before that attempt; enforce the original
   highest-attempt/exactly-one selection, without accepting later repair artifacts.
3. Bind the selected ref to the original implementation producer's created and
   passed completed attempt, configured package/registration, artifact-created
   causation, canonical artifact-write request and matching completion receipt.
   Verify exact namespace, artifact ID, encoding, producer identity, digest, size,
   original ArtifactStore metadata and bounded retained blob bytes.
4. Bind the original workspace create, runtime completion, commit and merge
   request/receipt chain to that same source attempt and correct causal order.
   Commit input references the original workspace/base; merge input references
   its actual committed revision. The merge target/repository must be the quality
   repository. Match merge completion output to the implementation artifact's
   sourceRevision and the original test request and retained dispatch source.
5. Require the quality attempt's actual canonical artifact-read effect and receipt
   for the exact selected ref, with returned value/bytes matching the original
   artifact. Its accepted/completed audit must precede test.plan.execute within
   that quality attempt. Preserve the existing full job/plan/import/decision
   artifact and terminal consumer checkpoint checks.

Implementation should reuse the original SDK's selection/value semantics, not
create a second resolver or fabricated PluginInvocationContext. If necessary,
factor the existing SDK into small owning pure selection/value-validation helpers
used by both the original resolver and the retention proof. That prospective
change is not made here and needs independent review with original consumer tests.

This is persisted causal ownership and replay validation, not a promise to detect
coordinated rewriting of all trusted Core/import/dispatch records. No new
cryptographic source-attestation verification with an independently pinned public
key is implied. Operator policy cannot invent absent producer/consumer evidence.

## Genuine fixture prerequisite

The positive must run the **original implementation agent session** through an
existing authorized runtime gateway against a disposable original Git workspace.
It must actually change a file, produce its real runtime completion, and let the
original workspace adapter commit and merge it. A dependent quality stage using
sourceStageId then executes the original signed remote adapter/Buster/import/
decision-artifact chain. A genuine complete errored Buster result is acceptable
as failed-history storage input; original authenticated cancellation may supply
the disposable Core terminal checkpoint. It is never a native provider pass.

The existing `tests/verification/reliability/fixtures/forge-runtime.mts` is not that
positive: its HTTP transport handles sessions_spawn/status by writing a declared
completion itself. It is useful existing transport/Git contract coverage, but
substituting it here would fabricate the missing agent-producer acceptance.
The inspected original implementation has no model-free completion path. A
read-only local check found no `openclaw` executable; this alone does not prove
absence of a remote HTTP gateway. No authorized real gateway/session profile was
established by this audit. Do not start paid model/gateway resources, contact
production, or introduce a deterministic replacement agent to make this pass.

## Required negative and recovery matrix

- Foreign run/source stage/attempt, nonancestor stage, wrong producer package or
  registration, namespace or artifact ID; internally coherent hashes are not
  sufficient ownership.
- Missing/ambiguous highest-attempt artifact; an older candidate substituted for
  the actually visible latest candidate; a later repair artifact incorrectly
  substituted for an earlier quality invocation.
- Missing, corrupt, oversized, symlink or FIFO artifact metadata/blob; wrong
  read reference, response bytes, canonical encoding or completion receipt.
- Incomplete/cancelled source attempt, missing runtime completion, missing
  workspace integration, null/not-ready source value, or missing source artifact
  on the original completed producer result.
- Commit input/parent/workspace mismatch; merge input not the committed revision;
  merge output not the artifact/downstream revision; wrong merge target. Include
  a real non-fast-forward merge where commit and merge revisions differ.
- Validly rehashed canonical-invalid or wrongly ordered request/accepted/completed
  histories, wrong stage/attempt in original audits, and artifact read occurring
  after remote dispatch rather than before it.
- Actual competing writer, stale snapshot/CAS, crash before and after publication,
  exact old-job replay without another dispatch, active/waiting/uncertain runs
  retained, genuine small byte/count quotas unchanged.

## Durable next action

Leave the already reviewed explicit-revision boundary intact. Obtain and document
the real non-paid authorized runtime/session prerequisite before implementing or
claiming derived-source acceptance. Then open a new isolated repair package,
preserve a genuine failing original test, implement the owning proof, independently
review it and reconcile against the freshly read repair head. Until then work on
another scoped consumer that has real local authority and tests; PCR-OBS-002 and
the aggregate frozen-47 completion remain open.

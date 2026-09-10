# PCR-OBS-002: bounded derived-source dispatch projection

This incomplete package extends only the already integrated Nova dispatch archive
projection. It does not close PCR-OBS-002 or delete original source, results,
evidence, records, receipts, logs or blobs.

## Root cause and retained authority

The current Project compiler emits quality gates whose `providerPlan.sourceStageId`
selects a committed implementation result. The manual dispatch projection still
accepted only a literal `providerPlan.revision`, so ordinary compiled runs could
never release the redundant base64 archive copy even after the original Core,
import and decision authorities were complete.

The authority now supports exactly one of `revision` or `sourceStageId`. For a
derived source it additionally proves all of the following from the original
bounded stores while the existing run/import/dispatch fences are held:

- the source stage is the pinned registered implementation-agent stage;
- its latest completed attempt passed before the quality attempt started;
- the exact implementation ArtifactRef is present in the Core result, original
  ArtifactStore record and digest-verified blob;
- the original quality attempt actually read that exact artifact before dispatch;
- pinned real `git.commit`, `git.merge` and `artifacts.write` effects completed in
  causal order, and the merge result, implementation value, quality payload and
  attested dispatched revision are identical.

The existing explicit-revision path is unchanged. Any missing/corrupt artifact,
altered merge result, stale/foreign identity, active run, incomplete import or CAS
change refuses projection before mutation. The original archive blob remains the
authoritative reload source, and exact replay does not submit another job.

## Actual proof and limits

The full original projection suite now passes 11/11 with zero skips, including a
new registered two-stage implementation-to-quality run using the actual
PipelineRunner, Git workspace adapter, ArtifactStore and dispatch/import stores.
It also retains the competing-process fence and actual SIGKILL recovery tests.
Nova typecheck and the four original retained-import authority tests pass.

The Buster provider in this fixture honestly returns `execution_error` because
its native sandbox was not built (`TEST_PROVIDER_SANDBOX_NOT_BUILT`). The retained
completed import and failed decision are valid for this metadata projection, but
this package does not claim a successful native test-provider execution. Wider
PCR-OBS-002 work remains: v2/Discord delivery projection, externalized/uncertain
histories, shared blob/history retirement, record-count release and the original
mixed active/completed quota acceptance across every claimed consumer.

Raw evidence:

- `docs/review/evidence/run23-dispatch-derived-source-red.txt`
- `docs/review/evidence/run23-dispatch-derived-source-final.txt`

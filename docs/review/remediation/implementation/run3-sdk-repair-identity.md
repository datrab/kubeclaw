# Repair identity cutover — independently approved bounded package

Run `20260909t2146`, isolated branch `fix/resume-47-run3-sdk`. Original repro
checkpoint remote `a29a9df8cce605f393fa0bec413604a5ae426eeb`; all affected source
and repro blobs matched the local committed cache before use. No uncommitted
work from the prior invocation was copied or modified.

The initial source checkpoint was **not approved for integration**. It
introduces an explicit completion producer encoding, portable tagged pending/
order digests, and semantic/causal legacy projection binding. It does not infer
encoding from snapshot versions and preserves legacy completion-only prefixes.
Administrative repair projections remain separate explicit decisions.

Initial original repair-budget suite: 8/9; the administrative projection path
revealed a real compatibility regression, corrected before this checkpoint.
The two original administrative cases then pass. Full Nova typecheck and the
canonical focused lint pass. Final full tests and independent review are next.

Historical producer archive and helper are independently prepared in `ec8596e`:
original sources are byte-verified against remote blobs and replayable without
old Git objects. Genuine negative and cross-locale current/legacy tests follow.
Broad PCR-SDK-001 remains incomplete; no native infrastructure gate is claimed.

## Completed bounded correction

Final production source `3b7f609` explicitly versions each newly produced Core
completion with `repairIdentityEncoding=kubeclaw-json.utf16.v1`. Live decisions,
recovery, wait-creation recovery and administrative repairs derive the same
tagged hash subject. Unknown completion versions reject; snapshot versions do
not select repair serialization.

Legacy completion projections retain their stored ID only after the original
completion/result, requester, category, source facts, order attempts and pending
history are reconstructed and matched. Duplicate/miscaused/wrong-stage
projections reject. Historical orders never persisted a history field: their
prefix ledger is reconstructed rather than invented. Completion-only legacy
prefixes retain the previous calculation; no nonexistent prior approval is
manufactured and no blanket legacy-prefix rejection is introduced.

Independent review demonstrated two real holes in the first version: an
administrative envelope alone did not bind the actual repair request, and an
order could attach to a non-requester completion. Both were corrected in the
actual replay path. Administrative orders now reconstruct the expected request
from the original completion and prior states; exact generation, budget,
request, result and order semantics must match. Duplicate administrative causes
and projections reject. Their original failing raw evidence is preserved in
`docs/review/evidence/run3-sdk-review`.

## Author verification

- Original full repair-budget, repair-budget-recovery and administrative repair
  tests plus new locale/history/negative matrices: **51/51 pass, zero skips**.
- Actual original tagged producer and archived untagged producer both execute
  real Core/Git/ArtifactStore, produce three genuine deterministic checker
  failures with valid Unicode detail keys, and pause for Nova. Current recovery
  under en-US/sv-SE/tr-TR retains the exact original digest without journal
  mutation. Original `resumePipelineV2` under sv-SE accepts the original approval,
  executes the fourth source attempt and mandatory checks, succeeds, and matches
  fresh disk-journal replay exactly. This is the controlled repair fixture, not
  an LLM/provider/native infrastructure acceptance run.
- Original archived producer still reproduces the old locale failure; all
  archived bytes verify against recorded remote Git blob IDs. Current tests use
  current source/dependencies and the archived probe script. No old local Git
  objects or prior checkout paths are required.
- Full Nova TypeScript check and canonical focused lint: exit 0. No thresholds,
  original assertions or native gates were weakened.
- The default current audit script now asserts the fixed behavior. Its immutable
  archive retains the historically correct failing expectation.

Raw commands/results: `docs/review/evidence/run3-sdk-author/{final,checks,audit}.txt`.
Independent final approval is recorded in `run3-sdk-repair-independent-review.md`
at reviewer commit `abcd748c79fa7763967ce2ef0e90438e50927f8f`: **53/53 independent
tests pass, zero skips**, plus clean full Nova typecheck and canonical focused
lint. Integration still requires fresh-head reconciliation and Root's tests.
Next action for broad PCR-SDK-001: reconcile remaining persisted identity domains
against their original input schemas and original consumers; do not infer a
whole-finding closure from this repair-authorization slice.

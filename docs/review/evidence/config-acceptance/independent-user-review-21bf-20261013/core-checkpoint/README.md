# Fresh independent Core/checkpoint review — 21bf

Reviewer: native child `/root/review_checkpoint_core_21bf`, no implementation responsibility, no nested delegation. Reviewed goal, original A1–A8 and CONFIG gates, D17–D22, actual source and author evidence. Author conclusions were not treated as proof.

Stand: HEAD `21bf51bc2075abec1191fdc091952492b6cb484e`, tree `7a74b82dd26bc9d87dc1ca60e35d2846681d3d78`, plus parent frozen dirty baseline. Exact independently read source/tool/test identities are in `input-identities.json`; no inspected input drift and no parent-baseline drift for overlapping dirty inputs. Python 3.11.2. Own files only in this directory. All full-checker controls ran in `/tmp/core-checkpoint-21bf-review`, a byte copy of the checkout; no shared author/root/source changes.

## Verdict

GROOT-01 remains resolved at its **bounded projection-conservation guard** scope. No newly demonstrated Core conservation regression. Current dirty whole root is **not structurally consistent**; historical committed root is structurally consistent. No global C0/native/module-binding PASS. Nova partial reader ledger faithfully identifies its exact quoted source lines but does not complete C0-D or F-BIND.

## Actionable finding

**UCORE-001 — medium — dirty Runtime additions not integrated into canonical root.**

Paths: `docs/review/remediation/config-semantic-inventory.json:23` (old Runtime fragment digest), same file `:647965` (old native source advertisement), and canonical matrix native package checked by `author/check-matrix.py:182` against current `runtime/case-proposals.json`. At the exact frozen dirty stand the actual full structural checker returns three errors: fragment content drift, native source content drift and original specification/requirement loss. Raw evidence: `frozen-dirty-structural.stdout`. This is a present integration gap, **not** a GROOT regression, new production bug, or claim that checkpoint7's historical report was false. Integrate/reconserve/review the dirty additions before using root consistency as current evidence; preserve historical baseline. Repro command is recorded in `results.json`. Restoring only the four dirty tracked Runtime files from HEAD in the isolated copy yields structural exit 0/zero errors, identifying the boundary precisely.

## Independently repeated controls and expected set

The source fragment enumerates exactly 13 canonical Core row IDs and 27 case IDs, all recorded in `results.json.expectedIds`; full checker processes actual 2409 inventory rows, 6726 canonical cases and 6201 native specifications. Source inspection compares normalization with `consolidate.py`: all normalized row properties are equal, every original case property is retained recursively, current aliases/phase/reviewer state are guarded. Historical forward/reverse identities and inactive status are compared through the real loader/projection, not a replacement resolver.

This review independently repeated six full-checker mutations: source field-coordinate change, existing instanceScope change, priorState replacement, requirement removal, historical reverse-reference omission and native-package removal. Each was rejected with intended conservation/presence errors; original committed positive control passed before and after. Raw stdout/stderr and exact commands are saved per label. This is six repeated challenges, **not** a claim to have freshly rerun all historical forty controls. All previous forty-control artifacts and claim qualifications were inspected; no inherited global acceptance. Strict committed checker still exits 1 with 102679 open obligations. The exact dirty checker is separately failed, not relabelled positive.

## Actual Nova productive trace, distinct from future proposal

- `project/compiler.ts:48` produces implementation/lint/optional review/test membership and `:61` derives current execution/repair policy. `source.ts`, `coverage.ts`, `demo.ts` produce distinct admission/final/demo stages. Current graph has no accepted module-binding carrier; names are insufficient for arbitrary graph membership.
- `core/execution/engine-runtime.ts:30` validates/discovers/resolves grants, validates stage config at `:40`, and activates packages at `:42`. `engine-run.ts:57` recovery prepares current runtime before pinned package/graph verification. Existing current behavior is not the proposal's original-A-before-current-B algorithm; target proposal explicitly leaves migration open.
- `pipeline-loop.ts:120` reads attempt ceiling and `:126` reads agentRole for operational events. Business-unused agentRole is not reader-free. Skip observer emission at `:109` also needs the proposed pre-action carrier boundary.
- `stage-executor.ts:35` independently refetches graph definition, `:44` invokes original activated registration with input and timeout, `:62` derives lease limits, `:71` passes config/input, `:75` retains counters with policy maxima. Merely replacing context.config would leave admission/timer/reduction mismatched.
- `reducer.ts:70,81,88,129` reads attempt/orchestration/repair/technical retry policy. `run-decisions.ts:31` passes graph-wide stages into `repair-budget.ts:49`; target-stage repair category ceilings and maximumOrchestratorOrders are additional real consumers beyond the ten ledger seams. `recovery-state.ts:53,61` repeats reduction and repair budgeting from original graph. Its minus-one reconstruction avoids double counting; it is not evidence of rebasing.
- `engine-snapshots.ts:100,107` reads versioned snapshots and creates current v4 full graph/runtime profile snapshots. Registry snapshot foundation/grants/provider selections are separate from M profile selection.
- `state/journal.ts:136,144` creates/appends and file-fsyncs but does not fsync the publication directory; carrier proposal explicitly requires this target durability prerequisite. No current journal event schema gains module binding merely through the proposal.

All ten author ledger records had exact hash and line matches (`results.json.novaLineChecks`). Its five-source/ten-seam set is narrower than the transitive productive set above; `current-reader-ledger.json:339` and `:341` explicitly acknowledge source-only proof and incomplete transitive readers. This review does not turn an honest partial ledger into a finding for claiming completion it never claimed.

## Historical freeze versus current identity

Checkpoint7 records 1399 staged documentation inputs, parent HEAD/tree and two patch parts. Independently hashed parts, concatenated gzip hash and streaming decompressed raw patch hash/byte length match; parent is actual HEAD parent (`freeze-verification.json`). The receipt deliberately excludes itself/derived parts, explicitly not a final whole-C0 freeze. Current receipt input drift is exactly the four dirty Runtime files; these are captured by the new parent baseline, not unnoticed historical mutation. No Nova/checker/root inspected input changed during this review.

## Known open gates, not newly actionable defects

C0-A/B/C remain globally open: complete leaf/pattern owner partitions, production registrations/transitive readers, full canonical fields/cases and reviews are not supplied by bounded checker integrity. C0-D remains open: typed membership/carrier/stage-view/schema evolution, original locator authority, quota/store/manifest/grant accounting, fixed Eval, A-started/B-next, retry/repair/cleanup and executable crash/concurrency oracles. Those are explicitly admitted in `NOVA-BOUND-STAGE-VIEW-PROPOSAL-6606.md:68` and carrier remaining-work section, not waived here. C0-E cannot close with this scoped review. C1–C6 remain unapproved.

## Actual commands and limits

Executable raw commands: `run-review.py` (copy-frozen dirty full checker, committed control, strict gate, six mutant controls, restored control, SHA/source-line/receipt-input verification) and `check-freeze.py` (streaming patch verification). Exact per-run argv/cwd/exits are in `results.json`; raw checker output remains alongside it. Read-only source commands were `rg`, `sed`, `nl`, `git rev-parse`, `git status`, and `cat` over paths cited above and original criteria/decision documents. No productive Nova invocation, journal behavioral control, SDK/plugin/provider/host/API model execution, suite rerun, package/image/native PASS, code changes, commit, deployment or author-tool generation. Historical forty controls and journal controls were reviewed, not represented as newly executed behavior.

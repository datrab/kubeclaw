# Extend Pipeline Review and Case Study Reports

Status: source-backed optional report packages; generated narratives remain drafts
Audience: plugin developer, report maintainer, pipeline operator
Owner: Nova report maintainers
Evidence: skills/nova/plugins/pipeline-review; skills/nova/plugins/case-study; skills/nova/core/state/read-run-evidence.ts
Applies to: kubeclaw.pipeline-review and kubeclaw.case-study; pipeline-plugin-v2; report-source-bundle.v1 and v4 dispatch protocols
Last verified: 2026-10-21; current source inspection; local checks identified separately

## Two packages, one evidence authority

`kubeclaw.pipeline-review` generates an advisory assessment of a completed run.
`kubeclaw.case-study` generates a cited Markdown draft about that run. Neither
changes the source run's verdict, repairs its code, establishes product
acceptance or authorizes publication. `passed` means that the package generated
and stored its own valid output, not that every narrative sentence is true.

Both use the original `kubeclaw.pipeline-review:evidence` adapter. That adapter
reads original completed Core state and selected original artifacts. The agent
receives a bounded structured projection, never authority to supply historical
success facts. This keeps source evidence independent of generated prose. Its
cost is explicit selection, integrity checks and omissions: it cannot answer
questions that require an omitted raw log or unsupported artifact class.
Reconsider that boundary only with a source-qualified new content class and
bounded reader tests, not by copying arbitrary agent text into trusted facts.

| Package surface | Global registration | Consumer selection |
| --- | --- | --- |
| Pipeline review stage `review` | `kubeclaw.pipeline-review:review` | Stage type `kubeclaw.report.pipeline-review` |
| Evidence adapter `evidence` | `kubeclaw.pipeline-review:evidence` | Provider for `report.evidence.read` |
| Case study stage `case-study` | `kubeclaw.case-study:case-study` | Stage type `kubeclaw.report.case-study` |

Each package is version 1.0.0 in the Nova role. The case-study package does not
register its own evidence adapter. Use the
[package catalogues](../plugin-catalogue/README.md) for generated registration
facts, and [Core state/recovery](../../understand/nova-core.md) for the original
run authority.

## Configuration, grants and source input

Pipeline-review stage configuration is closed: required nonempty `agent`, plus
optional nonempty `agentRole`. The current stage reads `agent` and its protocol
builder does not forward `agentRole`; do not treat that accepted field as a
working role override. Case-study configuration is closed and contains only
required nonempty `agent`. Neither supplies a model, runtime endpoint or token.
The selected runtime adapter owns target configuration and credentials.

Grant each stage `runtime.dispatch` only for its intended agent, artifact writes
only for its own namespace, and `report.evidence.read` only for the intended
historical run IDs through `allowedRunIds`. Configure the evidence adapter's
`artifacts.read` dependency with the original artifact store and only the
selected implementation/lint/quality namespaces. A report package cannot grant
itself access to another run by naming its ID.

The evidence adapter configuration is closed and has no defaults:

| Field | Consumer meaning |
| --- | --- |
| `storageRoot` | Original Nova storage root; use an absolute path. No copy/new empty store is a substitute for the selected history. |
| `orchestratorIssuerId` | Original issuer used by the lifecycle replay reducer. |
| `maximumJournalBytes` | Positive integer bounding the selected snapshot/event/effect history reader budget. |
| `maximumArtifactBytes` | Positive integer bounding the aggregate selected JSON artifact bytes. |
| `maximumBundleBytes` | Positive integer bounding serialized source-bundle UTF-8 bytes. |

Both stages use the same closed input `{task, source}`:

| Input path | Rule and authority |
| --- | --- |
| `task` | Required string, 1–32,768 schema characters. Describes the requested report, not supplied historical facts. |
| `source.runId` | Required nonempty original run ID, also used as the capability resource canonical ID. |
| `source.journalHead` | Exact `sha256:` plus 64 lowercase hex digits of the selected completed event journal. |
| `source.snapshotDigest` | Exact corresponding immutable snapshot digest. |
| `source.sourceStageId` | Required nonempty implementation producer stage ID. |
| `source.sourceRevision` | Exact 40- or 64-character lowercase hexadecimal implementation revision, without a `git:` prefix. |
| `source.artifacts` | 1–128 unique full `ArtifactRef` objects from completed latest producer attempts. Every reference includes its original namespace, artifact ID, digest, size and producing attempt. |

The schema and runtime readers perform different checks; strings are not
permissions. Obtain these identities from preserved completed run state and
owning artifact records, not from a generated report. The
[SDK artifact rules](../../reference/sdk.md#artifact-byte-verification) explain
why an arbitrary same-digest reference is insufficient.

v4 intentionally removes caller `facts`, `evidence`, project labels and target
attempt numbers as authority. Migrate old authored inputs explicitly. There is
no v3 fallback and no automatic rewrite of retained report inputs.

## Evidence admission and explicit omissions

The reader strictly checks hash-linked original event/effect journals, pinned
snapshot/graph, lifecycle replay, completed attempts and effect/lifecycle audit
agreement. The original snapshot must record
`effectAuditVersion: coordinator-mode.v1`. Older mode-ambiguous history is
unverifiable by this reader; changing a stored marker is not migration.

The adapter accepts only terminal succeeded, failed or cancelled source runs. A
waiting, reopened, blocked, incomplete, stale-head or unresolved-effect source
is not completed report authority. Failed/cancelled completed history can be
reported honestly; reporting it never converts its outcome to success.

Selected artifacts must occur in that exact run projection and latest attempt.
The adapter reads original JSON bytes with the complete expected reference,
checks digest/size/media type and budget, and only admits these fact classes:

- Exactly one implementation artifact in namespace
  `kubeclaw.implementation-agent` from the selected source stage of type
  `kubeclaw.agent.implementation`, with `ready_for_testing` and the selected
  source revision.
- Lint artifacts in namespace `kubeclaw.lint` from `kubeclaw.lint.*` stage types,
  with matching source revision and valid nonnegative summary counts.
- Native quality decisions in namespace `kubeclaw.buster-quality-gate` from
  `kubeclaw.test.quality-evaluation`, whose artifact ID contains `:decision:`.
  Original gate-decision parsing must bind run, source revision and gate stage.

Other artifacts are unsupported, not silently trusted. For example, the local
one-stage Delivery Lint workflow does not provide the required implementation
artifact and cannot be relabelled into this report source contract.

The adapter rereads the original run projection after reading artifacts and
rejects any change. `report-source-bundle.v1` binds target identities, pipeline,
terminal state, event/effect heads, stages, attempts, selected evidence IDs and
facts to its canonical digest. Each evidence ID is derived from the complete
artifact reference. Omitted completed artifacts are listed as not selected.
Raw logs, checkpoint-only artifacts, prompts, registry configuration, effect
payloads, credentials and unstructured agent claims are explicitly not exported.
Their original records remain owned by their producers; this projection neither
redacts/deletes the originals nor claims to verify omitted payload blobs.

Implementation authority: [evidence adapter](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/pipeline-review/src/evidence-adapter.ts),
[source-fact/bundle admission](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/pipeline-review/src/evidence-bundle.ts),
and [strict completed-run reader](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/core/state/read-run-evidence.ts).

## Package-specific output contracts

### Pipeline review

The agent request protocol is `kubeclaw.pipeline-review.v4`. It contains the
active report execution identity, selected historical target, verified source
bundle and five required dimensions: architecture, agents, prompts, tests and
configuration. The agent owns only `{status, summary, observations}`.

The closed response requires `status: reviewed`, a nonblank summary of at most
8,192 UTF-16 code units, and 5–128 observations covering every dimension.
Each observation is closed: one valid dimension, priority low/medium/high,
nonblank finding of at most 8,192 UTF-16 code units, and 1–128 unique known
evidence IDs. No uncited observation or extra agent-owned control field passes.

The stage adds current `execution`, current report run/attempt, historical
`reportTarget`, `evidenceStatus: verified-source-bundle`,
`narrativeStatus: draft-not-entailment-verified`, and the verified source bundle.
It stores JSON in namespace `kubeclaw.pipeline-review` under
`pipeline-review:<digest-of-active-execution>`. It verifies the original store
response against exact canonical bytes, byte length and active producing attempt
before returning passed with the artifact reference.

### Case study

The agent protocol is `kubeclaw.case-study.v4`. The agent owns only
`{status, markdown, evidenceIds}`, with `status: generated`.
Markdown is 1–131,072 UTF-16 code units without NUL or carriage return.
The parser requires each exact marker `## Context`, `## Challenge`,
`## Approach`, `## Implementation`, `## Verification`, `## Outcome` once and
in that order. These are substring/order checks, not a full Markdown AST or
proof of section quality. Every returned evidence ID must be unique, known,
and appear as `[evidence:ID]` in the Markdown.

The stage attaches active execution, historical target, source bundle and the
same evidence/narrative status distinction. `projectId` derives from the
verified source pipeline ID, not caller-generated labels. It stores JSON in
namespace `kubeclaw.case-study` under
`case-study:<digest-of-active-execution>` and verifies full producing attempt,
namespace, ID, media type, digest and byte length before returning passed.
A citation binds a selected reference; it does not prove factual entailment.
Review the draft independently before sharing or publishing it.

Exact protocols and parsers:
[pipeline review](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/pipeline-review/src/protocol.ts)
and [case study](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/skills/nova/plugins/case-study/src/protocol.ts).

## State, cancellation, retry and failure

The evidence adapter creates no separate report history store. It reads the
original Nova/artifact authority. Core owns durable report attempts, dispatch
effects and receipts; the original artifact store owns completed report JSON.
The report's active execution identity remains separate from its historical
target. Do not remove either history when changing or uninstalling a package.

At entry, the adapter asserts the current resource fence only for a
non-confidential invocation. The confidential branch does not assert a fence;
it is not evidence of fencing enforcement. Both branches reject stopped or
cancelled work, propagate the invocation signal to artifact reads, and check
stopped/cancelled state again before returning. `shutdown` marks the reader
stopped. Synchronous history parsing is bounded by byte limits, not a claimed
preemptible native process.
The generic Core/adapter effect protocol owns dispatch idempotency and lost
responses. These packages have no universal report-specific receipt import,
automatic compensation or rollback of external agent execution.

| Outcome/family | Trigger, effect and safe action |
| --- | --- |
| `pipeline_review.invalid_report`, `case_study.invalid_output` | Evidence selection/bundle/dispatch/agent parsing failed inside the stage's guarded construction block; stage returns blocked without a report artifact. Preserve actual source/dispatch identity and first error. Do not loosen parsers to accept an uncertain report. |
| `REPORT_SOURCE_SELECTION_INVALID`, `...RUN_MISMATCH`, `...CHANGED`, `RUN_EVIDENCE_*` | Wrong or changed original completed run authority. Keep source writers stopped; select exact compatible original records or stop. Do not edit a head/snapshot/effect marker. |
| `REPORT_ARTIFACT_NOT_IN_RUN`, `...STALE_ATTEMPT`, `...INTEGRITY_INVALID`, `...SOURCE_REVISION_MISMATCH`, `...GATE_SOURCE_MISMATCH` | Foreign, stale, corrupt or revision-unbound artifact. Reject it; obtain the original selected producer artifact, not a same-digest substitute. |
| `REPORT_SOURCE_KIND_UNSUPPORTED`, `...SOURCE_ARTIFACT_REQUIRED` | Unsupported fact class or not exactly one qualified implementation fact. Change the intended selection/reader contract explicitly; do not relabel an unrelated artifact. |
| `REPORT_ARTIFACT_BUDGET_EXCEEDED`, `...BUNDLE_BUDGET_EXCEEDED`, `...READER_CONFIG_INVALID` | Invalid installed bounds or too much evidence. Stop and review the genuinely needed selection/capacity; do not drop mandatory evidence silently. |
| `REPORT_BUNDLE_*`, `REPORT_CITATIONS_INVALID`, `REPORT_MARKDOWN_CITATION_MISSING`, invalid review/case-study shape | Bundle digest/target/evidence list, required dimensions/sections or citations disagree. Treat generated output as invalid; do not copy agent-supplied identity into trusted fields. |
| `REPORT_ARTIFACT_INVALID`, `...BINDING_MISMATCH`, artifact-write failure | Failure after construction, outside the stage's blocked-output catch. Runtime records the propagated failure; do not claim a committed report or assume the write had no effect. |
| Missing/invalid `agent` or generic TLS/filesystem/runtime error | Prerequisite or propagated execution failure, not an advisory finding. Inspect exact selected target/config/credential before another authorized attempt. |

Keep the original source selection, active report attempt/effect, complete
artifact reference and first failure before deciding retry. A changed source
head, selected artifacts, policy or package belongs to new governed input, not
an edited retained attempt. An agent response alone does not authorize retry or
publication.

## Create a change, verify it and remove safely

1. Prepare the [isolated developer checkout](../developer-handbook.md#prepare-a-clean-checkout)
   and its absolute GNU flock/durable-store prerequisites. This is a source and
   local protocol route, not a production model credential request.
2. Identify the owner: shared evidence selection/projection in pipeline-review;
   its five-dimension output protocol in that package; six-section Markdown
   protocol in case-study. Change a closed schema, prompt contract, parser and
   source selection/binding together. A new fact class requires a proven
   producer namespace/type/revision/bytes reader and explicit omission behavior.
3. Run the selected package checks from repository root:

   ```bash
   npm test --prefix skills/nova/plugins/pipeline-review
   npm test --prefix skills/nova/plugins/case-study
   node --test tests/verification/reliability/report-evidence.test.mts
   ```

   Recorded local check on 2026-10-21: both package commands completed their
   protocol, live-function and package-boundary groups with exit zero; both
   live-function groups explicitly reported `modelExecution: false`. The
   original report-evidence reliability command passed 10 tests with no failures
   or skips. These are repository fixtures, not real model factuality evidence.

   All required commands must finish with actual exit zero, no failed/required
   skipped assertions. Package checks cover protocol parsing, local capability
   flow and package boundaries. Each package's live-function identity fixture
   exercises original Core, Git, authenticated local HTTP, durable stores,
   administrative retry/replay and rejected output-store bindings. The separate
   reliability command checks source-journal/effect integrity, rejected source
   references, missing/changed blobs and mutation during source reads. The local
   HTTP responder is a protocol fixture, not proof that a model's prose is true.
   Missing host prerequisites stop the affected command; do not substitute that
   result with an in-memory success or fabricated historical run.
4. Verify both successful report artifacts and negative stale/foreign/changed
   source, uncited or incomplete output, changed store response, and uncertain
   dispatch behavior at the changed boundary. Keep source-run
   outcome and report-attempt outcome separate.
5. Update this guide, recursive owning input/config references, source-bound
   complexity assignment and relevant contract checks. Use the common
   [documentation maintenance procedure](../documentation-maintenance.md).
6. Validate the Nova package selection, stage configs, evidence adapter,
   allowedRunIds/namespace/agent grants and original stores before
   [activation](../../use/plugins.md#3-activate-and-prove-health).
   Tests and registry discovery do not prove installed authority. Do not expose
   the reader through an unrestricted historical-run grant.
7. Drain report stages and evidence reads before replacement/removal. Retain old
   package/runtime/configuration for compatible pending attempts. Do not rename
   stored artifact namespaces, recanonicalize legacy bundle/report bytes or
   rewrite v3 input as v4 during recovery. Roll back only through the original
   compatible package/run boundary; schema migration is separate.
8. Remove the registration through the
   [canonical lifecycle](../../use/plugins.md#4-drain-and-disable).
   Original run journals, selected artifacts, runtime dispatch records and
   generated report JSON remain. Apply each owning store's retention policy;
   no package removal command erases that evidence or revokes a published draft.

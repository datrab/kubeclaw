# Echo review Phase 2 design

Status: complete
Owner: `skills/nova/plugins/review`
Phase: canonical contracts and policy foundation

## Objective

Replace the agent-authored PASS/FAIL review protocol with a stable review-domain
boundary. Echo reports structured assessments and proposed findings. The review
plugin validates those claims, applies a frozen declarative policy, and returns an
existing canonical `StageResult`. The core remains the only lifecycle authority.

The same declarative policy schema is intended for a settings file today and a
ClawDeck configuration and evaluation UI later. No UI-specific configuration
format is permitted.

## Decision status

- Point 1, authority and lifecycle: complete.
- Point 2, current contract consolidation: complete.
- Point 3, `echo-review-output.v1`: complete.
- Point 4, `review-policy.v1`: complete.
- Point 5, fixed invariants and hard ceilings: complete.
- Point 6, policy resolution and freezing: complete.
- Point 7, pure review decision reducer: complete.
- Point 8, exhaustive decision matrix: complete.
- Point 9, contract and adversarial test hardening: complete.
- Point 10, built-in declarative profiles: complete.
- Point 11, stable evaluation metadata: complete.
- Point 12, canonical cutover: complete.

## Point 12 — canonical cutover

### D-ER-029: The live stage uses the review-domain contract

The review stage now sends `echo-review-output.v1` to Echo and accepts only that
strict structured response. Echo supplies requirement assessments, inspected
evidence references, and proposed findings. The removed legacy parser and
contracts can no longer accept an agent-authored PASS/FAIL verdict.

The plugin alone resolves the configured profile or complete settings policy,
verifies the stage input and Echo claims, reduces certified review state, and
returns the platform `StageResult`. Core remains the only lifecycle authority.

### D-ER-030: Stage evidence is immutable and content addressed

Each requirement and evidence item has a stable identifier. Every evidence item
also carries a SHA-256 digest over canonical JSON content. The stage parser
recomputes every digest, rejects duplicates and undeclared fields, and deeply
freezes the accepted input before dispatch.

Echo must assess the exact frozen requirement set and may inspect only evidence
that the stage supplied. Missing assessments, unknown evidence, invalid output,
and over-limit output fail closed.

### D-ER-031: Unverified proposals cannot request repair

Phase 2 does not pretend that an Echo proposal is independently verified. Until
the later semantic verifier exists, any proposed finding becomes an integrity
issue and cannot produce `request_fix`. A complete review with every requirement
satisfied and no proposal may pass. An unverified requirement blocks. Output that
exceeds a hard limit requires the orchestrator.

This conservative boundary permits the canonical cutover without giving Echo
hidden lifecycle authority. Deterministic candidate mining and independent
semantic verification remain later implementation work.

### D-ER-032: One policy schema serves runtime and future UI

The TypeScript policy schema remains authoritative. A generator emits both a
standalone `review-policy.v1` JSON Schema for later ClawDeck configuration and an
embedded policy schema in the plugin config because the current registry does
not resolve external schema references. CI checks both generated files for drift.

The live config supports a built-in `gate`, `lean`, or `audit` profile, or a
complete declarative policy value. Per-run overrides are not exposed until the
platform has a trusted authorization and provenance surface.

### D-ER-033: Runtime hashing uses the trusted SDK surface

The review runtime does not import Node crypto directly. Canonical policy,
evidence, and wait-identity hashes use the SDK's deterministic SHA-256 text
utility. This keeps privileged built-in access outside the plugin registration
graph and gives other plugins one stable hashing primitive.

### D-ER-034: Core freezes policy source; plugin freezes resolution

Core stores the complete stage definition, including review config, in the
deep-frozen execution-graph snapshot. The config contributes to the graph digest,
and recovery fails if the current definition does not match that persisted
digest. The plugin therefore resolves from one core-frozen source for an attempt,
then deep-freezes the resolved policy and verifies its digest during reduction.

The plugin does not add a second policy persistence store. A retry is a new core
attempt but still uses the same run graph snapshot unless core starts a new run
with a different graph digest.

### D-ER-035: Review escalation names its real issuer

An orchestration wait authorizes `orchestrator:kubeclaw.review`, not `core`.
The plugin defines the signal it needs and the review-specific orchestrator that
may answer it. Core remains responsible for persisting the wait, validating the
resume signal, and applying the lifecycle transition. The plugin never claims
that core itself issued the review request.

### D-ER-036: The byte ceiling applies before hashing

The stage counts JSON bytes with a bounded, non-allocating traversal before it
canonicalizes or hashes evidence. It stops as soon as the resolved policy limit
is exceeded. A second exact canonical-size check remains after strict parsing.
Oversized input therefore cannot force unbounded canonical-string allocation
before the configured ceiling is applied. Input that exceeds the supported JSON
depth is rejected during preflight instead of leaving the deeper subtree
uncounted. Sparse or oversized arrays, unsupported values, non-finite numbers,
and non-plain objects are also rejected before a large invalid structure can
reach canonicalization.

Preflight size overflow is `blocked`, not `orchestrator_required`, because the
unexamined remainder cannot be certified as valid input. A fully parsed Echo
response that exceeds its configured proposal limit may still request the
review-specific orchestrator.

### Point 12 closeout

Package tests, TypeScript, focused ESLint, the cross-repository agent-output
contract check, plugin inventory, SDK generation checks, and `git diff --check`
pass. The package-boundary test proves that the legacy PASS/FAIL parser,
contracts, fixtures, and symbols are absent.

The repository-wide plugin-package and live-capability wrappers reach an
unrelated Buster runtime failure (`ERROR` instead of `PASS`) before they can
complete. The review package's own live registry test passes. This failure is
recorded instead of being changed outside the review-plugin scope.

Terra/high independent review found that assessment citations were checked against
Echo's inspected-evidence list but not against the immutable evidence supplied
by the stage. Verification now requires every inspected and cited reference to
belong to the frozen input. The regression case is covered by the live stage
unit test. A later review concern about evidence-free satisfied assessments was
rejected because the strict parser already requires inspected evidence and a
citation for each satisfied assessment, with an existing regression test. The
final full-path rerun found no actionable findings. The repository boundary
audit then found direct Node crypto imports in the review graph; D-ER-033 records
the SDK-owned correction.

The final branch independent review also challenged durable policy freezing and the
orchestrator issuer. The policy concern was rejected after verifying the persisted
core graph snapshot and recovery digest checks. The issuer concern was accepted;
the wait now uses the review-specific identity in D-ER-035 with a live-stage
regression test.

The last full-branch rerun found that the size ceiling was applied after evidence
canonicalization. D-ER-036 fixes that resource-ordering error and covers exact
UTF-8 and JSON-escape accounting at the boundary.

The focused rerun found that the first counter stopped at the JSON depth limit
without charging the hidden subtree. Preflight now returns a distinct depth error
and rejects it before parsing. The regression test builds a 34-level value.

A later review used sparse and `undefined` arrays. Those values were not valid
evidence and the parser already rejected them before hashing, so the claimed
canonicalization bypass was not present. Preflight was still hardened to reject
these invalid shapes immediately and avoid walking a very large sparse array.

The final focused review found that early size overflow could hide a later
invalid value and incorrectly request orchestration. Oversized raw input now
blocks as untrusted state. A separate valid over-limit Echo response proves the
orchestrator path and issuer.

A final concern about dense arrays above 10,000 items was rejected. The strict
evidence-content parser already defines 10,000 as the explicit per-array hard
limit, independent of the byte limit. Preflight and parsing therefore agree.

The next branch rerun found that preflight measured depth from the outer stage
input while parsing measured from evidence content. Preflight now includes the
fixed wrapper route only for `evidence[].content`, so 32 content levels pass and
level 33 fails in both paths. Other input branches keep the original depth
ceiling. Preflight tracks the actual root `evidence` array and evidence item;
a same-named `content` key elsewhere cannot receive the exception. Boundary
tests cover all cases.

The last branch audit found one output-contract drift: the schema accepted a
repository path with a trailing slash while the parser rejected its empty final
segment. The schema now rejects trailing slashes, and the shared parity corpus
covers a valid finding plus this invalid path.

## Phase 2 final audit

The final full-branch Terra/high independent review reported no actionable findings.
Review package tests, repository TypeScript checks, plugin and sandbox builds,
Knip, the non-E2E plugin-system contract set, documentation checks, and
`git diff --check` pass.

The E2E matrix remains intentionally deferred. The repository-wide plugin
package/live-capability wrappers still stop in an unrelated Buster runtime test
that returns `ERROR` instead of `PASS`. The root npm audit reports three high
advisories in the `ajv`/`fast-uri` development chain and currently reports no
available fix. Neither external issue was hidden or changed as part of Echo
review governance.

## Point 11 — stable evaluation metadata

### D-ER-027: Decisions expose comparable facts

The plugin emits stable, namespaced evaluation facts for the decision-model,
Echo-output, policy, and Simplification registry versions; policy digest, profile, and
selected source; semantic verifier mode; and finding, follow-up, integrity,
unverified-requirement, and limit-violation counts.

Passed results use canonical `DecisionFacts`. Non-passed results carry the same
primitive fact map in `reason.details.evaluation`, because the platform StageResult
contract does not allow `facts` on those outcomes. This is established platform
extension data, not a third review lifecycle-result contract.

### D-ER-028: Performance telemetry remains deferred

Phase 2 does not invent latency, token, or cost fields without a working ClawDeck
evaluation loop. Runtime instrumentation may add those later through the platform
observability path. Review semantics and policy digests are stable now so future
performance comparisons have a reliable decision context.

### Point 11 closeout

Metadata tests, package tests, TypeScript, focused ESLint, plugin inventory,
documentation checks, and `git diff --check` pass.

Terra/high independent review found a compatibility regression in non-pass policy-digest
placement and incorrect follow-up counts on early escalation paths. Non-pass
results now retain top-level `policyDigest`, add the evaluation map, and compute
follow-up counts before every result path. The final rerun found no actionable
findings.

## Point 10 — built-in declarative profiles

### D-ER-025: Profiles are complete values, not code paths

The plugin defines three built-in, complete `review-policy.v1` values:

- `gate`: P0 correctness/security/contract closeout, direct and introduced proof,
  no Simplification advice, and strict scope handling;
- `lean`: the same P0 gate plus up to three high-confidence Simplification advisories;
  and
- `audit`: explicit broad review with larger hard-bounded output, retained
  pre-existing findings as follow-up, all registered Simplification candidates, and
  broad follow-up output. Its P0 blockers still require direct, introduced proof.

All profiles pass the same semantic parser at module initialization and are deeply
frozen. They have distinct canonical digests. Unknown profile names fail closed.
Profiles do not own retries, remediation cycles, or lifecycle behavior.

### D-ER-026: Evaluation changes values, not implementations

Future ClawDeck evaluation may compare profiles, ranking weights, verifier modes,
and bounded limits by supplying complete policy values. It must not introduce a
profile-specific reducer or prompt parser. `gate`, `lean`, and `audit` are useful
starting points, not permanent optimal values.

### Point 10 closeout

Profile tests, package tests, TypeScript, focused ESLint, plugin inventory,
documentation checks, and `git diff --check` pass.

Terra/high independent review found that the first audit profile allowed inferred and
pre-existing P0 claims to block. Audit now keeps its broad collection and
follow-up behavior but requires direct, introduced proof for blockers. The final
rerun found no actionable findings.

## Point 9 — contract and adversarial test hardening

### D-ER-023: Schema and semantic parser must agree

One deterministic corpus is evaluated by both the JSON Schema and semantic parser
for `echo-review-output.v1` and `review-policy.v1`. Validity must agree for valid,
unknown-field, padding, version, uniqueness, completeness, invariant, hard-limit,
and cross-field cases. This catches future schema/parser drift in either direction.

### D-ER-024: Plugin decisions must satisfy the platform contract

Representative `passed`, `request_fix`, `blocked`, and
`orchestrator_required` results from the real reducer are validated against the
canonical plugin-system `stageResult` schema. This proves the plugin does not
invent a review-specific lifecycle result shape.

The existing parser, invariant, resolver, reducer, and 31-case decision-matrix
suites remain mandatory in the package test command. All tests are deterministic;
model quality, latency, and token evaluation remain deferred to ClawDeck.

### Point 9 closeout

The package now passes 10 Echo parity cases, 8 policy parity cases, 4 canonical
StageResult validations, the 31-case reducer matrix, all focused package tests,
TypeScript, ESLint, plugin inventory, documentation checks, and `git diff --check`.

The new platform-contract test found that passed-result fact keys used camelCase,
which violated the platform namespaced-ID grammar. The reducer now emits
`review.policy_digest`, `review.finding_count`, and `review.follow_up_count`.
Terra/high independent review found no further actionable findings.

## Point 8 — exhaustive decision matrix

### D-ER-021: Decision precedence is fixed

The executable matrix fixes this order:

1. uncertified or malformed reduction state is `blocked`;
2. integrity failure is `blocked`;
3. unverified requirements use the configured blocked/orchestrator action;
4. verified output-limit violations require orchestration;
5. finding-level orchestration needs take precedence over repair;
6. policy-blocking unknown scope may block;
7. verified, in-scope, repairable blockers request repair; and
8. otherwise the review passes with non-blocking findings retained for follow-up.

The matrix covers 31 named cases across priority, category, diff relation, scope,
evidence, repairability, requirement, integrity, limit, and precedence behavior.

### D-ER-022: Insufficient evidence is not a verified finding

The untrusted Echo contract may report `insufficient` evidence. A certified
verified finding may contain only `direct` or `inferred` evidence. Insufficient
proposals must be rejected, retained as follow-up, or escalated by the verification
pipeline according to policy before certification. They cannot become a Nova
repair request merely because Echo labeled them as findings.

### Point 8 closeout

The 31-case decision matrix, package tests, TypeScript, focused ESLint, plugin
inventory verification, documentation checks, and `git diff --check` pass.

Terra/high independent review found missing wait-failure combinations. The matrix now
covers both absent and malformed waits for requirement, limit, and finding
escalation. The final rerun found no actionable findings.

## Point 7 — pure review decision reducer

### D-ER-019: Reduction consumes verified plugin state only

The reducer accepts the frozen policy and digest, verified canonical findings,
integrity issues, unverified requirement IDs, output-limit violations, and an
optional core/platform-supplied orchestrator wait. It does not accept Echo's raw
output or agent-authored PASS/FAIL text.

Finding priority, category, diff relation, scope relation, evidence strength, and
repairability are inputs from the plugin's future verification pipeline. Every
finding must carry the literal verified marker. Any untrusted or incomplete state
fails closed as `blocked`.

### D-ER-020: Reduction returns the existing `StageResult`

The pure reducer returns `passed`, `request_fix`, `blocked`, or
`orchestrator_required` directly as `stage-result.v2`. It does not create a third
public review result contract. It never executes a repair or transition.

Verified, direct, introduced, in-scope, repairable blockers become `request_fix`.
Incomplete trust state and required-but-unverified requirements become `blocked`.
Unrepairable blockers and limit/scope decisions that require broader authority
become `orchestrator_required`. If no valid orchestrator wait was supplied, that
case fails closed as `blocked`. Non-blocking findings follow policy and do not
silently become blockers.

### Point 7 closeout

Package tests, TypeScript, focused ESLint, plugin inventory verification,
documentation checks, and `git diff --check` pass.

Terra/high independent review drove fail-closed fixes for policy/digest separation,
malformed or unrelated waits, incomplete findings, malformed top-level state, and
unproven verification state. Resolved policies and certified reduction states now
use separate resolver-owned in-memory provenance markers; their contents are
validated and deeply frozen before reduction. One policy-validation finding was
rejected after checking the actual resolver path because all policy sources already
pass through `parseReviewPolicy`. A generated-inventory omission was corrected.
The final rerun found no actionable findings.

## Point 6 — policy resolution and freezing

### D-ER-017: Complete policies replace by explicit precedence

Each source supplies one complete `review-policy.v1` value. Resolution validates
the built-in policy, then an optional settings-file policy, then an optional
authorized run policy. The last present source wins as a complete value. Partial
deep merges are forbidden because they make evaluation provenance and future
schema migrations ambiguous.

Run-level policy is rejected unless its caller marks it authorized. Authorization
is supplied by the platform boundary; the review plugin does not invent it.

### D-ER-018: One immutable value and canonical digest per attempt

The resolver returns a deeply frozen policy, selected source, ordered source
provenance, and SHA-256 digest. Each source also receives a canonical digest.
Canonical JSON sorts object keys while preserving array order, so semantically
identical member ordering produces the same digest.

All input sources are validated against the same closed policy semantics before
selection. This prevents an invalid lower-precedence file from remaining hidden
in provenance. Core must record the resolved value and digest with the attempt;
the plugin must reuse that snapshot for dispatch, verification, and reduction.

### Point 6 closeout

Package tests, TypeScript, focused ESLint, plugin inventory verification,
documentation checks, and `git diff --check` pass.

Terra/high independent review found two valid boundary defects. Sparse policy arrays could
bypass enum validation and produce non-canonical digest input. A truthy non-boolean
run-authorization value could apply an unauthorized override. The parser now
rejects sparse arrays and the resolver requires authorization to equal boolean
`true`. The final rerun found no actionable findings.

## Point 5 — fixed invariants and hard ceilings

### D-ER-015: Trust invariants are stable and non-configurable

The review plugin publishes ten stable `RI-*` trust invariants. They preserve the
authority boundary, closed structured output, content-addressed evidence,
requirement completeness, safe repository scope, fail-closed reduction, complete
output, and one immutable policy per attempt.

`P0` blocking coverage for `correctness`, `security`, and `contract` is mandatory.
A policy may add other blocking priorities and categories, but it cannot remove
this minimum trust coverage. Priority meanings remain fixed by D-ER-014.

### D-ER-016: One hard-limit authority

`review-hard-limits.ts` is the only executable authority for review text, evidence,
requirement, finding, location, bundle, cluster, advisory, follow-up, Simplification, and
ranking ceilings. The Echo output schema, its semantic parser, and the review-policy
schema import these limits rather than restating numeric maxima.

Policy values may reduce per-attempt work below a hard ceiling. They cannot raise a
ceiling. Hard limits are trust and resource boundaries, not evaluation knobs. A
future ClawDeck UI must read policy bounds from the same schema and must not create
a parallel limit contract.

### Point 5 closeout

Package tests, TypeScript, focused ESLint, plugin inventory verification,
documentation checks, and `git diff --check` pass.

Terra/high independent review confirmed that the hard ceilings are shared by the Echo
schema, semantic parser, and policy schema; policy values cannot exceed them; and
mandatory P0 correctness, security, and contract coverage cannot be configured
away. It found no actionable findings.

## Point 4 — `review-policy.v1`

### D-ER-012: One full declarative policy shape

The public review policy is a complete, closed object rather than a partial patch.
The same JSON-compatible shape is used by a settings file now and a future
ClawDeck editor. A UI-specific configuration format is forbidden.

The policy contains:

- blocking priorities, categories, and diff/evidence requirements;
- review-output, bundle, cluster, instance, and advisory limits;
- outside/unknown scope and pre-existing finding handling;
- semantic verification and insufficient-evidence handling;
- Simplification rule selection and recommendation limits;
- explicit priority, category, diff, and evidence ranking weights; and
- retained follow-up priorities and limits.

It contains no retry, remediation-cycle, wait, cancellation, or lifecycle setting.
Those remain graph/core authority.

### D-ER-013: Configuration uses knobs, not code paths

All tunable values are typed, bounded, and closed. Categories and priorities use
the exact enums from `echo-review-output.v1`. Policy profiles introduced in Point
10 will be complete values of this one schema, not separate implementations.

Simplification selections pin `simplification-rules.v1` and use its typed SIM001-SIM008 registry;
unknown rule IDs are invalid in both JSON Schema and TypeScript. Changing a rule's
meaning requires a new registry version so historical policy digests remain
comparable. Enabled Simplification policy requires at least one rule and recommendation,
while disabled policy requires both to be empty/zero. Any action configured as
`follow_up` requires at least one retained priority and positive follow-up capacity.

Settings are intentionally not partial. Point 6 may layer built-in, file, and
authorized run inputs internally, but it must emit one complete frozen policy
before review dispatch. ClawDeck comparisons operate on that resolved value and
its digest.

### D-ER-014: Priority meaning is fixed

- P0: demonstrated ship blocker against an explicit correctness, security,
  contract, or required-behavior boundary.
- P1: important probable defect requiring explicit follow-up or stricter policy.
- P2: architecture or maintainability concern.
- P3: simplification or minor improvement.

Policies decide which priorities block; they do not redefine what the priorities
mean.

### Point 4 closeout

Policy schema tests, package tests, TypeScript, ESLint, documentation checks, and
`git diff --check` pass.

Terra/high independent review found and drove fixes for impossible follow-up routing,
unknown Simplification rule selection, missing registry-version pinning, and a TypeScript
rule-ID type that was initially wider than the JSON Schema. The final rerun found
no actionable findings.

## Point 3 — `echo-review-output.v1`

### D-ER-009: Agent output contains assessments and proposals only

The new closed contract contains:

- a fixed schema version;
- a bounded summary;
- 1-128 content-addressed inspected-evidence references;
- 1-256 requirement assessments uniquely keyed by stable requirement ID; and
- 0-128 proposed findings.

It contains no PASS/FAIL field and no `StageResult` value.

The parser accepts only a structured object and returns a deeply frozen parsed
value. It does not parse raw JSON text, avoiding duplicate-member and
last-key-wins ambiguity at this boundary. Point 12 will connect this parser to
`runtime.dispatch` and prove that raw model/transcript bytes remain separate
evaluation evidence rather than pipeline control data.

Each non-unverified requirement assessment must cite inspected evidence. Each
finding must cite inspected evidence and contain category, P0-P3 priority, claim,
impact, normalized repository-relative locations, smallest recommended fix, change
relation, scope relation, and evidence strength.

Simplification data is optional and accepted only on simplification findings. It records
the simplification category, deterministic candidate IDs, smallest replacement,
and optional non-negative net-LOC reduction estimate.

### D-ER-010: Agent relations remain claims

`changeRelation`, `scopeRelation`, `evidenceStrength`, priority, and
`rootCauseHint` are agent-authored proposals. Parsing proves only that they are
well-formed and internally referentially consistent. Later verification decides
whether they can influence disposition, fingerprinting, or clustering.

### D-ER-011: Evidence references are content addressed

Every evidence reference is exactly a stable kind and SHA-256 digest. Artifact
lookup metadata belongs to the future frozen bundle rather than the agent-authored
identity. Requirement and finding evidence must be a subset of
`inspectedEvidence`; duplicate evidence references are rejected.

The future frozen bundle will verify that inspected evidence was actually offered
to Echo. This point verifies only the closed output boundary.

### Point 3 closeout

Focused contract tests, package tests, TypeScript, ESLint, documentation checks,
and `git diff --check` pass.

Terra/high independent review found and drove fixes for:

- Windows drive-qualified path escape;
- schema/parser disagreement for evidence uniqueness, required assessment proof,
  and Simplification placement;
- ambiguous evidence identity caused by optional artifact metadata;
- padded, blank, Unicode-length, and final-line-terminator text mismatches;
- non-exact identifier and digest anchors;
- NUL and other control characters in source paths; and
- duplicate JSON member ambiguity caused by reparsing raw strings.
- requirement-ID uniqueness that an assessment array could not express in JSON
  Schema; assessments are now structurally keyed by requirement ID.

The final rerun found no actionable findings.

## Point 2 — Current contract consolidation

### D-ER-008: One executable contract authority

The PASS/FAIL protocol was temporary until Point 12, but Phase 2 did not build
its replacement on five drifting representations. At this point in the sequence,
the executable schema, field lists, enums, and TypeScript types lived together in
`src/contracts.ts`.

The dispatch request imports that exact schema. The manual semantic parser imports
its field lists, enums, and types. Package tests import the same schema. The
standalone, non-manifest `reviewer-output.schema.json` duplicate was removed.

The human prompt no longer reproduces the entire JSON shape. It instructs Echo to
match the attached `outputContract`, which is the exact executable schema sent to
the runtime adapter.

This consolidation intentionally preserved the old PASS/FAIL behavior. Point 3
replaced the authority with `echo-review-output.v1`; Point 12 proved the legacy
fields absent.

### Point 2 closeout

Focused package tests, TypeScript, plugin inventory verification, the cross-plugin
agent-output contract check, documentation checks, and `git diff --check` pass.

Terra/high independent review found one valid remaining duplicate: the dispatch metadata's
allowed-status tuple was still written independently from the shared status enum.
It now imports the same `REVIEW_STATUSES` authority. The clean rerun found no
actionable findings.

## Point 1 — Authority and lifecycle

### D-ER-001: Echo owns observations, not lifecycle verdicts

Echo may report:

- which declared requirements it assessed;
- whether each requirement appears satisfied, violated, or unverified;
- which immutable evidence records it inspected;
- proposed findings and their evidence;
- proposed diff and scope relationships;
- proposed remediation; and
- optional Simplification simplification information.

Echo may not author:

- a canonical PASS/FAIL stage verdict;
- a `StageResult`;
- a canonical finding fingerprint;
- a verified root-cause cluster identity;
- a final blocking disposition;
- retry or remediation budgets; or
- lifecycle transitions.

Agent-authored diff, scope, priority, evidence-strength, and root-cause values are
claims. The plugin must not treat them as verified facts merely because they match
the output schema.

### D-ER-002: The review plugin owns review-domain policy

The review plugin owns:

- the Echo output contract;
- the declarative review-policy contract;
- contract and semantic validation;
- evidence-reference validation;
- requirement-completeness rules;
- review-specific hard ceilings;
- policy resolution and freezing;
- finding verification, ranking, deduplication, and clustering;
- review disposition; and
- reduction to an existing canonical `StageResult`.

The plugin returns one of the existing outcomes:

- `passed`: review is complete and the resolved policy finds no blocker;
- `request_fix`: verified, repairable blockers exist inside the declared scope;
- `blocked`: review cannot produce a trustworthy decision because its input,
  evidence, agent response, or required verification is invalid or incomplete; or
- `orchestrator_required`: a trustworthy decision exists but the proposed repair
  exceeds the frozen review scope or review-policy output limits and requires a
  broader decision.

The plugin does not execute remediation, retry agents, advance the graph, or write
core lifecycle state.

### D-ER-003: Core remains the only lifecycle authority

Core owns:

- validation and acceptance of canonical `StageResult` values;
- durable attempt and event state;
- stage transitions;
- retry, remediation, wait, cancellation, and recovery behavior;
- enforcement of graph-declared lifecycle budgets;
- orchestration and operator handoff; and
- replay of the recorded decision and transition.

The plugin's result is the review-domain decision for one frozen attempt. Core
decides what that result means for the pipeline lifecycle.

### D-ER-004: No new review lifecycle-result contract

Phase 2 introduces only two review-specific public shapes:

1. `echo-review-output.v1`, the untrusted internal agent protocol; and
2. `review-policy.v1`, the user/platform-configurable review policy.

The existing core `StageResult` is reused unchanged. The mapping from validated
review state and resolved policy to `StageResult` is pure plugin code with an
exhaustive test matrix, not a third result contract.

Phase 3 may introduce a frozen `review-bundle.v1` because agent input is a separate
trust boundary. It must not duplicate policy or lifecycle-result semantics.

### D-ER-005: Missing evidence is not a code failure

The following classes remain distinct:

- a verified implementation defect that Nova can repair: `request_fix`;
- invalid or missing evidence that prevents judgment: `blocked`;
- malformed or contradictory Echo output: `blocked`;
- a verified problem whose repair exceeds the frozen review scope:
  `orchestrator_required`; and
- a complete clean review: `passed`.

The plugin must never turn missing evidence, invalid agent output, or unavailable
verification into a Nova repair request.

### D-ER-006: Policy is frozen per attempt

Every attempt resolves its built-in profile, settings-file overrides, and
authorized run overrides before Echo dispatch. The complete resolved policy is
immutable for that attempt and receives a canonical digest.

Retry, recovery, verification, and reduction for the same attempt must use the
same policy snapshot. A later attempt may use a different policy only when core
records a new attempt with explicit configuration provenance.

### D-ER-007: Configuration cannot weaken trust invariants

Declarative settings may tune review behavior, but may not:

- grant Echo lifecycle authority;
- accept unknown or malformed output;
- permit mutable or undeclared evidence identities;
- silently ignore a required requirement;
- silently truncate blockers;
- escape the declared repository or owner scope;
- change policy during an attempt;
- exceed hard security or resource ceilings; or
- suppress the fact that a configured suppression or advisory rule was applied.

### Authority flow

```text
frozen task/evidence/policy
          |
          v
 Echo assessments and proposals
          |
          v
 review plugin validation and policy
          |
          v
 canonical StageResult
          |
          v
 core lifecycle transition and journal
```

### Outcome mapping baseline

| Review-domain state | Plugin outcome | Core responsibility |
| --- | --- | --- |
| Complete, no configured blocker | `passed` | Advance dependents |
| Verified, in-scope, repairable blocker | `request_fix` | Enter declared remediation path within graph budget |
| Missing/invalid evidence or invalid Echo output | `blocked` | Record halt/failure according to graph policy |
| Verified blocker cannot fit frozen review scope or review-output budget | `orchestrator_required` | Enter declared operator/orchestrator path |

This table defines ownership, not the complete Phase 2 decision matrix. Points
7-9 will make the mapping exhaustive and executable.

Cross-attempt convergence is deliberately absent from this table. The plugin has
no authority to count retries or remediation cycles. Core applies the graph's
durable lifecycle budget after receiving the per-attempt review disposition.

## Point closeout protocol

Every applicable point must:

1. implement only its declared scope;
2. run focused deterministic proof;
3. run independent review with `gpt-5.6-terra` and high reasoning through
   `/app/node_modules/@openai/codex/bin/codex.js`;
4. verify every accepted finding against the real ownership boundary;
5. fix accepted findings and rerun proof and independent review until clean;
6. update this design and its audit evidence; and
7. commit the clean slice before the next point.

## Point 1 closeout

Deterministic proof:

- documentation structure check: passed;
- repository-reference check: passed; and
- `git diff --check`: passed.

Independent review used Codex at `/app/node_modules/@openai/codex/bin/codex.js` with
`gpt-5.6-terra` and high reasoning. The first review found one valid authority
conflict: the plugin was allowed to interpret a cross-attempt convergence budget
even though core owns durable retry and remediation state. The design was corrected
so the plugin enforces only per-attempt review scope and output policy while core
alone enforces graph lifecycle budgets. The second review returned no actionable
findings.

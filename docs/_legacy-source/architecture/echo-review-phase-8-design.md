# Echo review Phase 8 design and audit record

## Point 1 — lifecycle and authority audit

Core already owns attempt state, retry scheduling, remediation scheduling, and
the configured remediation budget. `StageRuntimeState.remediationCyclesUsed`
advances only when core accepts `request_fix`; an ordinary retry advances only
the attempt count. This is the certified cycle source Phase 8 must use.

The plugin context already has an `artifacts` field, but stage execution always
supplied an empty list. Lifecycle artifact events also retained metadata but not
the complete immutable `ArtifactRef`. Consequently, a later review attempt could
not recover the first review's frozen baseline without adding mutable state.

The review plugin already freezes Git revisions, allowed prefixes, changed-file
manifests, and policy digests. The repository adapter also provides exact changed
line ranges. These are sufficient for deterministic file and added non-test LOC
measurements. Ownership boundaries are not currently represented and must be
added to the closed review input rather than inferred by an agent.

The smallest stable design is therefore:

- add read-only certified stage lifecycle data to `plugin-context.v2`;
- preserve complete prior stage artifact references in that context;
- freeze the first completed review's governor snapshot in its immutable report;
- read that snapshot on later remediation attempts through `artifacts.read`;
- measure the current revision mechanically; and
- return orchestration when certified limits are exceeded.

No database, mutable ledger, fuzzy ownership inference, second agent, or new
lifecycle scheduler is required. Core remains authoritative. The review plugin
only evaluates its frozen policy and returns a canonical result.

## Point 2 — immutable governor snapshot

`review-governor.v1` records one baseline and one current measurement. The
baseline contains the original base and head revisions, changed-manifest and
policy digests, allowed and ownership prefixes, changed-file count, added
non-test LOC, and initial owner keys. Its stable SHA-256 identity excludes
messages, line hints, and report order.

The baseline is written inside `review-report.v2`. Later repair attempts recover
it only through a complete prior `ArtifactRef` supplied by core and an exact
`artifacts.read` lookup. The report, artifact digest, producer attempt, policy,
revision, and baseline identity are checked together. A remediated attempt with
no valid prior baseline cannot create a new baseline silently.

## Point 3 — closed policy controls

`review-policy.v2` adds five integer controls: maximum repair cycles, file-growth
multiplier, added non-test LOC multiplier, absolute file allowance, and absolute
added non-test LOC allowance. All built-in profiles use two cycles, a two-times
relative limit, two extra files, and 100 extra non-test lines. Hard ceilings live
beside the existing review resource ceilings and are shared by schema and parser.

The effective growth limit is the larger of the relative limit and the small
absolute allowance. This prevents tiny initial changes from receiving an
unreasonably small budget.

## Point 4 — core-certified lifecycle and artifact history

Core now supplies read-only stage lifecycle counters in `plugin-context.v2`.
It also supplies complete immutable artifact references previously created by
the same run and stage. Lifecycle events retain the complete `ArtifactRef`, so
recovery does not depend on mutable plugin state.

The review governor consumes `remediationCyclesUsed`; it does not consume the
attempt count. Core still advances remediation only after accepting
`request_fix`, schedules Nova, and enforces the pipeline definition's own hard
budget. The plugin policy is an earlier escalation threshold, not a replacement
for core lifecycle authority.

## Point 5 — deterministic scope measurement

The repository adapter proves the changed-file manifest and exact added-line
ranges against the frozen base and head commits. The governor counts all changed
files and added lines outside canonical test paths. Test directories and
`.test.` or `.spec.` files do not consume the non-test LOC budget.

Ownership prefixes are explicit closed review input. When omitted, they default
to the already-authorized scope for backward compatibility. The most specific
matching prefix is the owner key. A path with no owner or a new owner key after
the baseline is an ownership crossing. Echo does not infer these values.

## Point 6 — exact classification

Every independently verified finding stored in the report receives one governor
class. A policy-eligible blocker under a healthy governor is an
`in_scope_blocker`. The same blocker under an exceeded governor is a
`scope_break`. Non-blocking retained work is a `follow_up`. The classification
is deterministic and does not depend on finding order.

## Point 7 — governor decisions

The closed decisions are `within_scope`, `cycle_exhausted`, `file_growth`,
`non_test_loc_growth`, `ownership_crossing`, and `invalid_state`.

- `within_scope` preserves the existing result.
- A repair request at the cycle threshold requires orchestration.
- File, LOC, or ownership overflow requires orchestration and cannot pass.
- Invalid state blocks safely.
- A clean result after the last allowed repair may pass; cycle exhaustion alone
  does not turn successful remediation into an escalation.

Scope decisions take precedence over cycle exhaustion. Therefore, a clean final
repair may pass only when it remains inside file, LOC, and ownership limits.

The governor runs after semantic review establishes its result. It cannot make a
finding block, and it cannot turn a blocker into a pass. It only permits repair,
requires orchestration, or blocks unverifiable state.

## Point 8 — report and evaluation integration

`review-report.v2` contains the complete governor snapshot. Runtime validation
recomputes the baseline identity and binds the governor to the report's policy,
base revision, current head, and changed-manifest digest. Stable evaluation facts
publish the decision, cycle count, measurements, limits, and ownership-overflow
count. Report item and display limits still affect presentation only.

## Point 9 — integration proof and closeout

The live integration test exercises the complete internal path with real Git
commits, plugin discovery, capability grants, repository and artifact adapters,
runtime dispatch, pipeline core, remediation scheduling, journal events, and
immutable report recovery. Only the external Echo service is replaced by a
local deterministic HTTP endpoint.

The test proves that the first completed review freezes one baseline, ordinary
attempt retries do not consume repair cycles, two accepted repair requests use
cycles one and two, and a third repair request requires orchestration. All three
reports retain the same baseline identity. Focused unit tests separately prove
file growth, added non-test LOC growth, ownership crossing, policy mismatch,
reordered input, and safe handling of invalid history.

Architecture reviews found three valid edge cases. First, a scope breach could
preserve an already blocked semantic result instead of escalating to
orchestration. Second, cycle exhaustion was evaluated before scope breaches, so
a clean final repair could pass outside its scope. Third, early semantic and
dispatch failure paths persisted reports without applying the governor. The
single report-persistence boundary now applies every governor decision, and the
decision reducer escalates blocked, passed, and repair-request results when scope or ownership
limits are exceeded, and scope decisions precede cycle exhaustion. Direct
regression tests cover all three cases.

Final verification includes the complete review test suite, schema/parser
parity, all skill TypeScript configurations, SDK generation checks, plugin and
sandbox builds, lifecycle and capability contracts, generated inventory,
documentation checks, the complete non-production plugin-system verifier,
focused lint, diff checks, and a full Phase 8 Terra/high review. The final
Terra/high pass reported no actionable findings. The production E2E matrix
remains deferred to the authorized production closeout.

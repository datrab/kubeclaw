# Echo review Phase 4 design and audit

Status: complete
Owner: `skills/nova/plugins/review`
Phase: independent semantic verification

This document records the implementation decisions, audits, accepted findings,
and verification proof for the sequential plan in
[echo-review-phase-4-plan.md](echo-review-phase-4-plan.md).

## Point 1 — existing-boundary audit

### Current flow

The live review stage freezes Git `HEAD`, derives changed scope from the supplied
base, hydrates and selects bounded context, snapshots `review-bundle.v1`, and
dispatches Echo. Echo may request one bounded context expansion. The final Echo
response and final bundle then enter `verifyEchoReviewForReduction`.

The Phase 2 placeholder validates requirement and evidence membership but turns
every proposed finding into an integrity issue. It supplies no findings to the
pure reducer. Therefore a clean, complete Echo assessment may pass, while no
Echo proposal can currently produce `request_fix`.

Each `runtime.dispatch` invocation is a separately journaled effect. The
OpenClaw provider creates a new session for every invocation. Phase 4 will make
the verifier a separate invocation with a verifier-specific protocol, role, and
prompt. Configuration may name a distinct verifier target; the primary review
target remains the safe default for a simple deployment. Capability grants still
decide which runtime targets the stage may invoke.

### Authority map

| Value | Untrusted source | Trusted authority | Consumer |
| --- | --- | --- | --- |
| Requirement assessment | Echo | Strict parser plus evidence-membership checks | Verification boundary |
| Proposed claim, category, priority, impact, locations, and fix | Echo | Strict parser; semantic verifier confirms the proposal as a whole | Verification boundary |
| Evidence membership and digest | Echo cites | Frozen bundle parser and plugin evidence checks | Verifier and reducer certification |
| Frozen base, head, changed paths, and source content | Repository adapter | Private revision proof and bundle snapshot | Echo, verifier, deterministic checks |
| Allowed scope | Stage input | Bundle parser plus repository capability grant | Deterministic preflight |
| Change relation | Echo proposes | Plugin comparison against frozen Git scope | Reducer certification |
| Scope relation | Echo proposes | Plugin comparison against frozen allowed scope | Reducer certification |
| Semantic verdict | Semantic verifier | Strict verifier-response parser and request/response identity checks | Reconciliation |
| Repairable | Echo proposes a fix | Verifier confirms the whole proposal; plugin requires all repair locations to remain in frozen scope | Reducer certification |
| Exact proposal ID and finding fingerprint | None | Plugin canonicalization and SHA-256 | Verifier correlation and reducer |
| Review outcome | None | Review plugin's pure reducer | Core |
| Retry, remediation, wait, persistence, and transition | None | Core | Pipeline lifecycle |

No untrusted source may write the literal certified marker accepted by
`ReviewReductionInput`.

### D-ER4-001: Runtime failure remains core retry authority

The approved plan distinguishes verifier failure from explicit rejection, but a
transport exception must not be converted into a plugin-authored terminal result.
Echo and verifier dispatch exceptions continue to propagate to core. Core applies
the frozen attempt and retry budget. A completed dispatch with malformed,
partial, mismatched, or otherwise untrusted verifier output becomes a plugin
`blocked` result.

This keeps failure classes distinct:

- explicit `rejected`: a successful semantic decision with no blocking effect;
- explicit `insufficient_evidence`: a successful uncertain decision routed by
  policy;
- malformed completed response: plugin `blocked` integrity failure; and
- provider, timeout, or transport exception: core retry/failure handling.

### D-ER4-002: Verification uses the final Echo bundle

If Echo uses its one context expansion, the verifier receives the expanded final
bundle and its digest. It never receives the obsolete initial bundle and cannot
request a third dispatch for more context.

### D-ER4-003: Independence does not require a new plugin

The review stage reuses the existing `runtime.dispatch` capability. A distinct
verifier protocol and fresh invocation provide session and prompt isolation. An
optional verifier runtime target permits later model separation and ClawDeck
evaluation without creating a new plugin, service, lifecycle result, or queue.

### D-ER4-004: Phase 4 confirms proposals, not review completeness

The semantic verifier receives only deterministic, policy-eligible proposals. It
does not perform another complete review and cannot add findings. Detecting a
problem Echo omitted remains outside Phase 4. Whole-project audit and second-full-
review experiments remain separate future capabilities.

### Point 1 closeout criteria

- Every value entering certified reduction state has one named authority.
- Runtime and lifecycle ownership remain unchanged.
- The verifier uses the final immutable bundle.
- Rejection, uncertainty, malformed output, and transport failure are distinct.
- No new service, plugin, result contract, or repository-wide scan is required.

Point 1 passed documentation and reference checks, `git diff --check`, and a
focused Terra/high Independent review with no actionable findings. It was committed as
`e00ff9481`.

## Point 2 — `echo-review-verification.v1`

### D-ER4-005: One closed internal verifier response

The verifier returns `echo-review-verification.v1`. The response binds itself to
the frozen bundle, resolved policy, and exact proposal set by SHA-256 digest. Its
`results` object is keyed by plugin-authored proposal digest, so duplicate result
IDs are structurally impossible in JSON.

Each result contains exactly:

- `verdict`: `confirmed`, `rejected`, or `insufficient_evidence`;
- one bounded, unpadded reason; and
- immutable evidence references from the review bundle.

Confirmed and rejected verdicts require cited evidence. Insufficient evidence may
carry no references. Request-to-response completeness, unknown proposal IDs, and
evidence membership are later reconciliation checks because they require the
specific request authority created in points 3 through 5.

### D-ER4-006: The verifier cannot rewrite the proposal

The response has no fields for category, priority, claim, impact, location, fix,
scope, change relation, or pipeline outcome. The verifier can only confirm the
submitted proposal as a whole, reject it, or state that its evidence is
insufficient.

### D-ER4-007: TypeScript is the schema authority

The TypeScript contract exports the runtime output schema. A generator writes
`schemas/echo-review-verification.v1.schema.json`, and `schema:check` fails on
drift. The semantic parser rejects unknown fields, invalid or padded text, bad
digests, sparse or excessive collections, duplicate evidence, missing evidence
for decisive verdicts, and invalid dispatch envelopes. It deeply freezes accepted
output.

The request interface reserves only the agreed verifier protocol, role, frozen
bundle identity, proposal map, task text, and output contract. Point 4 will build
and dispatch that request; point 2 does not add a second runtime path early.

### Point 2 proof

The focused suite passes generated-schema checks, the new verifier unit corpus,
schema/parser parity, all existing review package tests, review TypeScript, and
`git diff --check`. The parity corpus covers valid decisive and insufficient
responses plus closed-shape, digest, identifier, evidence, verdict, padding, and
empty-result failures.

The first Terra/high review found that `Array.prototype.map` skipped sparse
evidence holes and that a non-object dispatch envelope could throw before the
fail-closed parser result. Both findings were accepted. Evidence arrays are now
checked densely before mapping, and the dispatch parser accepts `unknown` and
validates the envelope object. Direct sparse, `null`, and array-envelope
regressions cover both corrections.

The final Terra/high rerun reported no actionable findings. Point 2 was committed
as `3c9daf1ed`.

## Point 3 — deterministic proposal preflight

### D-ER4-008: Git proves changed head-line ranges

A changed-file manifest cannot prove that a finding in a modified file was
introduced by the reviewed diff. The repository adapter therefore adds one
bounded `changed_line_ranges` read operation. It accepts one allowed repository
path plus the attempt-private frozen head proof and ancestor base. It returns only
sorted head-line ranges and a canonical digest, not an unrestricted patch.

The adapter disables external diff drivers and text conversion and fixes the Git
diff algorithm. The review plugin checks revision identity, range structure,
configured hard limits, and the range digest. Capability authorization applies
the existing repository path grant before invocation.

### D-ER4-009: Deterministic facts replace Echo relation claims

Preflight accepts only strictly parsed Echo output and the final frozen bundle.
For every proposal it checks:

- cited evidence was supplied and inspected;
- every location is present in reviewed context;
- every location is inside the frozen allowed scope; and
- every line-specific location in a changed file has changed-line proof.

An added file is introduced. A line hint inside a changed head-line range is
introduced. A location outside the changed manifest is pre-existing. A modified
location without a line hint is unknown. Mixed introduced and pre-existing
locations are exposed. Any unknown member makes the combined relation unknown.
Echo's submitted scope and change-relation fields do not override these facts.

### D-ER4-010: Exact duplicate collapse is mechanical

The plugin creates a proposal ID from canonical parsed proposal content and
SHA-256. Identical proposals collapse before model work. The eligible proposal-set
digest covers the sorted eligible IDs. This is exact duplicate removal only;
semantic fingerprints and root-cause clustering remain later phases.

Raw proposal count is still checked against policy before duplicates can reduce
the workload. Eligibility uses the resolved semantic-verifier mode, blocking
category and priority, deterministic change relation, and deterministic scope.
The result is deeply frozen.

### Point 3 focused proof

Repository-adapter tests cover modified and added ranges plus invalid revision
proof. Review tests cover deterministic relation correction, exact duplicates,
proposal-set digest, missing context, policy eligibility, disabled verification,
and immutability. Repository adapter and review builds and tests pass, as do core
TypeScript, capability-security contracts, SDK generation checks, and
`git diff --check`.

The first Terra/high review found three integration defects. Preflight existed
but was not used by the live stage. A proposal with invalid evidence or location
could remain eligible. Git attributes could also suppress textual hunks and make
a changed file look pre-existing. All three findings were accepted. The stage now
requests line proof and runs preflight before reduction, integrity-invalid
proposals cannot become eligible, and the repository adapter forces a bounded
text diff. An empty changed-line proof is treated as unknown, never pre-existing.
The rerun found that added files were correctly classified as introduced but
were still rejected for missing line proof. Added files now bypass that
unnecessary proof, and a regression test covers their eligibility.

The next rerun proposed converting repository invocation failures into proof
errors. That finding was rejected because it would remove core's established
retry authority. The capability invocation stays outside response validation:
transport or provider failure propagates, while a completed malformed response
becomes a controlled immutable-proof failure. A source comment records this
boundary.

The following rerun found two more valid input-boundary issues. Line hints are
now checked against the exact frozen source content, so a proposal cannot cite a
line that Echo did not receive. The raw proposal limit is also checked before
any changed-line capability calls, so an over-limit model response cannot
amplify repository work.

The next rerun found that a completed provider response could return overlapping
or unsorted ranges with a valid digest. The plugin now requires strictly ordered,
non-overlapping ranges at the proof boundary. A regression test confirms that a
noncanonical response blocks.

The following rerun said the deduplicated set was not carried forward. That
finding was rejected. The complete preflight object, including its canonical
proposal map and eligible IDs, is already passed into the verification boundary;
the raw Echo list is used there only for requirements and evidence checks. Point
4 will dispatch only the eligible preflight IDs. No downstream proposal model
call exists in point 3.

The next rerun warned that an out-of-scope proposal could trigger line-proof
reads. That finding was rejected after checking the full path. The changed
manifest is already filtered by the frozen allowed prefixes, and bundle
preparation proves that every non-deleted changed path is selected into context.
Line-proof requests intersect proposal paths with that trusted manifest. A code
comment records these upstream invariants.

## Point 4 — bounded fresh semantic verification

### D-ER4-011: Reuse one fresh runtime dispatch

The semantic verifier is not a new plugin or service. The review stage makes one
additional `runtime.dispatch` call only when deterministic preflight produced at
least one eligible proposal and no integrity or limit failure. The runtime
adapter creates a new one-shot session for every dispatch. The request assigns
the narrow `semantic-verifier` role and forbids repository browsing, context
expansion, new findings, proposal rewrites, and lifecycle outcomes.

The verifier uses the same configured review target. Model and execution
settings therefore remain owned by the runtime target configuration rather than
being duplicated in review policy.

### D-ER4-012: Bind the exact attempt and immutable inputs

The request includes plugin-authored run, stage, attempt, and attempt-number
identity from the active lease. It also includes the final frozen bundle, bundle
digest, resolved policy digest, exact eligible proposal map, and sorted proposal
set digest. Only the deduplicated eligible IDs from point 3 are sent.

The complete request has a fixed 24 MiB hard ceiling in addition to all bundle,
proposal, evidence, and context limits. A request that exceeds the ceiling is a
controlled review limit result and is never dispatched.

### D-ER4-013: Runtime failure is not a verdict

The verifier response is parsed through the closed point 2 contract. A completed
malformed response reaches the plugin as invalid verification state. A timeout,
provider error, cancellation, or transport failure still rejects the capability
invocation and propagates to core retry policy. No catch converts such a failure
to `rejected` or `insufficient_evidence`.

Point 4 deliberately stops before result reconciliation. A structurally valid
response still blocks through a temporary reconciliation marker. Point 5 removes
that marker only after exact request-response matching is implemented.

Point 4 passed the focused review suite, TypeScript, documentation checks, and a
Terra/high review with no actionable findings. It was committed as `912928cab`.

## Point 5 — exact verifier reconciliation

### D-ER4-014: Reconcile against plugin-authored request facts

Reconciliation accepts the final bundle snapshot, deterministic preflight,
resolved policy, and strictly parsed verifier response. It checks all three
request digests, requires the result-key set to match the sorted eligible
proposal IDs exactly, and rejects evidence references outside the frozen bundle.
One JSON result key represents one verdict, so an eligible proposal cannot have
duplicate verdicts.

The reconciled value keeps separate ordered ID lists for `confirmed`, `rejected`,
and `insufficient_evidence`. It is deeply frozen before it reaches policy
mapping. The verifier cannot add or edit proposal semantics through this value.

### D-ER4-015: Failure and rejection remain different states

A malformed, missing, or digest-mismatched response creates an integrity issue
and no rejected IDs. An explicit `rejected` verdict is retained as a valid result
with its verifier reason and evidence. A missing result is not inferred as
rejection or uncertainty.

Point 5 stops before confirmed findings and uncertainty are converted to reducer
state. Those verdict classes retain a temporary policy-mapping marker. A response
containing only explicit rejections does not receive that marker.

The first Terra/high review found that digest-mismatched output still exposed its
verdict ID lists beside the integrity issue. The finding was accepted. Any
reconciliation integrity failure now clears all results and all verdict lists,
so an unbound response cannot be mistaken for an explicit rejection.

The rerun found missing test coverage for policy-digest, proposal-set-digest, and
unknown-result-key failures. The finding was accepted. Each binding branch now
has a regression test that also proves all results and verdict lists are cleared.

The next rerun said rejected proposals could survive into reduction. That finding
was rejected after checking the certified boundary. Reduction still receives an
empty finding list in point 5; no raw Echo proposal reaches it. Point 7 will be
the first code allowed to construct reducer findings, and it will use only
reconciled confirmed IDs. A source comment makes this invariant explicit.

The next rerun found that the test checked only the outer freeze. The finding was
accepted. Tests now prove nested result records, evidence arrays, evidence
objects, verdict-ID arrays, and integrity-failure values are frozen.

The final rerun requested complete no-verdict assertions for missing-result and
foreign-evidence failures. The test now uses one shared assertion to prove every
results object and verdict list is empty for those paths and malformed output.

The following rerun found that the local freeze helper skipped children when an
input container was already shallow-frozen. The finding was accepted. The helper
now always traverses children before it conditionally freezes the parent, and a
shallow-frozen-input regression proves nested values become immutable.

Point 5 passed the focused suite, TypeScript, and the final Terra/high review
with no actionable findings. It was committed as `c66d41ae2`.

## Point 6 — stable verified finding identity

### D-ER4-016: Only confirmed IDs can create reducer findings

The finding builder accepts only the frozen bundle snapshot, deterministic
preflight, and reconciled verification. It iterates the reconciled confirmed-ID
list and retrieves semantic content from the plugin-authored preflight map.
Rejected, insufficient, unknown, malformed, and unbound results cannot create a
`VerifiedReviewFinding`.

A proposal whose submitted evidence strength is `insufficient` is never eligible
for semantic verification. When policy requires direct evidence, inferred
proposals are also ineligible. This keeps the certified reducer type honest.

### D-ER4-017: Fingerprints exclude line-number hints

The fingerprint is SHA-256 over canonical `verified-review-finding.v1` content:

- frozen repository base revision;
- category, priority, claim, impact, and recommended fix;
- sorted repository paths and optional symbols;
- sorted immutable evidence references;
- plugin-proved scope and change relation;
- verified evidence strength; and
- optional root-cause and Simplification semantic content.

Line hints are not included. Moving unchanged code does not change identity.
Changing the semantic claim, fix, repository base, evidence, symbol, scope, or
change relation does. Semantic clustering remains deferred to Phase 6.

The base object ID is intentionally the repository-lineage namespace. Forks and
mirrors with identical Git history share finding identities because they contain
the same reviewed code lineage. This avoids mutable remote URLs and clone-local
paths. A later cross-project ledger may add a deployment namespace outside this
content identity if product needs require it.

### D-ER4-018: Repairability is bounded by frozen scope

A confirmed proposal is marked repairable only when deterministic preflight
proved it inside the frozen scope and it has at least one reviewed source
location. The reducer still applies priority, category, change-relation, evidence,
and profile policy before any repair request can exist.

Point 6 still retains the temporary policy-mapping marker for confirmed and
uncertain verdicts. This lets the new findings be certified and tested without
allowing `request_fix` before point 7 activates every verifier mode.

The first Terra/high review found that two confirmed proposals differing only by
line hint produce the same stable fingerprint but were both returned. The finding
was accepted. Verified findings now collapse by fingerprint before reduction.
The same review proposed a separate host-repository namespace; that finding was
rejected because the frozen base object is deliberately a content-lineage
namespace shared by exact forks and mirrors.

The rerun found that two locations differing only by line hint became duplicate
normalized path/symbol entries and could still change the hash. The finding was
accepted. Fingerprint arrays are now canonical sets: projection happens first,
then exact normalized duplicates are removed and the remainder is sorted.

The next rerun found that the new finding argument displaced the existing
optional orchestrator wait in an exported positional function. The finding was
accepted. The wait keeps its established position and verified findings append
after it, so wait-aware callers remain compatible.

The next rerun found that an exported caller could pass structurally valid but
forged `verified: true` findings. The finding was accepted. The builder now
certifies its frozen result array with a private runtime identity. The reduction
boundary accepts confirmed findings only from that certified array and adds an
integrity failure if confirmed reconciliation lacks it.

Later Terra/high reruns tested the complete provenance chain. They found that
private array ownership alone did not bind the array to the exact preflight,
snapshot, reconciliation, or policy. Each finding was accepted. Runtime-private
proofs now bind these exact object identities in order:

1. the resolver-owned policy;
2. the snapshot-owned frozen bundle;
3. the deterministic preflight;
4. the snapshot- and policy-bound reconciliation; and
5. the verified finding array.

Copies, forged objects, values from another policy, and values from another
review attempt fail this chain. Tests cover copied preflight, copied
reconciliation, copied finding arrays, moved line hints, and changed snapshots.

Terra also found that repairability used the allowed scope but did not state the
reviewed-source condition at the finding boundary. The finding was accepted.
Repairability now requires at least one location that exists in the frozen
review context. Deterministic preflight has already proved that each retained
location and line hint belongs to that context and its change proof.

The final Point 6 Terra/high review reported no actionable findings. The focused
test suite, TypeScript build, and whitespace check passed.

## Point 7 — verifier modes and uncertainty policy

### D-ER4-019: Every verifier mode controls live eligibility

Deterministic preflight is the only eligibility authority:

- `disabled` sends no proposal to semantic verification;
- `p0-only` sends only policy-eligible P0 proposals; and
- `all-blockers` sends every proposal whose priority and category are configured
  as blocking.

Tests execute all three branches. Echo cannot change the selected mode or add an
ineligible proposal to the verifier request.

### D-ER4-020: Uncertainty is a policy result, never a repair result

A private, certified verdict-policy map separates five lists: confirmed,
rejected, ignored-insufficient, follow-up, and orchestrator-required. The map is
bound to the exact reconciliation and resolver-owned policy.

An explicit rejection has no blocking effect. `insufficient_evidence` follows
the configured action:

- `reject` removes it from the active result;
- `follow_up` records a bounded non-blocking follow-up count; and
- `orchestrator_required` asks the review orchestrator for a decision.

None of these uncertainty paths can produce `request_fix`. Only a certified
confirmed finding can do that.

The first Terra/high review found that the initial policy map still ended in one
generic integrity block. The finding was accepted. The certified lists now enter
reduction as distinct values and drive distinct live results. Stage tests prove
confirmation, rejection, all three uncertainty actions, and transport failure.

The final Point 7 Terra/high review reported no actionable findings. The focused
suite, TypeScript build, and whitespace check passed.

## Point 8 — canonical reducer integration

### D-ER4-021: Certified state is the only reducer input

The Phase 2 placeholder is removed. The verification boundary now certifies one
reduction value containing deterministic integrity facts, unresolved
requirements, limit failures, confirmed findings, uncertainty routes, and an
optional verifier evaluation record. Raw Echo and verifier JSON never enters the
pure reducer.

Outcome precedence is fixed:

1. invalid or incomplete state is `blocked`;
2. unresolved requirements follow their policy;
3. limits and verifier uncertainty may require orchestration;
4. confirmed unrepairable blockers require orchestration;
5. confirmed in-scope repairable blockers produce `request_fix`; and
6. a clean state is `passed`.

An Echo `violated` requirement is represented by its proposed findings. An Echo
`unverified` requirement remains unresolved. Reporting a violation without any
proposal is an integrity error. This lets an explicit verifier rejection remove
the proposal's blocking effect without converting rejection into verifier
failure.

### D-ER4-022: Gate uncertainty requires orchestration

The approved Phase 4 plan is authoritative. The built-in `gate` profile routes
`insufficient_evidence` to `orchestrator_required`. `lean` and `audit` retain it
as a non-blocking follow-up. No uncertainty path can request repair.

### D-ER4-023: Evaluation records verifier execution facts

When a verifier call completes, canonical evaluation facts include protocol,
attempt identity, selected mode, eligible count, and confirmed, rejected, and
insufficient counts. Count validation requires the three verdict classes to sum
to the eligible count. Latency, token, model, and cost evaluation remain deferred
to ClawDeck.

Point 8 tests cover reducer precedence and every required live outcome. The
Terra/high review reported no actionable findings. The focused suite, TypeScript
build, and whitespace check passed.

## Point 9 — hardening and closeout

The Phase 4 path was split into small deterministic units for proposal proof,
semantic flow, response reconciliation, verdict policy, finding identity, and
reduction preparation. This keeps the normal path direct and avoids a second
plugin, service, queue, store, or lifecycle result.

Focused ESLint found structural size and complexity debt in the changed Phase 4
files. The finding was accepted. Semantic verification was extracted from the
stage, and large proof and reduction functions were split by authority. Behavior
tests passed before and after the refactor. The focused Phase 4 ESLint set is
clean.

The local Terra/high review of the hardening refactor found no actionable issue.
Repository verification passed:

- review plugin tests, schemas, TypeScript, live capability, and package boundary;
- all 40 skill TypeScript configurations and 400 source files;
- Knip and generated configuration;
- plugin SDK, builds, sandbox, contracts, registry, lifecycle, isolation, and
  capability security through the known external Buster fixture boundary;
- generated plugin inventory and documentation checks; and
- whitespace checks.

The broader plugin-system wrapper stopped at the pre-existing Buster live fixture,
which returned `ERROR` where that unrelated test expects `PASS`. Phase 4 review
checks completed before that boundary. The full E2E matrix was not run.

The final Phase 4 branch review uses `gpt-5.6-terra`, high reasoning, and
`/app/node_modules/@openai/codex/bin/codex.js`. Its result is recorded below after
the final audit.

The first full-branch review found that proposal-limit suppression skipped the
verifier call but still created a missing-response integrity failure. The finding
was accepted. Preflight now marks line proof as unnecessary after the proposal
limit is already exceeded, and semantic flow skips reconciliation when integrity
or limit state suppresses dispatch. The reducer can therefore return the intended
`orchestrator_required` limit result. A live stage regression proves that no
changed-line or verifier call occurs on this path.

The second full-branch review found that malformed completed verifier output
still tried to emit complete-verdict counts. Count certification then threw and
made the response look like a retryable runtime failure. The finding was
accepted. Evaluation facts are now omitted when reconciliation has integrity
issues, so the certified reducer returns `blocked`. A live regression proves
that a malformed completed response is blocked while a transport exception still
propagates to core.

The same review found that the selected verifier mode was present in certified
state but absent from emitted evaluation facts. The finding was accepted.
`review.verifier_mode` now records `disabled`, `p0-only`, or `all-blockers` for
completed verifier evaluations.

The third full-branch review found that the exported verification boundary
accepted caller-shaped preflight and reconciliation objects. The normal stage
path supplied certified objects, but another caller could suppress an eligible
proposal before reduction. The finding was accepted. The boundary now checks
private provenance against the exact bundle snapshot, policy, and proposal
preflight before it reads derived state. Adversarial tests cover forged preflight
and forged reconciliation objects. Both cases fail closed. The focused
Terra/high review of this fix reported no actionable findings.

The next full-branch review suggested that `p0-only` should also test whether
P0 is present in the configured blocker priorities. This finding was rejected.
All resolver-owned policies must contain P0. The policy parser rejects a policy
that omits it, and resolver and schema-parity tests cover that fixed safety
rule. Therefore, no valid resolved policy can create the reported state. The
existing branch is the direct expression of `p0-only` and does not add a
redundant check for an impossible policy value.

The following full-branch review found that the new reconciliation provenance
guard also ran when proposal limits had intentionally suppressed verifier
dispatch. This changed the intended orchestration result into an integrity
block. The finding was accepted. Reconciliation is now required only for a
certified preflight that has eligible proposals and has no integrity or limit
failure. Limit suppression remains certified and routes to the orchestrator.
The complete review suite and a focused Terra/high review passed after the fix.

The final full-branch Terra/high review reported no actionable findings. It
confirmed certified provenance, fail-closed malformed-response handling, core
retry authority for transport failures, and uncertainty routing that cannot
start repair.

# Nova module membership and persistence seam — bounded C0 proposal

**Unaccepted, incomplete definition proposal. No C1/C5 implementation.** Read with
[the source constraints](NOVA-MODULE-BINDING-CONSTRAINTS-20261013.md). This document
narrows membership and first-acceptance persistence; it does not supply unresolved
owner-domain, payload/quota, external profile or grant contracts.

## Membership must come from the real producer

| Current producer | Exact stage membership | Proposed acceptance unit |
|---|---|---|
| `project/compiler.ts::moduleStages` | `implement-${module.id}`, `lint-${module.id}`, optional `review-${module.id}`, `test-${module.id}`; lint/review/test `request_fix` targets that same implementation | One implementation module, including technical retries, category repairs, rechecks and original cleanup |
| `project/source.ts::sourceStages` | `source-preflight`, optional `architecture-review` and `architecture-approval`, `blueprint-sync` | Run-foundation admission group, not permission to reselect graph/architecture foundations mid-run |
| `project/coverage.ts::cumulativeStages` | `final-lint`, optional `final-review`, `final-test`, `project-summary` | Separate integrated final group; references original completed module evidence, cannot rebind those modules |
| `project/demo.ts::demoStages` | Optional `demo-candidate`, `demo-delivery`, `demo-ready` | Separate delivery group, retaining the original final-test fixture/credential/exposure dependency closure |
| Explicit `pipeline-definition.v2` graph | Arbitrary registered stage IDs/types and remediation links | Requires authored/validated exact membership; stage-name prefixes never constitute membership |

The project compiler currently returns only a `pipeline-definition.v2` graph,
not this membership declaration. A future compiler-generated immutable record
must enumerate actual stage IDs, remediation links, group kind and task-intent
digest, and validate every executable stage against exactly one group. A graph
with cross-group remediation must either supply an explicit compatible original
relationship or reject before activation; it cannot infer ownership from a name.
Run-scoped adapters remain R-scoped even when observing M-scoped stages. Standalone
Prism and Buster units require their separately defined order/plan memberships.

## Exact existing persistence constraints

The current run event carrier is `<runRoot>/events.jsonl`, constructed by
`engine-run.ts` and passed to `PipelineRunner`. `FileJournal.transact` takes an
append mutex, refreshes committed records and fsyncs each appended JSON line.
It is **synchronous exclusion, not a rollback transaction**. If a callback appends
one record then throws, that record persists. An unterminated tail is truncated
on reopening; complete records are hash-verified by the existing hash-journal
parser. Escaped append callbacks reject after transaction closure.

[The real local reader/writer check](check-nova-journal-binding-seam.mjs) exercised
seven narrow controls, with [raw output](nova-journal-binding-seam-attempt1-20261013.log).
Two journal objects refreshed/deduplicated one specimen, but this is not a
multi-process contention or process-kill proof. The specimen is deliberately not
a current SDK lifecycle event. No new event is accepted by current production.

## Proposed generated carrier and order

Propose one versioned `module.binding.accepted` entry in the **existing run event
journal**, using an explicitly evolved SDK event contract rather than a second
editable config index or a side-channel observer event. Its required typed
content is: run ID, exact group ID/kind, membership digest, run-foundation digest,
immutable selected generation/owner-instance-profile identities, field
applicability-map identity, effective consumer-profile closure, delivery/code/role
identities, original grant/secret-reference/store/quota identities, original
budget-ledger references, fixed-Eval mode/identity, canonical encoding identity
and digest of the complete unsigned binding. No secret values are included.

This field list is a **proposed required contract**, not a permissive schema and
not a claim that referenced manifests currently exist. Exact external references,
payload shape/bounds and schema producer/readers must be resolved before acceptance.
The current graph captures full copied stage config/execution/input; its existing
v2/v3/v4 snapshots must not be silently reinterpreted as task-only graphs. A new
snapshot/graph representation requires reviewed task/operator partition maps,
versioned codec and legacy dispatch before selecting a version number.

Proposed first acceptance uses the existing run-mutation exclusion and the
journal's synchronous `transact(records, append)`. Original-first lookup applies
to **every invocation**, not only a function labelled recovery:

1. From the authenticated original run locator, resolve its existing original
   snapshot, membership/history and group binding under original run authority
   **before selecting, parsing or validating current publication B**, and before
   package activation. The locator/store authority cannot be supplied by B.
   If A exists, validate and use A plus its original dependency closure without
   reading B. Missing, malformed or incompatible B cannot block valid retained A.
   Conflicting original task/membership/history rejects; missing closure after prior
   business action or uncertain history requires reconciliation, never selection B.
2. Only for a genuinely unstarted group with no original binding/action, resolve
   an immutable candidate from the sole system entry. Parse and validate its body
   outside the synchronous journal callback, retaining run ownership and honoring
   the original lease AbortSignal around async preparation. No business/package
   activation/observer action is allowed merely because B parsed successfully.
3. Validate exact membership, original run foundations, retained R/S/H dependencies,
   role/grant/secret references, physical delivery and budget/store compatibility.
   Prepare the immutable binding body and its accounted references. The exact
   metadata/store accounting contract remains an explicit open input.
4. Recheck ownership/abort and original history inside synchronized acceptance.
   An existing original binding wins; never overwrite it with the prepared candidate.
   Otherwise derive the final versioned SDK envelope's inner sequence from the
   synchronized committed journal position, validate its final encoding and whole
   accounted byte size (including required record overhead), then append **one
   complete** binding record. No partial binding/two-record commit, no `await` in
   callback, and no assumptions that transact runtime-rejects a Promise return.
5. Ensure the carrier's original retention and first-file publication durability
   prerequisite before observer/business delivery. Current file fsync alone does
   not fsync the directory when events.jsonl is first created; the proposed target
   must fsync that publication directory or establish the already durable existing
   carrier. No current local test claims power-loss/storage proof.
6. Publish/checkpoint the original binding view under original R observer policy,
   then permit the first stage transition, executor/effect **or skip notification**.
   Required delivery failure preserves the accepted binding and blocks dispatch;
   optional/degraded behavior must follow explicit original policy with recorded
   outcomes, not a discarded flush summary or a silent fallback. A crash after
   binding but before `stage.started` retains A and replays its view idempotently.
7. All retries/repairs/waits/cleanup resolve original A through step 1, retaining
   claims, budgets and uncertain effects. Ownership loss aborts before append/view/
   activation/effects; it never authorizes stealing a live owner based only on TTL.

Ordinary next-module publication can change only validated M-applicable values.
Started A remains A; a genuinely unstarted second group may accept B. Final/demo
groups retain original resource dependencies and cannot use their later start to
replace grants or fixture provenance. Fixed Eval resolves the recorded explicit
generation. Counters/claims/deadlines/uncertain effects and historical task intent
are preserved, not recreated from the selected profile.

## Still open, not waived by this proposal

- Exact strict schema, canonical member/effective-profile partition and compatible
  snapshot evolution, including explicit arbitrary-graph memberships.
- Complete per-owner scope maps and real immutable manifest materialization,
  metadata/store/physical accounting, authentic grants and external profile data.
- Compatibility before `prepareRuntime` activation, original recovery lookup and
  administrative-version transitions at all actual run/resume/repair paths.
- Concrete executable future cases with complete profiles, hashes and commands for
  concurrency, process-kill windows, stage skips, malformed history, fixed Eval,
  next-module B, incompatible R/H and original cleanup across every reader.
- Independent definition review and ultimately whole C0 acceptance. Seven current
  journal controls do not satisfy those future cases or global F-BIND.

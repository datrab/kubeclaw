# CONFIG C0 — current working definition

Status: **C0 in progress; not accepted; C1–C6 not approved.** This document
supersedes neither historical evidence nor the authorization boundary in
[OPENCLAW-CONFIG-GOAL.md](OPENCLAW-CONFIG-GOAL.md). D17–D22 apply. Nothing in
this branch implements CONFIG, changes tests, deploys, or closes a finding.

## Source and delivery identity

Source baseline: `9452d35524192f8665bc87254b3c63a361e7bd4a`, tree
`89fa8e4d683cf442deb189d60ce8b7cc1ff05327`, obtained after fetching/pulling the
repository and checking out the current CONFIG handoff into an isolated worktree.
Work branch: `codex/config-c0-semantic-inventory-20261012`.
The PR must target `codex/cloud-config-handoff-20261012`: targeting `main`
would include substantial pre-existing unrelated implementation/history. That
history is source input, not new work authorized by this C0 task.

The whole tracked tree is enumerated in
[source-boundary.json](../evidence/config-acceptance/author/source-boundary.json).
Candidate markers in the adjacent ledger are discovery obligations, **not
semantic settings or acceptance**. Current code, build-time tests, examples,
generated release copies, documentation and historical evidence have distinct
boundaries. Test files copied into real images must remain in delivery closure;
their path alone does not establish they are nonproductive.
Fragments under `components/`, `runtime/` and `delivery/` are incremental author
inputs. A schema-location row with an unresolved consumer is explicitly open.
Complete acceptance requires source dispositions, field contracts and a fresh
independent reviewer, not counts or successful integrity checks alone.

The WorkerCore residual fragment is now included in consolidation separately
from its original component checkpoint. Refined consumer witnesses are retained
alongside original cases; `pending` author review markers normalize to no reviewer
confirmation. Actual complete-profile definition checks are recorded as C0
observations, never converted into C1 behavioral acceptance.

## Confirmed goals versus proposed mechanisms

Confirmed: evolve existing `swarm.config.json` to **`pipeline.config.json`**;
`pipeline.json` and `--pipeline` remain project/workflow graph inputs. One
editable author per setting/active owner/registration/instance/profile. No code,
schema, ENV, CLI, Chart or entrypoint may supply missing migrated operator values.
Migrate existing Swarm architecture rather than invent a second system index.
No D18 worker refactor, paid Eval, host intervention or test reclassification.

Proposed author root: repo `config/`, separated from Helm/Docker projections.
This is justified only together with real packaging migration: Helm `.Files.Get`
cannot read outside its packaged chart; `.dockerignore` and image change filters
must include the selected immutable generation. Retaining current chart-root
authors is technically possible, but obscures non-Chart component ownership and
still requires profile materialization. The proposal chooses one root and one
materializer, not two synchronized editable copies. Existing owner names remain
unless a specific consumer contract requires a change.

`config/pipeline.config.json` owns composition and selected profile references,
not component setting values. Complete owner profiles live in service/engine/core
files, plugin profiles by actual manifest identity and registration/instance.
Agent profiles refer to supported provider/model/prompt resources. Shared
endpoints/identity/storage grants belong to explicit deployment/runtime owners;
consumer quotas and task parameters are not silently shared by matching names.
Versions stay in the established version authority; external secret bytes are
never included in inventory, explanation, snapshots or normal author files.

## Activation and instance contracts

- **S, service/process**: ports, transport roots, trust, storage, concurrency
  pools and endpoints activate by validated startup/drain/restart. A running
  server is not changed by a stage profile refresh.
- **R, run**: graph, module membership, grants, provider ABI, issuer, recovery
  foundations, total budget ceilings and mode are immutable for that run.
- **M, module**: only eligible tuning/agent/model/prompt/quality profile fields
  select a new generation before the next unbound module, within R constraints.
  Implementation, repairs and all associated lint/review/test attempts share it.
- **J, operation/plan**: standalone Prism order or Buster plan binds before
  admission/dispatch; children inherit it rather than independently reading Latest.
- **V, nonsetting**: protocol/version/generated binding/task data retains its
  actual owner and reason. A literal is not exempt just because it is convenient.

S/R/J/M is assigned per field after tracing its consumer. Fixed Eval selects one
complete generation for all units; a scenario/dataset/scorer is task input, not
permission to alter grants or reset budgets. No generic Evalrunner is claimed.
Instance selection is by owner + registration + stable instance ID + explicit
complete profile; existence of a profile does not activate a plugin or grant it
capabilities. No implicit first profile, ENV override, missing-value coercion,
fallback model or automatic old-filename lookup. An explicitly configured model
fallback list is policy; actual selected model must be recorded and supported by
the real adapter, not assumed from a profile label.

### Current dispatch codec versus target policy

The current SDK `RuntimeDispatchProfile` is exactly
`{schemaVersion: 'runtime-dispatch-profile.v1', encoding: 'json-utf16-v1'}`;
`parseRuntimeDispatchProfile` compares canonical bytes. It is codec/control
metadata, not an actual target/model/budget selector or a CONFIG-generation
binding. At `openclaw-adapter.activate`, `targetsFrom(context.config)` captures
the configured target map; `createDispatchAdapter.invoke` selects its actual
target by `request.resource.canonicalId`, or rejects `RUNTIME_TARGET_DENIED`.
Reviewer model/runtime/agent/thinking assertions and cache identity must not be
described as dispatch selection merely because their names resemble settings.

The proposed M binding must carry the actual complete supported target policy
within unchanged R grants/canonical identity and persist it before dispatch.
The existing two-field SDK codec cannot be repurposed as that closure or silently
extended with model/generation fields. This corrects earlier working-evidence
wording, which is retained separately as superseded history; no implementation
or current durable M-selection mechanism is claimed.

## Actual module and recovery source paths

`skills/nova/project/compiler.ts::moduleStages` creates `implement-<module.id>`,
`lint-<module.id>`, optional `review-<module.id>` and `test-<module.id>`;
request-fix routes return to implementation. `source.ts`, `coverage.ts` and
`demo.ts` generate source/architecture, cumulative integration and handoff stages.
Current `module.id` is input identity, not a universal runtime config binding.
Free graphs therefore need explicit versioned stage-membership metadata; do not
guess modules from stage names or reload separately for each stage/HTTP request.

`engine-run.ts::runNewPipeline` prepares runtime, enters `withRunMutationLock`,
writes `run-snapshot.v4`, then calls `executePrepared`. `engine-snapshots.ts`
publishes by exclusive temp write, file fsync, no-replace hardlink and directory
fsync. `executePrepared` verifies graph and checks uncertain effects before
starting adapters and runner. Recovery verifies the stored package set/digests
and the captured registry configuration (not every PlatformConfig field), recovers lifecycle state and reconciles durable
observability. These existing checks must not simply be removed for dynamic config.

`stage-executor.ts` passes `definition.config`, creates a lease and appends
`attempt.created` / `attempt.dispatched` before plugin invocation. Its current
attempt record contains retry/remediation usage and lease identity but no
separate module generation closure. `state/journal.ts::FileJournal` provides
mutex-serialized, hash-chained fsync append/transact and rejects rewind/drift.
This is synchronous exclusion, not multi-record rollback: a record appended
before a callback throws remains committed. Fully validate before the one binding
append; never await inside its callback. Seven
[actual local persistence controls](../evidence/config-acceptance/author/nova-journal-binding-seam-identities-20261013.json)
confirm these narrow current semantics, not future module binding.
Its append-lock timeout is itself a current hardcoded policy candidate.

### Proposed durable pre-dispatch transition (C5, not implemented)

1. Pin R contract at new-run creation: graph/module/repair membership, grants,
   ceilings, effect identity, code/packages and live-module versus fixed mode.
2. Under the existing run mutation/transaction boundary, look up the unique
   logical `(runId,moduleId)` or standalone operation key. Existing binding must
   recover its original closure; never supplement it from current author files.
3. If unbound, select a complete validated generation once. Validate M eligibility
   against R; persist immutable content-addressed owner/profile/prompt objects and
   their complete file set, identities and secret revision references durably.
4. Append/fsync the versioned binding before attempt/dispatch. Include generation,
   effective profile/instance mapping, input and original runpolicy/claim/deadline
   references. The binding introduces no independent budget counters.
5. Dispatch from that closure. Technical retry, repair, wait/resume, cancellation,
   result reconciliation and cleanup inherit it with existing consumed budgets,
   cooldowns, deadlines and uncertain-effect states.

Crash before step 4 permits selection without an effect; crash after binding but
before dispatch recovers the same binding; crash after dispatch reconciles the
real effect before repeating. Concurrent starts and publication linearize to a
complete A or B, never mixed files. Started A remains A; eligible unbound module
may use B; fixed Eval remains A. Invalid B fails before publication/dispatch, no
silent fallback. Historical versioned runs drain/recover with original supported
contracts; missing historic closure is a concrete rejection, not Latest.

Secretstore revision identity is an external unresolved input. Existing
unversioned ENV resolver cannot prove fixed secret revision recovery. A retired
or revoked ref blocks its consumer explicitly; no substitution with latest.
External installed-plugin roster, actual deployed Nova profile, operator host
capacity and other-session approved test standard remain separately requested
inputs at their affected later boundaries; none excuses skipping repo-based C0.

### Prism external-agent boundary

`claimAgentJob` creates the V2 launcher envelope inside the database claim
transaction and persists it before external action. `AgentJobRunner` executes
that stored envelope; its later `agentAttempt` call recomputes only the installed
local launcher profile for compatibility. It must not reload accepted limits.
The native deterministic Prism V3 engine and this external CLI launcher have
different profile/resource contracts. Launcher CPU, memory and process-tree
observations are explicitly unavailable, with unrequested budgets; no complete
remote gateway accounting is established by local process closure.

Current launcher timeout is fixed at 900000 ms in the envelope and separately
900 seconds in CLI arguments. The target CLI argument is a validated projection
of the same authoritative policy, not a second editable timeout. Claim lifetime
is currently 16 minutes in SQL; termination grace is separately 1000 ms. Their
coupled supported domains and exact proposed implementation harness remain open.
Expired/uncertain running jobs require NeedsNova reconciliation and are never
requeued as accepted work. The actual no-dispatch
[definition check](../evidence/config-acceptance/author/check-agent-definition.mjs)
records current V2 validation, profile/attempt digests, explicit unavailable
measurements and missing-budget/wrong-unit rejection. It proves neither alternate
profile behavior nor authoritative external success.

### Buster source-cleanup module

The [preparation/cleanup definition](../evidence/config-acceptance/components/preparation-cleanup-binding-definition.md)
specifies one cleanup module per original preparation effect. Its first eligible
unbound admission may select B (fixed Eval retains A); the fsynced cleanup
association then pins the complete generation and projection. A cleanup retry
receives a fresh claim/attempt under that same module generation, preserving the
original failed result/effect and predecessor history. It does not renew the
original claim or reset run budgets. `workerAttemptSpecDigest` excludes the claim;
full-envelope identity and separate claim/result validators must remain intact.

Current preparation quotas of one log byte, one evidence byte and one evidence
file are dormant operator ceilings, not protocol constants: all three productive
hosts explicitly disable log retention, emit no evidence and have no collection
hooks. Their target authors preserve selected values; empty output under two
different quotas cannot prove F-EFFECT. The current phase allowance of eight is
operator headroom; the proposed relation derives from actual completion hooks and
native timer validation, not an arbitrary bound. Four sole Buster policy rows and
14 actual definition observations are retained separately from future C3/C5 cases.
The existing chain can accept a valid but changed association setting without
proving generation-projection equality; rejecting this before command construction
is an explicit proposed C5 obligation, not a current-code acceptance claim.

### Historical Core domain-preservation proposal

The [Core domain evidence](../evidence/config-acceptance/components/core-policy-domains.md)
defines twelve proposed required numeric fields at their existing values and
the already-supported per-instance retention boolean. The numeric const-only
proposal removes no operator-author obligation and proves no wider tunability.
Historical alternate numeric profiles are explicitly unsupported under that
preserving proposal; their original EFFECT case IDs remain retained and unpassed.
Whether that proposal satisfies the full configurable-behavior requirement is
still a C0 definition/review question, not an author waiver of F-EFFECT or permission
to relabel operator policies as protocol constants. Actual local source/definition
checks cover parser/FD/state/journal boundaries; genuine emitter/kernel and
approved config-projection behavior remain separate cases.

The [fresh independent Core challenge](independent-config-c0-core-domain-a07de567.md)
initially rejected that bounded definition: ICD-001 required actual justified
tunability or an independently valid invariant reason; preservation alone does
not close D17/D20/F-EFFECT. ICD-002 requires unambiguous active versus historical
case dispositions and exact proposed commands. ICD-003 identifies additional
registration/health/trust/progress/log/cancellation schema coordinates;
ICD-004 requires all six actual retention instance projections, including the
Prism agent. Its safe reproductions passed only source/definition checks. These
findings remain open for author correction and independent recheck; no scope
reduction or new user approval is inferred.

The reviewer's append-only erratum corrects its arithmetic to **75**, not 85,
without changing the six-root field set: 55 registration/health/progress/log
coordinates have productive callers; 20 trust/cancellation coordinates are
exported contract/test surfaces without a discovered repository service caller.
Those helpers are distinct from productive SPIFFE peer authorization and local
abort mechanisms. The original review and raw identity snapshot remain preserved;
this count/reachability correction does not accept the author's pending fixes.

### Current bounded Core corrective review

The [final independent recheck](independent-config-c0-core-final-recheck-40cf24e7.md)
verifies the subsequent proposed adjustable domains, exact 640-coordinate set,
six retention caller mappings and original-case conservation. All 148 component
refinements now have one canonical current action/oracle/invocation/lifecycle;
their previous generic text is preserved as historical. RCORE-001/002 are corrected.
The twelve numeric policies have bounded reductions or justified discrete choices,
not const-only target tuning. Complete six-owner A/B definitions and retention
choices are specified; they are not implemented config delivery or runtime PASS.

This bounded corrective finding disposition does not close unrelated source,
candidate, runtime/delivery/plugin/agent inventory or global C0 review. The original
reports and failed evidence remain unchanged. Future binding serialization must
include its complete header before applying selected journal quota projections;
current shape-only definition controls cannot satisfy that future obligation.

## C1 proposal boundaries — not yet ready for approval

The intended first slice preserves all existing six component effective values
and the complete Buster runtime variant, keeps no-follow/hash/freeze and startup
contracts, and consolidates profile authors. Current runtime variant differs from
base in the Kubernetes fixture secret allowlist; it is whole-document selection,
not keywise overlay. Select full same-owner profiles and reject competing inputs
even if equal-valued. Frozen current required case set remains unchanged.

Author → validated materializer → immutable bundle → both real Helm packages /
Buster image / role-bundle closure → normal loaders and service consumers is one
delivery generation. Migrate actual `.dockerignore`, Docker-specific contexts,
runtime-input filters, release configuration guards, image verification and role
packaging together. A config-only change must trigger its actual delivery route.
The runtime locator is transport, not a settings override. Runtime wire/schema
name migration must be decided from all actual callers; no second editable entry.

Exact package and per-setting cases will be completed in
`config-acceptance-matrix.json` after semantic field closure. Cases for C1–C6
remain `not-run` until approval/implementation. Required behavior includes two
complete materially different profiles at each distinct real consumer, missing /
type / unit / relation / unknown / competing-author / escaping-reference
rejections with same-boundary positive controls, real Chart/image/filter/release
closure, atomic A/B, startup freeze, isolated semantic mutants and F-CODE/F-DOC.
Existing four Helm diagnostic-assertion failures are preserved and assigned to
the eventual approved test correction, not silently weakened during C0.

## Additional Prism control policies — source traced, not closed

The author fragment now distinguishes sixteen further current policies: session
expiry/default roles, HTTP and decoded-artifact admission, query defaults/caps,
candidate oversampling and RRF damping, acquisition/cleanup deadlines, HMAC skew
and nonce cleanup batch. Requested query values remain task data; their omitted
defaults and service capacity/ranking limits are separate policies. HTTP clamps
and the exported corpus-search defaults are not identical validators: the route
does not reject NaN/fractional numeric inputs. No target safe domain is inferred
from these clamps, and no DB ranking/replay behavior has been executed.

Session expiry and both cookie Max-Age copies must have one authoritative lifetime
with explicit milliseconds-to-seconds projection. The current editor role default
is signed token metadata, not a demonstrated permission grant: tracked Prism role
predicates do not consume it; product access reads its separate user allowlist.
Three current exported controls round-trip editor, empty and numeric-member arrays,
exposing the current array-only check. Numeric members are not an approved target
domain. Exact metadata consumers/domain remain open; do not invent role grants.
The worker HMAC window and nonce maintenance belong to worker authentication,
not an additional control-service author. Original acquisitions/cleanup and nonce
history must retain their accepted closure; current policy cannot fill recovery.

[Six current source-definition controls](../evidence/config-acceptance/author/prism-control-definition.log)
exercise actual session exports and genuine loopback IncomingMessages at the
unchanged parser. Exact two-million-byte JSON is accepted; one extra byte and
wrong media type reject; session expiry and wrong signing key reject. This is not
a migrated config loader, complete service profile, cookie/DB projection, deployed
API, replay storage or future runtime-binding proof. All sixteen future field
cases remain explicitly incomplete/not-run pending supported adjustable domains,
complete generations, real harnesses and independent review.

## Prism design cardinality and image provenance — proposed, unaccepted

The source guard is POST `/v1/agent/design-sets`, not `/v1/design-rounds`.
Current HTTP, repository and advertised tool schema require exactly three designs;
prompt and Studio completion/reject-all logic copy that policy. The separate
pairwise diversity threshold/weights are not aliases of the count. Count three
is a business workflow choice with generated schema/prompt/UI copies, not an
immutable protocol identity merely because the current copies agree.

The [cardinality proposal](../evidence/config-acceptance/author/prism-design-cardinality-proposal.json)
describes a new required selected count domain of 2/3 in the existing Control
owner, with complete current six-owner-plus-count-extension A/B documents. These
are a **bounded proposal**, not complete profiles for every remaining target field
or currently accepted loader/API inputs. The original three-design A obligations
remain intact; a new explicitly two-design B task cannot partially complete an
accepted three-design task. Independent business-domain/A6 review remains open.
The captured R tool domain must permit the accepted M/J count; old exact-three
registrations cannot silently execute two. Persist the typed count/config/intent
binding in the **first design-round transaction**, before its start digest and
before the later agent-job transaction. The retained round owns subsequent
job/prompt/result/client projections. Validate original job/fence/round binding
before document effects. Every client completion/removal path, including initial
document loading and direct `completeRound`, uses the original count and digest.
Missing old closure rejects/reconciles rather than filling count from latest.

The [current image-binding controls](../evidence/config-acceptance/author/prism-image-binding-current-bce3f075.log)
show production missing/malformed digest rejection and actual profile hashing of
opaque valid A/B digest inputs. Chart `images.worker.digest` is an OCI image digest,
not established package/code-tree content. The nonproduction fallback hashes a
synthetic development descriptor. It is not authentic installed content or a
replacement for missing production/recovery binding. Four import/hash controls
and five unchanged diversity/tool-definition tests prove neither live SDK/model,
two-design service execution, actual images nor deployed code provenance.

The [independent bounded Prism report](independent-config-c0-prism-handoff-bce3f075-20261013.md)
withheld target-definition completeness for PPRISM001–003. The proposed
[corrected handoff contract](../evidence/config-acceptance/author/PRISM-HANDOFF-TARGET-20261013.md)
now describes the first round binding, a restrictive new structured two-design
task form (legacy/free-form/exact-three tasks cannot select two), and separate
OCI/code/installed-manifest/config/role/grant provenance. Its
[machine-readable inputs](../evidence/config-acceptance/author/prism-handoff-target-contracts-20261013.json)
contain bounded complete A/B documents and 37 future cases, all not-run. Fifteen
schema/hash controls validate documentation specimens, not task eligibility,
real grants or installed bytes. The [first recheck](independent-config-c0-prism-handoff-recheck-bce3f075-20261013.md)
verified the earlier corrections but found PPRISM004/005 temporal-boundary gaps.
The proposed order now requires trusted immutable runtime verification before
unverified Node/engine imports and first new input materialization, plus pure input
identity/reservation/replay-before-write and original spool accounting. New temporal
specifications were [independently rechecked](independent-config-c0-prism-temporal-recheck-bce3f075-20261013.md):
no remaining scoped temporal contradiction, conditional on the mandatory separate
actual store quota/grant definition, which remains open. No capacity or
corpus/envelope/output limit is fabricated; this is not full C0 acceptance.
The corrected current source trace proves only fresh-supervisor profile equality
when `!recovered`; the dedicated host has no installed-profile equality guard.
No target guard or C1–C6 implementation has been added.

## Infrastructure coordinate discovery and immutable observations

The independent Delivery source review found twenty infrastructure files absent
from its subroster. All twenty exact source hashes already match the global
source boundary. The additive [coordinate ledger](../evidence/config-acceptance/author/infra-coordinate-extension-20261013.json)
preserves the original lexical candidate IDs and indexes 701 field coordinates,
not 701 operator settings. None is independently accepted. Twelve image leaves
have concrete current writer traces to `versions.json`; they must not acquire a
second editable infrastructure author. LiteLLM config is snapshotted into the
generated ConfigMap and rollout checksum by the current renderer, which does not
validate that external application's field schema. Exact external readers,
reachability, domains, bindings and cases remain open under DLS-002/004.
Syntax-only mapping additionally identifies 38 current Kubernetes-shaped resource
documents and 76 API/kind discriminator candidates; it does not validate their
pinned API/CRD schemas or turn them into editable operator settings. All 701
coordinate dispositions still require independent semantic review.

The coordinate gate's five [controls](../evidence/config-acceptance/author/coordinate-extension-controls-20261013.json)
reject duplicate IDs and source drift and require all 701 unresolved dispositions
and independent reviews in strict mode. These are documentation-integrity checks,
not runtime mutation evidence. Separately, all 775 normalized immutable runtime
observation references reconstruct their original canonical value hashes; the
twelve [reference controls](../evidence/config-acceptance/author/observation-reference-controls-20261013.json)
also check damaged hashes, pointers and escaping boundaries. References stay
compact in the published matrix; no historical observation bytes are discarded.

## Acceptance state

The [fresh Core source/question review](../evidence/config-acceptance/independent-core-source-question-bce3f075-20261013/README.md)
withheld acceptance for six specific ICQ findings. A separate
[material correction batch](../evidence/config-acceptance/components/icq-corrections-20261013/README.md)
preserves all historical inputs and protected Core13 definitions while supplying
new source/caller/fixture/serializer specifications. Its corrected persisted field
is `binding` (525-byte growth); a failed `inlineBinding` 531-byte attempt is
historical, not a revised universal floor. The
[independent material recheck](../evidence/config-acceptance/independent-core-icq-material-recheck-20261013/independent-material-review.json)
supports ICQ01–05 at bounded definition scope but withholds acceptance for two
ICQ06 residuals: active byte oracles still say 1940 while the frozen candidate
is 1934 bytes, and boundary-author quota 10126 disagrees with the frozen global
268435456 binding identity. The new
[superseding package](../evidence/config-acceptance/components/icq-r06-boundaries-20261013/stable-material-correction-receipt.json)
now supplies 1934-byte state-readback oracles and thirteen boundary-specific
original manifests with matched snapshots and explicit positive/negative capture
lifecycle. The [independent R06 recheck](../evidence/config-acceptance/independent-core-r06-recheck-20261013/independent-r06-review.json)
verifies both named contradictions resolved at bounded proposed definition scope.
It independently replayed 31 definition and two current API-shape controls and
performed 250 additional definition/conservation controls. All 247 historical
inputs and Runtime batch11 remain unchanged; no target runtime binding or global
acceptance follows. Consolidator supersession guards retain both package
identities, all 22 proposed cases and historical specifications; five bounded
[integration controls](../evidence/config-acceptance/author/core-supersession-integration-attempt3-20261013.log)
pass without regenerating a moving root matrix or claiming canonical field closure.
Supplemental native questions/cases are explicitly retained during consolidation;
they do not silently become canonical field coverage or independent acceptance.

Nova's [current binding source map](../evidence/config-acceptance/author/nova-current-binding-seam-map-20261013.json)
and [target constraints](../evidence/config-acceptance/author/NOVA-MODULE-BINDING-CONSTRAINTS-20261013.md)
document existing snapshot/graph/config/package binding and pre-check activation
ordering. A new [bounded carrier proposal](../evidence/config-acceptance/author/NOVA-MODULE-CARRIER-PROPOSAL-20261013.md)
enumerates actual implementation/source/final/demo membership and proposes one
complete typed binding in the existing events journal. Exact strict schemas,
task/operator partition, authentic manifests/grants, accounting and executable
cross-reader cases remain incomplete; no accepted universal alias is supplied.
The [bounded independent Nova review](../evidence/config-acceptance/independent-nova-carrier-20261013/README.md)
identified NOVA-CARRIER-01: original A lookup must precede any current B selection
or validation. The [correction record](../evidence/config-acceptance/author/nova-carrier-01-correction-20261013.json)
preserves the original proposal and makes original-first lookup explicit for
every invocation; independent material recheck is pending. SDK envelope sequence,
first-file directory durability, original observer failure policy and async lease
ownership remain explicit constraints, not proven future runtime effects.

C0-A through C0-E remain open until the consolidated inventory has no unexplained
candidate, unknown reader/default/validation or incomplete field-level case and
the fresh reviewer independently closes it. Integrity/whitespace/register checks
are narrower evidence. No implementation approval is being requested now.

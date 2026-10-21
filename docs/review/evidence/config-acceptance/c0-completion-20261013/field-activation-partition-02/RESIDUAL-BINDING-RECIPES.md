# Additive source-specific binding witnesses — author proposal 2026-10-14

Definition only, not independent review or implementation. This supplement refines
only partition01's existing 32 future-binding wrappers and the five explicit
anchor/applicability joins listed by residual-join-audit. Original wrappers,
canonical rows/cases, maps, component bodies and failures remain unchanged.
`residual-binding-case-joins.json` is the exact finite original-ID roster, with
source/profile/task/receiver recipes below; it is not another field inventory.
`residual-anchor-joins.json` binds the retained compiler/Core/Worker/cache IDs.
Neither generic CMP-C5-BIND nor these witness names count as executed cases.

## Sole prospective Core author and selection

Evolve the existing `loadPlatformConfig(--platform)`/Core/compiler authority to
`config/nova/core.config.json`. Select it ONLY through the single system entry's
required `novaCoreSelection = {role:"nova",instanceId:<explicit>,ownerPath:
"nova/core.config.json",profileId:<explicit>}`. The path is relative to the same
config root containing pipeline.config.json. Exactly one selection applies to an
actual Nova caller; wrong role/instance, missing/unknown/duplicate selection or
profile fails before compile/registry activation. No fallback to --platform, ENV,
a conventional filename or another profile, even equal-valued. Historical runs
retain their exact original PlatformConfig/graph/package closure; no automatic
retroactive migration. This is an additional selection of existing Core ownership,
NOT a seventh Swarm component, a second system root or an installed v8/v9 reader.
The six existing component bytes remain untouched. C2 must coordinate entry schema,
Core/project CLI, materializer, package/CI and recovery decoder together.

The owner envelope is `nova-core-policy.v1`, owner `nova-core`, nonempty profiles;
each closed profile has exactly `settings:{platform,projectCompiler}`. Platform is
the FULL existing pipeline-platform.v2 schema, not a permissive partial object.
projectCompiler is the exact closed batch11 owned-compiler projectCompiler node.
The proposed schema reference composition is in `nova-core-owner.schema.json`.
All existing platform fields remain required/optional exactly as their schema;
plugin adapters/grants are further validated by actual registration schemas and
capability resolution. Resolve installationRoots, trustedBuiltinRoots, storageRoot
and optional isolation.cgroupRoot relative to the canonical Core AUTHOR file,
not generated receiver, process cwd, caller task or pipeline workflow. This
preserves platform.ts resolvePaths semantics with one declared physical source.

Profile witnesses are complete-by-reference, not partial effective profiles:
`CORE-A` means the complete platform returned by the existing production-role
fixture in nova-dispatch-projection.test.mjs (all actual roots/provider/grant/
adapter maps and genuine generated test key locators), plus batch11's complete
`owned-compiler-controls.json#/enabled`. `CORE-B-LINT` changes only lint 2→1;
`CORE-B-ORDER` only maximumOrchestratorOrders 1→0; `CORE-B-LOCK` only platform
TTL 300000→150000. All remaining full owner fields/branch/task/native grants
are identical. These are source-derived local future witness recipes, not a
claim that a deployed Nova profile or external secret revision is available.
Fixture construction/keys/native roles must be genuine at execution; no fake
credential revision or mock Core/AdapterRuntime may satisfy the productive case.
The exact constructor/source SHA, fields, receiver pointers and original cases
are in residual-anchor-joins. No test fixture is rerun during this definition.

## P — compiled project membership and pre-first-dispatch view

Use the unchanged `projectSourceFixture(root,{review:true,clean:false})` complete
nova-project.v2 task with explicit architecture review and module/final review
added exactly as binding/project-membership-03/check-current-membership.mjs does.
Use that package's review-true AND review-false membership outputs; reuse demo06
and its existing compiler test for the optional delivery triple. The task factory
retains actual repository/base, blueprints, source approval, requirements, complete
resolved plans, module IDs, dependencies and owned paths. Never infer membership
from stage prefixes: compileProject's actual emitted IDs must equal the declared
ordered membership, each exactly once. foundation includes source-preflight,
optional architecture-review/approval and blueprint-sync; every module includes
implement/lint/optional review/test with all request_fix edges inside that same
original module; integration includes final-lint/optional review/final-test;
delivery starts at project-summary, then optional demo-candidate/delivery/ready.

Compile and persist original R graph + membership/source/config references before
any stage/adapter startup. Bind one M closure before stage.started OR skipped,
observer view/delivery OR source/Git/provider invocation, not separately per stage.
Eligible quality/runtime profiles may differ for a genuinely unstarted group only
inside unchanged R compiler/graph, task/source approval, native ceilings and grants.
Compiler lint/orchestrator budgets remain R; changing them during the run is the
incompatible-R case, not NEXT-MODULE success. Existing demo retention/operator
input is included in source approval; B cannot silently change that approved task.
Prior state is original A graph/approval plus a started implement/lint repair
ledger and another unstarted declared group. Wrong graph/membership/owner/digest,
missing original source or closure rejects before startup/view/dispatch. On recovery
and repair/recheck, read A before considering current B; preserve repair ledger,
operator authorization, technical retries, absolute deadlines and uncertain effects.
Fixed Eval chooses A for every group, including unstarted delivery. Observe actual
snapshot/journal, StageExecutor context, observer event and productive provider
receipt; library serialization alone cannot prove dispatch binding.

## G — explicit graph, not guessed project groups

Use the exact complete explicit pipeline definition and platform from
attempt-projection-recovery.test.mjs's `completed wait resumes at every original
completion/projection prefix` fixture, preserving real test registration identity.
For future membership v3, explicitly author one group containing its actual review
stage and remediation edges; a two-group NEXT-MODULE fixture extends that exact
input with a second declared stage and compatible complete per-unit policy, not a
new Core scalar. Reject missing/duplicate/uncovered membership, unknown stage,
cross-group repair or graph digest mismatch. This tests Core machinery, not an
agent/model or native component effect. The real Core prepareRuntime→snapshot→
PipelineLoop→StageExecutor chain, required observer and original effect journals
must run. Original graph maxConcurrency/task/grants remain R. Historical v2 with
no membership cannot acquire inferred groups: replay under its genuine captured
runtime or explicitly block continuation requiring new binding. No mutation of
stored v1–v4 run snapshots. All A history/fixed-Eval rules from P apply.

## JN — standalone Prism native order (not the external agent launcher)

Actual membership: authenticated Control context.runWorker→runNativePrismOperation
→prismNativeAttempt→reserveNativePrismOperation→requestWorkerResult→native host
WorkerAttemptExecutor→PrismWorkerOperation→executePrismOperation. The exported
producer IS reached by Control; it is not dormant merely because exported.
Use the complete batch17 AUTH-PRISM-ATTEMPT-timeoutMs activeA/activeB full
prism-execution owner witnesses (300000/150000), unchanged original Control/native
resource/Worker owners, and an original `render` order with genuine stored
application/json artifact identity. Keep idempotency key, operation/input digest,
original selected profile/source/claim/fence, runtime/package digest and artifact
receipt. Full service/native/issuer grant is an activation input, not invented by
these profiles. `generate` is explicitly rejected by this native host; do not use
it as a fake positive for the gateway agent path.

Capture J/config+task+claim before transport/host/artifact effect; a genuinely new
unreserved order may B only within unchanged Control S/H/R. Existing reservation
returns stored attempt/result, never a new policy or claim; missing/conflicting
stored identity blocks before transport. Read back the reserved attempt and actual
host context/result/resource receipt. On crash after dispatch retain uncertain
original result and reconcile original execution, never replay from B. Fixed Eval
retains A for every order. The one-operation host cache contrast is separately
unsupported below; no shared host/cache is created for NEXT-MODULE.

## JA — Prism external agent order/claim

Reuse same-entry-engine-binding-01's complete prism-agent launcher owner profiles
`standard` and `runtime`, its exact receiving ABI and same-entry-engine-binding-02
current-owner correction. Also retain original per-entry whole Prism/Control
owner context, not a favorable Buster profile. Task is actual authenticated
agent-admission design-set/revise input with original preference generation,
project/source/request digest and session key. claimAgentJob's transaction stores
attempt_envelope/fence before AgentJobRunner starts AgentProcess. Bind complete
launcher selection inside that acceptance BEFORE launch; do not recapture from
local main/CLI timeout defaults after claim. Wrong project/generation/fence,
local-vs-Control profile digest, missing envelope or unsupported installed agent
blocks before external launch. Running/expired uncertain work becomes needs_nova,
never accepted requeue. Finish/result must bind exact original claim/resource
receipt; a fresh runner owner ID cannot rewrite it. New accepted unclaimed J may
choose compatible B; started J remains original A. Fixed Eval uses A for every
new claim. Reuse reviewed claim/window/clamp/finish/receipt cases, not another
launcher schema or a synthetic native success. Native CLI/grants remain external.

## BJ — complete Buster prepared plan and fixture lifetime

Reuse buster-remote-plan-profile-01's exact full owner/service/typed request and
future-service-case-plans, Provider03's case-definitions/context pairs, the eight
processing policies from dependency-adoption01 and reviewed four-source cases.
The complete task is each original authenticated prepared job/ResolvedTestPlan
from those source-backed case contexts: entire suite/node graph, config/task,
registry/source/archive key, fixture typed links, source approval, grants,
maximumConcurrency, plan digest, deadline and original consumed counters. Do not
replace this by provider.execute(JSON) or exported resolver-only control.

Actual membership is staged admission→extract/attachSource→store running→runPlan
→TestPlanRunner nodes/providers/fixtures→capability runtime shutdown→result receipt.
Persist the entire BJ closure before extraction, capability construction or first
provider effect; original plan/fixtures/cleanup stay one J through shutdown.
Per-unit provider profile B belongs only to genuinely unstarted compatible plan,
never mutable options for a started plan. Service listener/store caps/endpoints,
Worker replay and native ceilings remain S/H/R. Wrong suite/source/archive/key,
missing stored closure, cross-service tuple or unsupported provider rejects before
prepare/invoke. Original A is recovered before current B parsing; cancellation,
uncertain effect/result, fixture cleanup and shared-object retention remain A.
Fixed Eval all plans A. Observe actual prepared store, source receipt, invoker,
worker attempt and final result; reuse original native controls/limits, not mocks.

## BC — startup preparation cleanup, separate acceptance, original failed effect

The ten original cleanup settings and thirteen wrappers already carry full exact
original source/case bodies. Reuse batch17 complete preparation.attemptLogBytes
A/B owner witnesses and EACH wrapper's existing inputConfigProfile/sourceDigests;
no replacement thin settings object or invented original receipt. The explicit
local full policy pair is log bytes 1→0; all other settings, original ledger roots,
engine digest, original failed O envelope/result, gate inode/device/UID and source
reservation remain identical. Capture first new cleanup policy only under the
actual supervisor root lifetime fence, after original recovery and before
reserveCleanup→executePreparationCleanup. Profile B may be selected only for this
unstarted separate cleanup acceptance within original root/native/grant/capacity;
no new host root or release permission follows.

Existing record.cleanup history is authoritative: bindOriginal validates O/result/
effects; a prior association dispatches/reconciles THAT settings/envelope, not
options.settings from current startup. Success releases only after archived exact
native result and quiescent matching owner proof; failed predecessor requires
previousQuiescent before a successor. Uncertain/populated/missing ownership blocks
retry/release/unfence. Missing/mismatched projection/closure, source gate or receipt
blocks before preparationCommand/native admission. Counters and failed receipts
are write-once; fixed Eval cleanup A even if first cleanup starts after B publish.
The thirteen original actions/diagnostics/observers are retained by pointer in the
wrapper joins, including crash before/after bind, publish race, wrong projection,
quiescent versus uncertain retry, successful release/replay and history capacity.
No new cleanup framework or native invocation is performed in C0.

## RA — R observer/adapter foundation and dormant activation

Actual R membership is derived from prepareRuntime's enabledRegistrations:
ALL actual graph stage registrations, exact Object.keys(platform.observers),
explicit platform.activeAdapters and their resolved capability dependencies.
Snapshot manifest/registration/kind/package/module/config schemas plus exact
provider/grants/role/instance are captured before activateRegistry/adapters.start.
AdapterStarter caches actual instances/dependencies once; ObserverRuntime uses
manifest subscriptions/failurePolicy and captured config; serializedObserverDrainer
passes that same R around stage skipped/start/effect/terminal and recovery flush.
A module view is not permission to replace endpoint/root/secret/key/provider or
failure policy per event. Whole-owner source/caller discrimination reuses SA02,
Provider03/adoption01 and reviewed policy-field-instance-case joins unchanged.

Use the complete actual platform fixture from nova-dispatch-projection.test.mjs
and actual selected observer manifest/config/profile from the existing exact
policy-field-instance-case join; retain its whole caller/task/profile/source ref,
not synthetic observer config defaults. For each admitted registration, resolve
its unique actual declaration and original R role/provider grant before any start.
Missing/wrong/foreign registration, invalid whole owner, missing dependency/grant,
subscriber checkpoint conflict or required-delivery failure denies startup or
required dispatch at the real boundary. Keep original delivery attempt/checkpoint,
event ID/sequence, effect idempotency and original provider/secret revision A on
recovery. `operator.request` has its explicit stable delivery key versus per-attempt
execution distinction in observer-delivery.ts; preserve both. Completed delivery
replays checkpoint without duplicate effect; optional failure follows original
captured policy. Fixed Eval preserves R A; even a new M cannot change RA.

An export is not evidence of deployed membership. resolveTestPlan has no productive
repository caller beyond export/tests: source definitions and whole-plan imported
admission are reusable, but no installed resolver service or task producer is
invented. OpenAICompatibleDesignProvider is exported while actual native host
constructs DeterministicDesignProvider; its model/credential/timeout/prompt effect
contrast remains dormant, activation-denied without a real admitting caller and
reviewed native/source/credential support. Four-source outbox/blob exported-only
constructors retain the reviewed explicit caller/issuer/physical-store prerequisite;
none is installed by this supplement. Conversely Control native-operation and
agent-admission caller chains above are evidenced, so are not relabelled dormant.

## Named anchor witnesses and limits

Compiler lint 2→1: complete review-enabled graph allows one versus two original
lint category orders before exact repairDisposition authorization/blocked path;
derived attempt/remediation ceilings come from the SAME bound policy. Extra
orchestrator orders 1→0: exhaust categories, retain actual signed original operator
authorization history, and observe authorize-versus-blocked; shape-only fabricated
authorization cannot pass. Persist R graph/budgets/ledger before effects; B can only
be a separately admitted R run, not hot next-M. Original MISSING/ALT/MUTANT/source
cases remain all required. Missing field rejects before compile; mutant restoring
literal 2/1 must break exact corresponding behavioral case.

Core effectLockTtlMs: actual Nova createAdapterRuntime→EffectCoordinator→
FileResourceLockManager, NOT Buster's limited platform import. Separate R runs
300000/150000 must yield corresponding original lock expiry from the same actual
acceptance clock/lease/receipt and persisted lock record. No TTL grants permission
to steal live ownership or erase uncertain effects. Started R retains A on retry,
recover, shutdown and module B; missing A denies before adapter effect. Current
frozen runtime.configuration omits this TTL, so implementation MUST add its retained
identity to the versioned Core closure before claiming recovery: source omission
is not solved by reusing current snapshot hashes. This supplement specifies that
delta; it does not change existing snapshots or infer current recovery correctness.

Worker replayLimit: exact original batch17 row257→batch15 C1 schema/A full owner.
A=65536; a complete B may lower only that field to 32768 in a SEPARATE fresh runtime
under the same explicit supported domain 1..1000000. Submit distinct valid unexpired
attempt IDs sequentially after each completes (no active-capacity confound); at
32768 retained IDs B rejects the next with WORKER_LOCAL_REPLAY_CAPACITY_EXHAUSTED,
while A admits, then A rejects at 65536. Matching duplicate/expired/mismatched claim
controls reach their own earlier boundary. Compare retained replay identity roster
and accepted claim expiry before/after B publication, stop and recovery; do not
clear active-run identities to fit smaller B. This is run/runtime stable R/S, never
M tuning. Parent service generation restart must retain/reconcile genuine history;
current volatile map alone does NOT prove persistence. Original EFFECT and CMP-C5-BIND
specifications remain runtime-not-run and require that source migration.

Prism maximumInFlight: reuse exact full batch17 A4/B2 cache profiles and typed-profile
cases, but actual dedicated host main invokes one WorkerAttemptExecutor once;
PrismWorkerOperation also rejects a second execute. Therefore A4/B2 cannot yield a
productive multi-key saturation contrast here. Mark original EFFECT applicability
explicitly UNSUPPORTED (not passed, waived or erased), with library-only cache test
qualified separately. Missing/typed/load/binding checks remain applicable, and J
retention can be tested without inventing a shared cache service. A changed
productive topology would require separate scope approval and fresh definition.

## Review and execution

All proposed behavioral/native commands remain original wrapper commands, not-run;
the existing harness names are future files, not claimed implemented. Source/test/
image/tool/config/grant identities and raw observers must be captured at execution.
Only pointer/hash/conservation checks ran for this author supplement. Source SHA
and exact referenced file/node/profile identities are recorded without snapshots.
A different fresh reviewer must assess these authored joins. No self-acceptance,
whole C0 closure, current-root adoption or C1–C6 approval follows.

### Concrete local Core/RA witness (narrower than native role acceptance)

`residual-core-owner-fixtures.json` now supplies four COMPLETE Core owners/profiles
by value, without copying a physical tree: local-A and single-leaf local-B-lock,
local-B-lint and local-B-order. Every optional telemetry-store quota is explicit;
no adapter schema/code default fills a target policy. `residual-local-core-task.json`
is the exact two-stage explicit task and future declared membership. The only
runtime parameter is an authentic disposable delegated root replacing the fixed
/fixture/wcr06 locator before authored-byte capture. Source roots resolve from the
agreed config/nova author directory; no service/model installation is inferred.

RA/TTL uses the actual telemetry-observer + telemetry-store provider, their genuine
manifest/grant/config and real AdapterRuntime/EffectCoordinator/FileResourceLockManager.
The test.graph required observer is an explicit Core-drainer fixture, not a
substitute for a production notification or native provider. Its real fs write
fails when the selected journalPath parent is a regular file; required delivery
must block dispatch, retain A, and replay after restoring the real directory.
Telemetry's best_effort branch is separately preserved. Read actual effect locks,
provider durable output and original checkpoints, not an emitted fixture PASS.
These full local owners establish exact Core/RA input witnesses; project compiler
productive native/role/approval control still uses P's complete source fixture and
requires its genuine installed runtime/grants at later execution. They do not
manufacture a deployed complete Nova native profile.

Standalone task bytes are also grounded explicitly: JN uses the ENTIRE
contracts/prism/v1/fixtures/minimal-web.json document plus view home/state default/
viewport wide from worker-concurrent-resource-attribution.mts's original input
constructor. Keep its real produced artifact bytes/digest/size/URL and actual
Control reservation; do not replace the claimed installed receiver with that
integration harness. JA reuses agent-jobs.test.mts setup/startDesignRound/admit
and agent-job-http's original preference generation/request/claim construction;
PGlite/source-fixture observations do not prove production PG/peer authentication,
and its Node exit0 process control does not prove gateway/model behavior.

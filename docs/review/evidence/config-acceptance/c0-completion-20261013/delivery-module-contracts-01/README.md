# C1 delivery/caller-selection ABI and C5 durable binding seams

Status: **concrete additive C0 author proposal, independently unreviewed**.
Author task `/root/source_concordance_layout_recheck`, 2026-10-13. This task did not
implement these APIs. Earlier independent reports are not acceptance of this new
proposal. No C1–C6 authorization, execution, deployment or Eval follows.
Read the main goal and original canonical target contracts; reuse the sole root
`config/pipeline.config.json` and six `config/components/{owner}.config.json`
authors, not another settings index. Pipeline workflow input stays pipeline.json.

[case-callsite-map.json](case-callsite-map.json) preserves 229 selected canonical
case IDs and lifecycle metadata, 177 original author contracts, existing canonical
C5 cleanup cases and all 19 already-authored additive C5-COMPLETE cases. It adds no
new acceptance ID and changes no original body/result. [source-identities.json](source-identities.json)
pins the actual sources read; hashes are navigation, not delivery proof.

## 1. C1 composition ABI (proposed exact responsibilities)

### Types and entry ownership

`BindingTuple = {role, owner, instanceId}` uses the exact entry contract role/owner
domains; profileId is the exact case-sensitive declared member using
`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`. The root alone authors the binding-to-profile
choice. A process's deployment identity is not an owner/profile default.

`ServiceSelection` is an immutable generated startup projection containing the
actual packaged role, actual service instance identity and **six explicit root
binding tuple references, indexed by owner**. It is not another editable config.
An installation/materializer derives it from root bindings and its authenticated
installation/service mapping; it must reject any ambiguity or absent tuple.
Binding references carry the original tuple and selected profileId, not a numeric
array index as durable identity. Reordering root bindings cannot change selection.
Owner instance IDs are explicitly supplied installed/service identities; no
implicit equality of all instances, basename matching or synthesized standard ID.
For the existing full Swarm facade, all six selections are mandatory. This keeps
current full-bundle validation semantics and does not imply all six owners have a
runtime reader in every process. A role/service deployment with no authentic full
mapping is blocked before publication/start; it is not filled from a fixture.

`CapturedServiceGeneration` contains immutable root+owner documents, six selected
settings objects, exact ServiceSelection, root version, relative-path file receipts,
validator/schema receipts and role/package receipt references. Secret bytes never
appear. The selected settings facade has no separate writable authority.

### Proposed API/call changes in existing foundation module

These signatures are a normative patch target, **not functions currently present**:

```ts
captureServiceGeneration(
  entryPath: string,
  selection: ServiceSelection,
  expectedDelivery: GenerationReceipt,
): CapturedServiceGeneration
loadSwarmSettings(capture: CapturedServiceGeneration): SwarmSettingsSnapshot
loadPrismSettings(snapshot: SwarmSettingsSnapshot): PrismSettings
loadPrismWorkerSettings(snapshot: SwarmSettingsSnapshot): PrismWorkerSettings
loadBusterSettings(snapshot: SwarmSettingsSnapshot): BusterSettings
loadBusterPreparationSettings(snapshot: SwarmSettingsSnapshot): BusterPreparationSettings
```

Implement capture by evolving the existing `swarm-bundle.ts::readSwarmBundle`
validation/read-observation/freeze path, not a parallel permissive parser. The
existing internal Swarm names may stay. The new capture is called **once at each
service composition**, and wrappers project its snapshot; they no longer reread
process.env or Latest separately. SWARM_CONFIG supplies the mandatory absolute
entry transport path only. The generated ServiceSelection/delivery receipt is
passed explicitly from that service's boot/package composition, not profile ENV
or CLI overrides. A new v3 start without it rejects. Historical v2 execution is a
separate captured version-reader dispatch, never this API's default overload.

### All-six owner dependency/callsite mapping

| Current productive seam | Selected owner data actually consumed | Proposed caller wiring |
|---|---|---|
| swarm.ts::loadSwarmSettings / readSwarmBundle | Reads/validates all six and returns Prism/Buster/workerCore projection | One captured generation and six exact root binding references; no partial owner publication |
| prism/server/control-config.ts::loadControlServerConfig | prism-control control settings + prism-execution resourcePolicy/maximumResultBytes; native dispatchTimeoutMs comes from prism-control | Control composition captures once and injects snapshot into Control loaders; retained native projection is a generated cross-owner view |
| prism/server/worker-config.ts::loadWorkerConfig | prism-worker ingress + supervisor; prism-execution resource/response policy and prism-control dispatchTimeoutMs through native projection | Worker composition injects same snapshot into worker and ingress helper; do not reload during HTTP work |
| prism/server/studio-config.ts::loadStudioConfig | prism-studio port/controlTimeoutMs/controlUrl | Studio composition injects selected Studio facet of captured full generation |
| buster/engine/test-gates/preparation-supervisor.ts::runBusterPreparationSupervisor | buster-engine preparation only | After requireRootBusterSettings trust guard, capture once; parent settings and nativeBusterPreparationConfig derive from it |
| buster/engine/remote-plan-cli.ts startup | buster-engine settings + worker-core.localRuntime passed to loadProductionBusterRemotePlanRuntime | Child receives parent's exact generation/selection receipt, independently verifies it before using a frozen snapshot; cannot select newer current root |

All six physical owners have one author: prism-control, prism-studio, prism-worker,
prism-execution, buster-engine, worker-core. The existing prism native projection
is **not** a seventh owner and its dispatch timeout must not be re-authored in
prism-execution. WorkerCore is demonstrably consumed by the Buster child; no
unproved Nova workerCore reader is invented. Nova role selection is meaningful
for its installed package composition, but remaining Nova/Core system policies
remain C2. The exact generated service instance mapping must come from real
package/deployment callers, not invented Nova production values.

The parent/child startup seam already passes preparationRuntimeConfig as a fixed
--config argument and uses fd3 for NativeWorkerControlChannel. That runtime.json
is generated service/task/provider wiring, not the system entry. Extend its
versioned generated receipt association or inherited boot handoff with the exact
captured system generation reference; never reinterpret --config or --pipeline as
the system-config author. Root-controlled immutable ancestry/file ownership and
uid/gid/setpriv restrictions remain intact. Both parent and child must reject a
receipt mismatch before native admission; child restart retains the parent's A.

### Capture algorithm / rejecting boundaries

1. Verify absolute SWARM_CONFIG pointing to the selected immutable v3 entry;
   reject old filename for a new start. Resolve only the designated published
   generation alias; retain no-follow, regular-file, ancestry and read-drift guards.
2. Validate pipeline-entry.v3 root required/fixed metadata/unknown-key rules and
   all six exact component refs. Reject unsafe refs, unknown/missing owners,
   owner mismatch, duplicate tuples, unknown profile, wrong version and competing
   old authors even if equal.
3. Read all owner envelopes once. Validate **every declared profile**, not only
   selected ones, at its actual complete staged C1 owner schema; reject defaults,
   coercion and incomplete standard/runtime. Validate selected cross-owner
   relations, actual installed-role/instance compatibility and package closure.
4. Verify ServiceSelection identifies exactly six declared tuples and equals the
   expected generated deployment receipt. Select whole settings profiles with
   no merge/first/default resolution. Validate original productive relation guards
   against these selections, not a bypassed generated schema stub.
5. Recheck every observed file/ancestor and delivery digest; deep-freeze returned
   values; publish the snapshot only after all checks. Invalid generation B has
   no partially returned facets and never activates A as fallback.

Retain actual owner/schema settings roots in foundation/config; chart schema copies
are generated and hash-bound, not additional schema authors. Pinned stage C1
schemas preserve existing owner fields; later C3/C4 schema additions cannot
silently expand value-preserving C1. C1 startup selection does not yet authorize
per-module model/prompt/plugin activation.

## 2. Delivery receipt, materialization and boot closure

### Immutable identity, not basename identity

Use existing portable object codec `kubeclaw-json.utf16.v1` for semantic content
objects and raw-bytes-v1 for file bytes; reuse existing SDK canonical/portable
hash helpers. Do not change runtime-dispatch-profile.v1 into a config selector.
Every raw-file receipt contains the generation-relative normalized POSIX path,
byte length and SHA256. The closed C1 author set is exactly seven files: root plus
six nested owner files; Buster runtime is a profile inside its one owner file.
Schema/package/runtime assets have their own explicit complete closure receipts.

A semantic generation receipt hashes the sorted path/file receipts, root wire
version, exact validator/schema identities and all declared binding/profile
content references. A service activation receipt binds that immutable generation
receipt to the ordered six selected tuple/profile/content references and the real
role/package/installation receipt. Distinguish generation identity from service
selection identity: two services can share files without being falsely declared
the same selection. Bundle identity must not use current path.basename alone.
Different paths, selection profiles or schema bytes cannot collide by omission.
This is generated provenance, never an eighth editable author.

### Ordered real delivery delta

| Current caller | Concrete C1 change / conservation |
|---|---|
| scripts/updates/runtime-inputs.mjs::isImageInput / isDeploymentInput; .github/workflows/build-images.yaml, auto-promote-runtime.yaml | Include config root/components and owner schema inputs in both image/deployment discovery. Today image discovery omits the prospective config/ tree: rename-only is insufficient. Config-only profile/binding change must trigger the correct consuming image/package/render identities. |
| .dockerignore; docker/Dockerfile.buster-runtime COPY107 and ENV149; all actual consuming image Dockerfiles | Allow the exact generated generation and required foundation schemas into actual build context; copy nested tree intact; set SWARM_CONFIG=/etc/kubeclaw/config/pipeline.config.json. Do not retain an editable old Chart/image fallback. |
| scripts/build-runtime-role-bundle.mjs / check-runtime-role-manifests.mjs / package-agent-skill-bundle.sh | Preserve explicit selected nova/buster/prism role, actual mandatory packages/plugins/extensions and installed optional dependency distinction. Add selected generation/schema receipt to generated package receipt; do not treat optional package absence as a profile default. |
| kubeclaw/prism _swarm-config.tpl, _swarm-bundle.tpl, configmap-swarm-config.yaml and real deployment/workloads | Materializer must place the closed tree within each actual Chart's files boundary; Helm cannot read external config/. Render complete selected immutable tree and generated selection receipt; mount read-only under /etc/kubeclaw/config. Flat ConfigMap keys require explicit generated relative-path volume item mapping for components/*; retain nested path identity. |
| scripts/updates/release-configuration.mjs / deployment-release.mjs | Include generation/selection/schema receipts in their actual release input/render guard; reject stale aliases or receipt drift. Image, role bundle and Chart references must agree on source and generation receipts, not merely equal entry filenames. |
| _buster-native.tpl; Buster entrypoint/preflight; scripts/check-built-runtime-image.sh | Migrate actual ENV/mount/root-controlled boot proof and image verification together. Retain pool/runtime-node/code identities as separate evidence, not equate OCI digest to config or engine source digest. |

Materialization is a bounded existing config/delivery responsibility in the
release/build pipeline, not a general include graph or manual test-only sync.
It first validates the author generation and caller selections, writes a closed
staging tree, verifies bytes/schema/role receipt, fsyncs files and directories,
then publishes a no-replace immutable generation. Only after complete publication
may an atomic deployment selection alias refer to it. A Chart/image may contain
the same immutable generated copy, never an independently editable author.
The observed effect boundary is real packaged Chart/image loader and role manifest,
not a standalone proposed shape checker.

### Historical v2 replay versus new v3 start

New v3 start rejects old filename/version/authority and absent explicit selection.
A genuinely historical run retains its authentic v2 reader/schema/package/config
closure and recorded graph/registry contracts. Replay chooses the archived reader
by recorded version and validates its stored digests; it does not synthesize v3
bindings or fetch current standard values. Missing archived reader, schema,
package, secret revision or config object rejects before effect, with a specific
missing-closure reason. Unsupported legacy pending effect remains reconciliation
required; no new A/B publication may erase it. The package must explicitly retain
needed archived reader closure before retiring old startup support. This policy
is not a claim that such archives already exist for every deployed run.

## 3. C5 API and durable state transition (proposal, not C1)

Reuse the existing codec-correction-04 contracts
`config-run-foundation.v1`, `config-membership.v1`, `config-module-binding.v1`
and `config-binding-event.v1`; do not invent a second journal/budget ledger or
reshape historical snapshots without a versioned migration. The following are
proposed narrow helpers at existing engine composition/persistence seams:

```ts
captureRunFoundation(preparedRuntime, definition, membership, serviceCapture,
  mode, realStoreGrants, secretRevisionRefs): ConfigRunFoundation
resolveOrBindModule(runContext, groupId, publishedCandidateRef): ConfigModuleBinding
recoverBoundModule(runContext, groupId): ConfigModuleBinding
projectBoundStage(binding, stageId, actualRegistration): FrozenStageProjection
```

`captureRunFoundation` is called in engine-run.ts::runNewPipeline inside the
existing withRunMutationLock and before dispatch. It captures actual task graph,
compiler membership/repair relations, package/registration/provider/grant closure,
issuer, storage writer/capacity authority, original run budget ledger authority,
S/H/R field partition, mode and fixed-generation selection. Existing
engine-snapshots.ts::writeRunSnapshots exclusive-write/fsync/no-replace publication
must remain; extend it with a versioned foundation reference, never rewrite a
run-snapshot.v4 as though it already includes module bindings. Existing
verifyPinnedGraph/verifyPinnedPackages/frozenRegistryRecord and effect-recovery
checks remain operative.

`resolveOrBindModule` owns only selection and binding, not grant issuance or new
budget counters. Its algorithm is:

1. Under the existing run mutation authority, read the actual logical group
   binding first. Existing binding resolves all stored objects/receipt references
   and returns it **without reading current published config**.
2. If unbound, select candidate A/B once (fixed-eval selects only foundation.fixedGeneration).
   Fully validate complete profile/consumer closure, schema/code/package/store
   identities and field eligibility before the journal transaction. M changes may
   tune allowed fields only inside unchanged S/H/R grants, budgets, membership,
   issuer, provider ABI and original store/observer/recovery constraints.
3. Write/fsync referenced immutable content/schema/prompt/projection objects and
   real reservation receipt before binding. Persist references with the existing
   `$defs.object` byte/encoding/schema identities. No secret bytes. Registered
   profile owner/registration/instance values come from actual activated registry;
   service owner names do not create fake plugin registration IDs.
4. Inside FileJournal.transact's synchronous callback, recheck the unique
   (runId, groupId) binding and append **one** versioned module.binding.accepted
   event if absent. Do no async I/O or await in callback; no assumptions of rollback.
   An already-bound different digest rejects conflict. Content may be orphaned
   before append but no effect is legal until fsynced acceptance.
5. `projectBoundStage` verifies stage membership and uses binding.consumerProjections
   for effective config/execution, exact taskInput and actual registration profile.
   StageExecutor receives that captured projection before #runtime/#recordAttempt;
   only then may it create the actual invocation lease and append attempt records.
   Preserve existing schema validation, adapter activation and effect audit.

C5 must version the SDK/journal allowed-event union and reducer handling to admit
config-binding-event.v1 explicitly; it must not cast a new event into the existing
LifecycleEvent/PluginDomainEvent union without schema support. Existing binding
contract and exact original event semantics remain captured.

Recovery currently prepares runtime from supplied PlatformConfig before reading
stored snapshots. Proposed C5 recoverPipeline/resumePipeline must resolve and
validate recorded foundation/archive closure first, then prepare only the captured
package/registry/provider configuration; read current configuration only for a
genuinely eligible unbound future group. Package/graph verification remains,
but cannot be used to fill missing historical PlatformConfig fields from Latest.
This ordering change is a concrete C5/C2 dependency, not already implemented.

Invocation lease IDs/claim attempts may change on genuine retry; their authority,
consumed run counters, technical retry/remediation usage, original deadline/cooldown
and binding stay pinned. New configured ceilings do not reset consumption. The
actual lease uses existing granted registry and bounds; the current 512MiB literal
in stage-executor.ts is a separately inventoried policy, not a newly accepted
universal constant or an excuse to bypass C2/C4 field closure.

### Actual group/standalone seams

| Actual source / unit | Logical binding and inheritance |
|---|---|
| nova/project/compiler.ts::moduleStages | One membership group per input module covering implement/lint/optional review/test and their request_fix repair links. The compiler emits explicit membership; no regex grouping by stage name. All attempts/repairs inherit one group binding. |
| project/source.ts, coverage.ts, demo.ts | Explicit foundation/source, integration/coverage and delivery/handoff membership from actual generated stages. Free graphs require complete explicit versioned membership. Optional review/demo absence is preserved, not silently invented. |
| nova/core/execution/engine-run.ts::executePrepared / StageExecutor.execute | Verify pinned graph/foundation/binding before adapter/plugin effect; uncertain effects reconcile first. Wait/resume/cancel/reopen use same original closure and real administrative authorization. |
| prism/control/native-operation.ts::runNativePrismOperation / native-operation-store.ts::reserveNativePrismOperation | One standalone prism-order group under existing request/idempotency key. Attach binding digest to a versioned operation record within actual DB transaction/advisory-lock reservation before requestWorkerResult. Existing stored attempt/result wins on retry; result receipt persists before hydration and completed state cannot cause new execution after hydration failure. |
| buster prepared-plan-store.ts::accept / remote-plan-service.ts::BusterRemotePlanService | One standalone buster-plan group keyed by actual plan/run/job/idempotency identity. Include full plan and fixtures/dependencies, actual registry snapshot digest and provider/grant closure before store acceptance/launch. Existing job record lock/content/attestation/result checks remain. No bind per fixture node and no D18 topology change. |
| preparation-cleanup-binding.ts and preparation ledger/recovery | One cleanup group per original preparation effect, preserving original effect/source/reservation association; its first eligible unbound admission may select B, but recovery of started cleanup remains A. New claims do not erase original binding, retained receipts or run budgets. Keep original 13 canonical cleanup cases, not only a generic module case. |

### Crash, concurrency and fixed Eval matrix

| State | Required next behavior |
|---|---|
| Crash before durable binding | No dispatch allowed; retry may select a complete valid generation under run policy; orphan objects handled by real retention accounting |
| After binding, before attempt/dispatch | Recover exact binding, never Latest; missing object/revision fails closed |
| After attempt.dispatched / uncertain effect | Existing effect recovery and durable original request/attempt identity reconcile before repeat; same module closure |
| Concurrent unbound starts and publication | Single unique logical binding, complete A or B; no mixed file/projection set or duplicate accepted event |
| Started module A with B published | Every repair/retry/resume/cleanup dependency of that started group stays A |
| Eligible unbound module under live-modules | May select fully compatible B; incompatible grant/provider/store/R changes reject before binding |
| fixed-eval | Run foundation requires non-null fixedGeneration; every unit uses that generation, even if another publishes B. No runtime “Latest” or fallback. |

Eval mode is an explicit run input recorded before first effect, not inferred from
branch name or plugin test labels. This defines the C5 seam only; there is no new
Evalrunner or paid/local Eval execution in this task.

## 4. Existing case mapping and unresolved real inputs

The JSON companion lists exact canonical IDs and unchanged hashes. Concrete seam
owners are CMP-C1-VAL-{owner}, CMP-C1-EFFECT-{owner}, CMP-C1-DELIVERY,
CMP-C1-MUT, DLV-CASE-GENERATION-MOUNT, DLV-CASE-ROLE-PACKAGING-CLOSURE and
DLV-CASE-RELEASE-DRIFT-ALIASES. Those delivery cases are cross-domain joins, not all
implicitly authorized by the C1 scope list. Existing binding/future-cases.json
contains the 19 C5-COMPLETE identities for original-first, next-module, fixed Eval,
incompatibility, membership, pre/post-bind/post-dispatch crash, concurrent publish,
lease loss, journal accounting, first-directory, observer, secret/store,
cleanup-reference, legacy, administrative upgrade and mutation. They are existing
additive not-run proposals, **not canonical matrix IDs**. CMP-C5-BIND and all
13 CMP-C5-PREPARATION-CLEANUP-* canonical cases retain their original obligations.

Required concrete external inputs, only at affected boundaries:

- Authentic deployed Nova/Prism/Buster service and installed owner instance roster
  and allowed root binding mapping; fixture local-A/B are not that roster.
- Actual installed plugin/adapter/observer/provider manifests and code receipts,
  grant issuance/issuer/principal policy; a structurally valid profile installs none.
- Secretstore storeId/secretId/revisionId/accessPolicy contract and retention/read
  semantics. No invented revision or secret value in snapshots.
- Store/volume identity, writer set, principal, independently measured capacity
  and logical/temp/retained/metadata/inode reservation evidence under real store
  accounting. No guessed disk capacity from schema maximums.
- Authentic archived historic reader/schema/package/config closure and uncertain
  effect receipts; absent closure must remain blocked.

These block the corresponding real activation/live proofs, not autonomous local
source/case design. Future tests must demonstrate same actual loader positive/
negative controls and source-specific real effect oracles; receipt/set agreement
alone does not complete the 201 future selected cases. The original 28 passed C0
observations remain history, never implementation passes.

## 5. Phase/stop boundaries

C1 owns six existing authors/full Buster runtime, entry v3, explicit service boot
selection, real delivery and existing effective value preservation. C2 owns Nova
compiler/runtime policy and run foundations' field consumers; C3 owns deployment/
native/provider policy additions; C4 owns registration/model/prompt/tool profiles
and their actual schema/consumer projections. C5 depends on those truthful
closures and owns durable binding transitions above. C6 executes consolidated
real effect/rejection/mutation/recovery/F-CODE/F-DOC acceptance. Cross-slice cases
are retained, not included merely because a filename migration is approved.

Before implementation: complete source-specific cases, resolve the exact C1
package/dependency delta and obtain fresh independent proposal/full-C0 review,
then explicit user approval of exact package/case IDs. No source/test/schema edit,
new generic validator, API/credential/native call, paid Eval, deploy, merge or D18
worker topology implementation occurred here. All original canonical artifacts
and prior independent reports are unchanged. This proposal is reviewable C0 work,
not a claim of full source/domain closure or an approval request.

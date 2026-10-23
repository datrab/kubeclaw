# Delivery/module contracts 02 — concrete DMC-01–06 correction

Status: additive author proposal, **independent material recheck required**.
No implementation/runtime/native/package acceptance. Supersedes only the six
ambiguous/incorrect seams of delivery-module-contracts-01, not original settings,
requirements/cases, its historical bytes or the independent NOT ACCEPTED review.
Main GOAL boundaries apply. All versions/APIs below are proposed deltas, not
already supported code. Companion case-oracles.json gives exact preserved IDs,
prior/input/action/rejecting/observing boundaries; source-pins.json records inputs.

## DMC-01: minimal root-owned service selection, not six installations

Owner documents are **configuration domains**, never claims of six installed
services/plugins. Root binding.instanceId identifies the consuming installed
service composition for that owner contribution; it does not assert an installed
owner instance. This explicitly refines the prior prospective instance wording.
Root binding tuples remain `(role, owner, instanceId)` and root alone chooses
profileId. Same instanceId across different owner bindings is allowed only because
those explicitly authored tuples identify the *same real caller*, not synthesized
independent installations or an inferred equality.

The generated closed `pipeline-service-selection.v1` object has exactly:
`{schemaVersion, role, serviceInstanceId, callerId, generationDigest, bindings,
packageReceiptDigest, digest}`. role uses nova/buster/prism; serviceInstanceId is
nonempty1..128/no-trim; callerId is one supported composition below; bindings is
an array of exact `{owner, instanceId, profileId}` members, no duplicate owner,
unknown member or unknown profile. Every instanceId equals this explicitly
supplied serviceInstanceId; every tuple is present verbatim in root.bindings.
No alias/provenance path selects a profile. Its digest uses existing portable
codec. The producer is existing release materialization/role builder consuming
root + actual declared deployment composition and package receipt. Its source
root hash, package role and callerId are verified by the packaged boot program;
the selected Chart deployment metadata supplies expected role/service identity
through a generated boot receipt. This is an immutable projection of root/role/
deployment metadata, not another editable author or ambient ENV policy.

| callerId / actual entry | Exactly selected, consumed owner bindings |
|---|---|
| prism-control / control.ts→loadControlCompositionConfig | prism-control, prism-execution |
| prism-worker / worker.ts→loadWorkerConfig | prism-worker, prism-control, prism-execution |
| prism-studio / studio.ts→loadStudioConfig | prism-studio |
| buster-preparation / native-parent.ts→runBusterPreparationSupervisor | buster-engine |
| buster-runtime / remote-plan-cli.ts | buster-engine, worker-core |

Nova package role does not create a Nova six-owner reader. A Nova boot path that
actually consumes an owned facet must be separately mapped in C2; no absent
Nova callerId is accepted as a default. All six files/all declared profiles and
schema/provenance receipts are mandatory for **validation**, but unrelated owners
require no selected tuple or serviceInstanceId. Omission of unrelated Buster or
WorkerCore binding for Studio is valid. Missing Studio binding rejects. Extra
selected unrelated owner in Studio service receipt rejects as unexpected; root
may contain bindings for other genuine callers. Root tuple reordering is irrelevant
because lookup is by tuple, never ordinal. Duplicate/ambiguous tuple rejects.

Capture returns `{selectedOwners, validatedGeneration, selectionReceipt}`; it does
not expose a fabricated full Swarm facet. The C1 patch replaces full-facade callers
with exact typed caller projections. Full-tree/all-profile schema and intrinsic
semantic validation remains, including Buster complete owner validators for every
profile. Actual cross-owner relations apply to selected consumed combinations;
Worker selects its Control/Execution dependencies explicitly. Control does not
receive worker supervisor policy it never reads; Studio does not select unrelated
Buster simply to satisfy an old aggregate return type. Every existing productive
relation is assigned either all-profile intrinsic validation or selected caller
relation before implementation; no unexplained guard is deleted. The 01 requirement
for six ServiceSelection tuples is expressly withdrawn.

Existing semantic guard assignment is exact: swarm.ts:135–139 normalized non-root
artifactRoot/studioPublicUrl applies to every prism-control profile; :141 and
validateStudioOrigin apply to every prism-studio profile; :143–149 connection-sum
and shutdown versus supervisor.close+drain apply to every prism-worker profile
(ingress and supervisor are in that same owner). Buster preparation/admission/
dependencyReadiness/execution/clusterInvokers validators apply to every Buster
profile. No unrelated profile tuple is needed to execute these intrinsic guards.
Selected Control/Worker native projections combine exactly their declared consumed
owner values; validator/package/schema provenance covers all six without selection.
The composed Buster executable path remains resolved by the entry generation
base with its existing absolute executable semantics, not by moving author files.

The existing worker-service.ts::createWorkerServer and
worker-lifecycle.ts::createManagedWorkerServer helper default `workerIngressLimits()`
paths become mandatory injected limits from the worker capture. No zero-argument
helper or legacy ENV overload remains on v3 starts. loadControlServerConfig,
loadStudioConfig and Buster parent/child receive their capture explicitly.
Remaining endpoint/trust/provider fallbacks belong to their original later slice,
not a claim of global removal.

## DMC-02: one physical route — image-baked immutable regular files

**Chosen route is image-baked generation, not ConfigMap copying, a new privileged
init or symlinked system-config volume.** This preserves actual both-Chart pod/
init security contexts. Docker/role materialization writes the exact closed seven
file tree and generated generation/service receipts into image layers at
`/etc/kubeclaw/config`. Files are root-owned regular files0444, directories root
owned0755, no hardlinks/symlinks or group/world write. Foundation schema/validator
files and package receipt are pinned separately. Source staging uses exclusive
regular-file creation, fsync each file and directories, no-replace staging publish;
the verified sealed tree then enters actual Docker build context and COPY. Docker
layer/image receipt seals the result. No container UID0 publisher is introduced.

Both configmap-swarm-config templates remain generated render diagnostics plus
expected-delivery receipt transport, **not files read by system loader**. Remove
old system-config mount authority at Prism workloads.yaml:142/193 and Kubeclaw
deployment.yaml system mount locations1233/1421/1643. Kubeclaw init's existing
`/init-swarm-config` lint/config projections remain separately scoped unchanged;
they are not mounted as the system tree. Prism control/studio UID1000 reads the
image's root-owned tree; worker/Buster existing native UID/root restrictions remain.
No new init root permissions are required. Existing Kubeclaw init and each main
boot verify image generation receipt before any startup effect that consumes these
settings; main does not depend on init having altered the image layer.

A narrow generated expected-delivery receipt ConfigMap is mounted read-only at
`/run/pipeline-delivery`, outside `/etc/kubeclaw/config`; it contains only expected
image/package/generation/selection digests and caller identity, no settings.
The packaged boot verifier resolves this **transport projection only** by capturing
its Kubernetes atomic-writer `..data` target, resolving under that mount's physical
version directory and opening expected receipt as regular O_NOFOLLOW file;
verify path remains in that one volume/version directory, known closed file name,
size/digest, and same directory/file observations before/after. Rotation/drift or
escape fails; do not fall back to image receipt alone if expected receipt is absent.
This narrow transport exception never applies to system entry/components.
Main system loader uses only physical image files with O_NOFOLLOW on every leaf
and trusted non-symlink ancestor checks. No runtime alias/symlink under the tree
is supported: entry is fixed `/etc/kubeclaw/config/pipeline.config.json`.

Proposed packaged boot entry is the existing foundation config responsibility
`foundation/config/pipeline-boot.mjs::verifyPipelineBootReceipt(expectedMount,
callerId)`; it delegates to the evolved strict capture path, not another schema
validator. Kubeclaw deployment.yaml init command invokes it before any migrated
system-config consumer, and Buster entrypoint invokes it before preflight/native
parent. Prism control.ts, studio.ts and worker.ts invoke it once before their
composition loader/listen/native-start; no unauthenticated caller-supplied callerId
is accepted (callerId is fixed by that packaged executable). The renderer derives
serviceInstanceId from the explicitly declared release/namespace/service identity
under root bindings, not a discovered Pod name or default fixture name. ConfigMap
receipt caller identity must equal the packaged program plus the exact root tuple.

Expected receipt comes from actual release renderer, agrees with Chart root/
components materialized digest, and references the selected image receipt. Existing
release-configuration/deployment-release source/code/render guards must cover it.
Every root/profile/binding/config-only change triggers actual runtime-inputs image
and deployment predicates, workflow rebuild, role package receipt, image COPY and
both Chart receipts together. Helm .Files.Get stays inside each Chart. A stale A
image rendered with B root/receipt rejects before init/main settings use. Tests
must inspect shipped image files, not substitute the authored host tree mount used
by today's image proof. Application container restart stays on image A; B needs
new Pod/image publication. Read-only-root-filesystem deployments stay read-only;
images with existing writable roots still restrict startup mutation by root-owned
file identity guards and captured snapshot. No arbitrary ConfigMap symlink passes.

## DMC-03: one parent/child generated handoff ABI

Chosen sole transport is root-owned regular file
`/run/kubeclaw-buster/config/pipeline-startup.json`, version
`buster-system-generation-handoff.v1`. Add this exact name to the existing
buster-runtime-config-root.mjs allowed closed namespace in the C1 patch. No ENV
profile selectors, fd3 multiplexing or alternate handoff mechanism.

Exact object fields: `{schemaVersion, parentBootId, entryPath, generationDigest,
parentSelection, childSelection, imageReceiptDigest, readerSchemaDigests, digest}`.
entryPath is the fixed physical image entry; parentSelection/childSelection are
closed pipeline-service-selection.v1 objects for buster-preparation/buster-runtime.
Both select the same Buster profile/content digest; child additionally selects
worker-core from a root-authored tuple. ParentBootId is an opaque boot UUID, not
an author/default. Digest uses existing portable codec over all other fields.
No key bytes/tokens or arbitrary extra fields allowed.

Privileged preparation supervisor is the sole writer: after root trust/capture/
full validation, while entrypoint holds existing lifetime.lock fd9, write wx temp,
fsync, no-replace rename to exact handoff, root:builder(0:1000)0440; directory
root:builder0750, fsync directory. It passes no new configurable path: child knows
fixed handoff locator in packaged ABI. Parent retains expected handoff digest/bootId.
Existing setpriv uid/gid1000, fd3 NativeWorkerControlChannel and `--config
preparationRuntimeConfig` remain unchanged; --config is generated remote runtime,
not system entry. Parent must publish handoff before spawning child.

Child before NativeWorkerControlChannel/admission performs trusted ancestor check,
O_NOFOLLOW regular-file/nlink1/root uid/no022/size check; validates version/closed
fields/digest, image/schema receipts and actual caller identity, captures only the
handoff entry/generation and child selection, verifies same Buster content as
parent selection. It performs a versioned startup association request on existing
fd3 protocol (`buster-preparation-startup-association.v1`, bootId+handoff digest+
generation digest); parent permits normal request admission only after exact echo
match. This is an explicit C1 channel protocol-version delta, not an unversioned
extra frame or secret authentication. Physical file ownership establishes trust;
parent's original in-memory receipt prevents replay of another boot association.

If deployment publishes B after parent captured A, the A image/physical root and
handoff remain A. Child does not reread publication/current SWARM_CONFIG; mismatch
rejects before admission, never follows B. Child restart during same parent
lifetime reuses exact handoff A and verifies association again. Parent restart
uses a new bootId; entrypoint's existing exclusive lifetime lock and closed-root
checks authorize retiring prior handoff only after prior parent/child quiescence,
then atomically publishes new handoff before admission. No overwrite while a
parent lives. Missing historical A image/reader/receipt rejects, not Latest. Retain
handoff for full parent/child lifetime and archive its digest with started jobs;
job replay uses archived closure, not a stale transport file. Failed publication
must not start child; files remain root-owned with accounted lifecycle cleanup.

## DMC-04: actual mutation epoch fence across acceptance/activation

Reuse existing ResourceLock.v2 lockId/ownerLeaseId/fencingToken, 60s TTL/20s renew,
FileResourceLockManager.assertCurrent ownership/status/expiry semantics; no new
epoch ledger. Proposed C5 API delta:

`withRunMutationLock(runRoot, (authority: RunMutationAuthority) => Promise<T>)`
where authority exposes signal, immutable owner/lock/fencing identity and
`guardCurrentSync(operation)`; it delegates to proposed manager
`withCurrentGuardSync(lockId,ownerLeaseId,fencingToken,operation)` holding the
existing metadataMutex across ownerfile/active-journal/expiry/epoch checks and the
entire synchronous operation. It is not standalone assertCurrent() followed by
an unguarded append. Check signal.aborted and renewal failure before entry,
inside final guarded callback and before exposing any projection/dispatch intent.
The callback rejects async/thenable returns; no await/rollback is assumed.

Global lock order: resource metadataMutex → target events journal append mutex;
all C5 acceptance paths follow it, never acquire metadataMutex while holding that
events journal. Manager's own lock journal access already occurs under metadata
mutex; keep it distinct from events journal and preserve this ordering. The guard
prevents authority replacement during append. Recheck expiry/signal/epoch at the
actual synchronous append call, not only before waiting for events mutex. If TTL
expires before append, reject; if append durably completed and authority then
expires, do not undo it: retain accepted record but deny activation/effect.

After async content/reservation preparation, resolveOrBindModule enters this
guard then events.transact, rechecks unique original binding and authority at
append. Already-bound archive loads also finish under guard before exposing the
binding/view. projectBoundStage and attempt/dispatch intent creation use the same
authority guard with synchronous final check; a stale holder cannot return an
activation view or append attempt intent. After asynchronous adapter/pre-provider
setup, re-enter guard and revalidate before invoking real effect. Actual runtime
activation/dispatch must carry the same original lock epoch as fenced authority
until the existing downstream effect/lease boundary accepts it; no queued async
closure may execute solely because a view was previously valid. C5 wires these
checks through executePrepared, StageExecutor and existing effect invocation
fences; no new lease can enlarge original grants/budget/deadlines.

Orphans: reserve under existing store grant/accounting before write; any prepared
objects/reservation not referenced by an accepted event are tracked by reservation
receipt as unbound pending. Lost-authority path cannot release reservations as
though no bytes exist. Current authority's reconciler proves absence of accepted
reference/active effect, then moves bytes to accounted retention or safely deletes
and releases once. Already-accepted binding keeps receipt even if later activation
fences. No independent budget ledger, reset or best-effort free-space inference.

## DMC-05: cleanup is explicit group plus dependency edge

Membership has a separate kind=preparation-cleanup group keyed by original
preparation effect/admission, with standaloneIntent capturing original envelope,
source/effects inode/uid, reservations and grants. Its dependency edge references
the predecessor preparation group binding and original effect/result receipts;
**dependency is not membership**. Same-group continuation/repair/retry stays A.
A separately declared unbound cleanup group in live-modules may first select B
only for eligible M cleanup tuning, inside pinned original S/H/R grant/authority/
consumption/deadline/source/effect/reservation constraints. Once cleanup bound B,
its recovery/retry remains B. Fixed-eval forces A for both groups. No new claim
changes original effect identity, previous envelope/result digest or resets budget.
The 01 phrase “every cleanup dependency stays A” is withdrawn.

Original PreparationCleanupAssociation envelope/settings/effects/predecessor
receipts remain distinct from chosen cleanup consumer projection; version any
added binding reference and include it in serialized capacity, retained ownership
and history. All 13 original cleanup cases are mapped individually in case oracles,
including first admission, started recovery, uncertain retry and fixed Eval.

## DMC-06: Buster stored/archive first at every lifecycle seam

Proposed strict `buster-plan-job-record.v3` has exactly
`{schemaVersion, input, job, source, resultOrigin, status, configBindingRef}`;
configBindingRef is the existing typed `$defs.object` reference to complete
config-module-binding.v1. Preserve all v2 job/source/attestation/status/result
invariants. Unknown/missing fields reject; never permit optional binding default.
Dispatch record type by stored version. v2 accepted/running records require their
authentic archived v2 reader/registry/settings/store closure; absent closure is
explicit blocked/reconciliation-required, not silently upgraded v3 or rewritten
failed merely because current B differs. Imported terminal-v2 records keep their
existing distinct version/resultOrigin semantics; no binding is fabricated.

New store API `lookupOriginal(idempotencyKey, jobId)` returns strict stored record;
`acceptBound(staged,bindingRef,now)` acquires existing admission lock, looks up
first, validates same jobId/requestDigest conflict independently of new B authority,
then returns the winning stored record, **not just status**. Store/source attestation
validation for replay uses the archived original validator/key-reference revision;
new admissions use fully validated candidate/current closure. A different original
request under same key remains BUSTER_REMOTE_JOB_CONFLICT even if B is incompatible.
The existing durable append race winner is returned as the launch authority.

| Actual seam | Proposed ordering/closure |
|---|---|
| remote-plan-service.ts::submit / preparation.stage header callback | Authenticate requester/parse bounded wire identity, lookup original key+job first. Matching replay resolves stored binding/archive before #validateAuthority or #assertDependencies. Validate incoming immutable request/attestation against original, not current registry. Return original status or schedule original stored record. Only genuinely new job validates current candidate and stages/admission side effects. |
| service bootstrap/recover / #recoverAccepted | Enumerate stored versions, resolve each original closure first. Archived registry/provider/grant/settings/store/runtime roots supply validation and reconciliation. No constructor rejection on current B before record lookup. Service can accept new B while replaying A with separate per-job closure. Missing A closure blocks that job and keeps record/effects; no Latest and no invented transition to terminal success/failure. |
| store.acceptBound return / #start / #queue / #drain | Queue is Map<jobId, BoundStoredJob>, not incoming BusterStagedAdmission. Includes original record, binding, archived execution options and reservation authority. Start/retry uses winner stored input/source/plan and original registry snapshot/providers/executionPolicy/workerLocalRuntime. Shared host scheduler may not exceed actual host grant; B policy cannot enlarge/reset A counters. If host cannot honor A, block instead of execute using B. |
| #execute / executeBusterPreparedJob | Pass BoundStoredJob.executionOptions, not this.#options/current service projection; verify original plan registrySnapshotDigest, grant/provider ABI, retained source/attestation, claim/lease and fenced original effect before provider execution. |
| cancel / status / evidence / result | Lookup stored record first; cancel uses original ownership/effect association and requester authorization, never current-registry precheck. Status returns retained original status. Evidence uses archived original runtimeRoot/resultOrigin/blob/store grants and digest/byte limits, not current options.runtimeRoot; result serves exact stored receipt. Missing archive fails closed without deleting receipt or relaunching job. |

Transport/requester authentication remains mandatory and separate from archived
execution authority; replay is not authorization bypass. Header decode and request
size ceiling remain bounded before lookup, but cannot instantiate current providers
or stage source before deciding original/new. Original grant revocation/expiry
must be handled explicitly at original authority boundary, never by substituting
current B grant. No new implementation or deployment here.

## Review/case and stop boundaries

case-oracles.json pins all cited current source inputs, original case body digests
and exact future observers. No test digest is invented for nonexistent future
harness. Original 229 C1 membership and 177 physical author contracts remain in01
unchanged; 28 C0 passes are historical, 201 future cases remain not-run. These
corrections add source-specific oracle detail to existing case IDs, not replace
requirements or assert execution. Whole C0 and full delivery/package profiles and
external activation facts remain open. C1 owns mapping/image/boot/handoff; C5 owns
mutation fence, cleanup and versioned standalone archive transitions (with C2–C4
actual authority/profile dependencies). No D18 worker topology change.

Next mandatory step is fresh independent recheck of all six material corrections.
Neither this author nor earlier independent reports can accept this new02 proposal.

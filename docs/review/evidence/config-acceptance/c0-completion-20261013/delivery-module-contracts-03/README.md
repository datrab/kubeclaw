# Delivery/module contracts 03 — R02-01..03 correction

Additive author proposal, independently **unreviewed**. Earlier 01/02 proposals
and both NOT ACCEPTED reviews remain immutable history. No implementation or
C0/package/native approval. The 02 settings, physical image route, strict Buster
archive-first records and cleanup membership rules remain unchanged except the
three explicit refinements below. Read main GOAL stop boundaries.

## R02-01 — exact active fixture/contract reference resolution

[active-contract-overlay.json](active-contract-overlay.json) is the explicit
prospective reference overlay for current entry-profile-contract and C1 scope.
It preserves their exact baseline refs and records that scope
`/currentCaseDefinitionEvidence/entrySelections` now resolves for the proposed
consumed-owner ABI to pair-entry-selection-translation-03/entry-selections.json,
not the old owner-centric tuple interpretation. Original pairs02, validation
observations, 148 IDs and 154 full typed profile documents remain original inputs;
prior current-wire observations are not promoted to v3 boot results.

The parent-authored translation has148 case rows × A/B =296 entries, each with
nine root bindings and five explicit local caller projections: Control2, Worker3,
Studio1, Buster parent1, Buster child2. All296 selectedWholeSettingsSha256 maps
match the prior entries exactly; case-ID order is identical. All six owner files/
all declared profiles still validate; unrelated domains require no tuple selection.
Buster child consumes buster-role WorkerCore, not a fictitious Prism WorkerCore
installation. Each selected contribution uses that caller's explicit service
instance ID. Only root chooses profile; projection does not rewrite settings.

Overlay refines the active meaning of binding.instanceId: exact consuming-service
composition identity **for an owner configuration contribution**, not an assertion
that the config owner is separately installed. It preserves tuple uniqueness,
profile name domain and case sensitivity, all-profile/intrinsic validation, and
02 generated closed pipeline-service-selection.v1 layout. Scope's old source
ref remains historical and is superseded only for fixture tuple/projection meaning.
This overlay is a proposal/document reference, never a runtime settings author.
Parent must integrate these exact refs into current entry/status docs after review;
unmodified old wording cannot be used to bypass this recorded supersession.

Fixture caller IDs/serviceInstanceIds are local examples, not installed/deployed
identity evidence. They lack authentic packageReceiptDigest/image/release receipts,
portable-codec generation/service receipt digests and installation authority.
They are intentionally **not full boot receipts**. Actual future positive boot
cases must materialize them with verified real package/image/Chart identities;
missing receipt rejects. Do not manufacture an installed roster, infer actual
profiles from fixture names or use fixture UTF8 JSON conservation hashes as
portable-codec startup receipts.

## R02-02 — real lifetime descriptor ABI plus native quiescence gate

**Current fact:** entrypoint12–13 locks fd9, then both native-parent spawns316/319
explicitly close it via9>&-. preparation-supervisor59 stdio maps only0..3; current
child also has no fd9. Therefore current file ownership/bootId/lifetime lock do
not imply parent/child liveness. The following is a concrete C1 change, not a
claim of current behavior or tested OS inheritance.

### Descriptor ownership

1. Keep original lifetime.lock inode, root-owned single-link regular0600 in fixed
   /run/kubeclaw-buster. Never replace/unlink that inode to acquire authority.
   Existing entrypoint takes flock EX|NB on fd9 before touching runtime files.
2. Remove9>&- from native-parent spawns. The native parent must validate inherited
   fd9 with fstat+same trusted lifetime.lock inode identity and retain it throughout
   supervisor recovery, handoff publication, child lifetime and final ownership
   drain. It does not open a separate lock and cannot treat a missing fd9 as default.
3. preparation-supervisor spawn explicitly maps child fd9 to parent fd9:
   stdio0..2 inherit,3 pipe,4..8 ignore,9=the validated inherited descriptor.
   setpriv/Node executable must preserve it; child remote-plan-cli validates fd9
   before handoff/channel startup and holds it for the service lifetime. Existing
   fd3 framing stays NativeWorkerControlChannel; fd9 is not config or payload.
4. No holder calls LOCK_UN: flock belongs to the shared open file description;
   an explicit unlock by one could release all. Close only that process's fd9
   after its own admission is fenced and its controlled lifetime has settled.
   Entrypoint wait exit/death closes its copy but surviving parent/child keep lock.
   Child normal exit waits client/runtime stop before close; parent normal exit
   fences owner admission, awaits child close and NativeWorkerOwnership.supervise
   final lease.finish/drain, then closes. No arbitrary PID-kill fallback.
5. Restricted attempt hosts/providers do not inherit9. Their lifecycle is proven
   by actual ownership/cgroup/journal reconciliation, not leaking lock access into
   untrusted attempts. No D18 topology change or new service is introduced.

### Entrant and stale file retirement sequence

An entrant that cannot get the same inode's EX|NB lock rejects startup **before
rewriting runtime/platform/handoff files**, even if shell PID died. Parent SIGKILL
with surviving child remains locked by child9. Entrypoint SIGKILL with surviving
parent remains locked by parent9. A child that never closes its descriptor blocks
new startup; do not replace inode or infer death from a PID cache.

After all lifetime holders die/close, lock acquisition alone is insufficient:
native attempt descendants may survive without9. Entrant enters a root-controlled
**recovery-only parent boot phase** before publication/admission. Preserve prior
handoff and generated runtime files. Read authentic prior boot/image/reader/pool/
node/store closure; validate existing FileWorkerOwnershipStore supervisor authority
and actual recorded cgroup/claim namespace. Under its existing withSupervisor
lock, run NativeWorkerOwnership.supervise's #recover (actual record/cgroup
reconciliation), recoverNativeWorkerAttempts with preparationCleanupReconciliation,
then retained source/ledger reconciliation. This is a proposed reordering before
new runtime emission, not today's emit-first shell behavior.

The C1 refactor splits nativeBusterPreparationConfig's pool/node/launcher and
system-policy trust capture from its generated runtime.json read, allowing this
recovery-only phase to use the authenticated prior archived closure without
rewriting it. No current B pool or settings fills absent A. Missing prior closure,
unknown/unreconciled claim or unavailable cgroup observation rejects boot and
retains files/bytes. Only after every prior relevant ownership record is durably
quiescent/disposed (or authentically abandoned under its existing boot semantics),
disposed records finalObservation proves populated=false (authentically abandoned
old-boot records instead require verified boot-identity change and current
corresponding scope absence under existing recovery semantics), no pending allocation/control-channel
admission exists, and retained preparation recovery is settled may the same holder
retire old handoff and emit/publish new runtime + handoff. owner.isReady alone is
not a count of zero prior work; check actual durable records/observations.

Normal empty first boot has explicit absence of prior handoff plus no previous
records/cgroups; it is not assumed from a missing file while records remain.
Recovery-only phase never starts the new child or admits preparation. Old v2/
started-job reader/schema/config/package/effect archives remain immutable after
transport handoff retirement; retire a boot transport file only, not job closure.
Record retirement's original bootId/handoff digest and reconciled ownership receipt
under existing retention/accounting, never delete by age or pid liveness alone.

Publish same buster-system-generation-handoff.v1 regular file only after that
gate, using02 wx-temp/fsync/no-replace/root:builder0440/0750 sequence. Crash before
handoff gives no child admission; crash after handoff but before child startup
retains lock/file or needs gated retirement after holders die. Parent+child crash
with orphan attempt blocks until real reconciliation; shell death alone cannot
publish B. Child restart while same parent lives inherits9 anew, reads same A
bootId/digest and repeats exact fd3 association. Parent cannot retire A to B while
old child holds9 or an ownership claim remains unresolved. Genuine external pool/
archive access may block this proof, never be invented.

## R02-03 — exact run-authority receiving path, durable and confidential

Current per-effect fence is a distinct ResourceLock owned by attempt.attemptId.
Its renewal/assertCurrent cannot establish pipeline.run ownerLeaseId/epoch.
Current invokeConfidential has no resource fence. The proposed C5 correction
transports the actual typed authority through these named internal APIs:

| Sender → receiver | Proposed mandatory association |
|---|---|
| engine-run executePrepared / StageExecutor.#context → AdapterRuntime.invoke | Add required RunMutationAuthority argument supplied by current withRunMutationLock; ref includes runRoot canonicalId, lockId, ownerLeaseId, fencingToken and foundation/binding digest; live guard handle is process-local, never config/input payload |
| AdapterRuntime.invoke → EffectCoordinator.invoke/invokeConfidential | EffectInvocation gains internal runAuthority handle; reject missing handle, wrong attempt.runId/canonical runRoot/foundation or stale epoch before setup and after awaits |
| AdapterStarter.#wrap / AsyncLocalStorage AdapterInvocationOwner → #invokeDependency | Store same internal authority alongside phase/signal; dependencyInvocation inherits it; revalidate after await this.#start. Startup dependency without parent requires explicit startupAuthority from run foundation group in AdapterRuntimeOptions, not fabricated attempt/default authority |
| coordinator → DurableInvocation / confidential raw adapter | Explicit internal authority argument is retained separately from EffectRequest; mandatory runFence object supplied to both branches of versioned adapter invocation ABI |
| adapter raw implementation → actual I/O/provider entry | runFence.acceptEntrySync(effectIdentity, start) rechecks same run authority and existing effect fence (durable only), then synchronously invokes final I/O-start primitive; not a one-time assert at function entry |

RunMutationAuthority is created only by existing manager under authenticated run
mutation ownership; plugins cannot construct it from strings in user config.
Serialized `runAuthorityRef` contains only provenance/ref identities, no executable
guard/credentials and no policy values. Use existing journal/audit streams for
versioned authority-ref metadata if needed; no second lease epoch ledger. Original
EffectRequest identity/payload/idempotency semantics remain unchanged; do not
substitute epoch into stable effect identity to cause duplicate dispatch after
recovery. Recovery uses current authenticated run mutation epoch for a guard but
retains the original request/binding/grant/receipt identity.

### Exact synchronous acceptance implementation target

Add `RunMutationAuthority.acceptEntrySync` delegating to02
withCurrentGuardSync on the actual run lock manager. Inside one metadata guard,
revalidate signal/renewalError, owner/status/expiry/lockId/fencingToken and exact
run/foundation/binding association. For durable branch, enter actual effect lock
manager's withCurrentGuardSync for its attempt-owned resource lock, compare its
own lockId/owner/epoch/expiry, then final adapter/I/O start. Do not confuse the two
lock resources or use standalone assertCurrent() after releasing metadata guard.
Confidential branch has run guard but **no invented resource lock**.

Lock order: pipeline.run metadataMutex → distinct per-effect metadataMutex →
existing effect/events append mutex if needed. Current actual roots are run-mutation.ts parent `.run-mutation-locks` and
engine-runtime.ts::createAdapterRuntime `platform.storageRoot/resource-locks`.
They must be distinct manager roots;
reject accidental same manager/root nesting/reentrant acquisition. Never enter run
metadata while holding an effect metadata or events mutex. Awaited resource
acquisition/journal I/O occurs outside guards and is followed by final revalidation.
Do not retain a metadata mutex across a promise, network call or await.

Guard callback returns void/synchronous acceptance record, not a Promise. It may
assign a returned async I/O handle/task to a local variable while synchronously
calling the actual primitive; guard is released before awaiting completion.
“Adapter function returned a Promise” alone is not evidence I/O started: every
adapter must use runFence again at its last actual enqueue/open/spawn/read boundary,
including inside later queued continuations after any await. Missing runFence use
rejects/does not authorize execution. This is an explicit SDK adapter-invocation
ABI change for migrated C5 paths; historical readers retain old supported ABI.

### Actual effect chain receiving changes

- DurableInvocation.execute awaits dependency resolution/request/receipt/resource
  acquisition; revalidate after each before exposing recovered result or proceeding.
  #executeLocked awaits journal.requested and journal.accepted; after each final
  run recheck is mandatory. After accepted true, #invokeAdapter enters joint run+
  effect guard before raw adapter entry. Renewal/recovery receipts retain real
  per-effect fencing and original effect safety.
- If journal.accepted committed before run loss, accepted intent remains. No raw
  adapter/provider entry after loss; no fabricated failed/completed receipt implies
  no execution. Keep intent as unresolved/not-dispatched where actually proved,
  or uncertain where entry may have happened, and recover using original receipt
  semantics. No new idempotency key, grant, consumed-budget reset or rollback.
  Adapters that entered validly before loss may produce uncertain completion;
  cancellation/reconciliation is separate, not proof of rollback.
- Coordinator.invokeConfidential validates authority immediately before audit
  acceptance and raw invocation, supplies runFence, never logs secret payload/
  result or serialized guard. Missing/stale authority prevents both secrets.read
  and confidential network.http. No durable resource-fence default is fabricated.
- AdapterStarter's phase and parent authority both propagate through cleanup and
  nested invokeConfidential, including runtime-dispatch's secret await followed by
  network call. A new authority check after secret completion prevents dispatch
  based only on earlier valid parent view. A completed secret value is not copied
  into durable audit/snapshot just to prove a guard.

Concrete receiving implementations to patch:
secret-resolver/src/adapter.ts uses acceptEntrySync immediately around the actual
process.env named-key read, with original grants/name mapping; network-http
around performRequest's actual fetch(url, ...) call at adapter.ts:60 after origin/header/body
validation, and any subsequent redirect/retry enqueue (existing redirect policy
is retained). runtime-dispatch/dispatch-adapter.ts propagates authority to its
dispatch continuation; runtime-dispatch/adapter.ts secret/network dependencies
inherit parent authority via AdapterStarter, rechecking after secret await.
OpenClaw session discovery/pacedSpawn awaits cannot authorize later gateway calls;
each actual gateway network invocation reaches the same confidential network
receiver guard. transport-publisher's secret-read/network invocation after durable
publication preparation likewise uses inherited authority, not its old entrance
fence only. command/filesystem/Redis receivers require the same final spawn/open/
write/enqueue guard in their existing adapter files; migration cannot mark an
uninspected installed adapter compliant from its interface type alone.

Remote HTTP/worker servers continue their authentic request signature/grant/claim/
idempotency admission. A local run guard is not magically a remote distributed
mutex or provider grant. The final local authorized emission is synchronous under
guard; work already emitted before loss is accounted/reconciled by original
receipts, even if remote response/acceptance arrives later. No emission or retry
queued after loss may use an earlier valid view. If a provider requires additional
remote fencing semantics, its authentic ABI/receiver/grant must be explicitly
supplied before that profile can activate; no invented acceptance or new service.

Relevant startup effect routes: executePrepared adapters.start is supplied run
foundation startupAuthority; AdapterStarter.#activate and #invokeDependency after
awaited factory/start require the actual run guard before any dependency emission.
AdapterStarter.#activate's Promise.resolve().then(factory) must re-enter the
startup authority guard inside that queued callback, not before queuing it; the
startup context carries its internal runFence to nested dependency receivers.
Raw factory side effects must be disabled until it invokes this guarded context
rather than permitting ambient unguarded I/O; F-CODE/profile activation review
checks actual installed factories. Observer drainer/adapters cleanup retain
captured foundation/observer policy and cannot issue effects with stale run epoch.
Existing audit/tombstone/uncertain-effect recovery is retained, not a new author.

## Exact oracles and bounds

case-oracles.json extends preserved existing IDs only: the148 original C1 EFFECT
IDs consume active translated A/B entries and explicit expected boot receipts;
original C1 VAL/DELIVERY/MUT cases test abrupt lifetime loss, surviving child and
native quiescence. C5-COMPLETE-LEASE-LOSS/POST-DISPATCH-CRASH/ORIGINAL-FIRST and
existing canonical CMP-C5-BIND cover durable-accepted-before-loss, confidential
branch, nested-secret-await and startup-await loss. Original 13 cleanup mappings
and all original requirements/cases remain unchanged. No future test digest or
runtime result invented. Reference hashes pin actual source/archive/proposal
inputs, not a completeness proof.

Only03 additive files authored; 02 and review are frozen in source-pins.json.
No source/schema/test edits, validators, native processes, credentials/API,
image builds or Eval. Required next step is fresh independent material review;
all genuine deployed/secret/store/provider/archive proofs and global C0 remain
open. The author cannot accept its own03 proposal.

# Buster native attempt integration seam

Read-only implementation design, 2026-09-21. No production code, process, host or
cluster was changed for this assessment; no native case is marked passed.
Author: `release_alias_fresh_review`, working independently of the parallel Prism
configuration changes. This prepares the implementation of BUSTER-ENGINE-001/004.

The production seam is **one Buster specialist host per ordinary attempt, and one
host for the entire retained-fixture lifetime**. The DAG scheduler stays outside.
Wrapping the existing callback or spawning one process for the complete plan
cannot establish the required per-attempt budget. Existing V3 Core is reusable
but does not yet provide all integration edges described below.

Sources: [acceptance B1–B5/W1–W5](../acceptance-20260920.md),
[decisions D13/D14/D16](../decisions.md),
[71 individual cases](buster-native-cases-20260920.md), and the earlier
[resource boundary audit](attempt-resource-accountability-boundary.md).
Source hashes are in `../../evidence/buster-native-seam-20260921/source-sha256.json`.
This is static tracing; existing tests were inspected, not rerun or promoted.

## Actual production path and required movement

| Current function/file | Work currently performed | Required location and binding |
| --- | --- | --- |
| `remote-plan-runtime.ts`, `BusterRemotePlanRuntime.start` | Calls service recovery, then opens HTTP admission | Open only inside recovered native supervisor ownership lifetime; verify actual role pool before accepting jobs. |
| `remote-plan-service.ts`, `BusterRemotePlanService.#execute` | Persists running, creates job paths, decodes embedded archive, runs `safeExtract`, constructs capabilities and runner | Keep bounded job admission/dispatch outside. Give archive materialization/extraction its own durable job-preparation ownership, limits and identity; it is shared preparation, not falsely charged to each attempt. Move the capability factory into the specialist host. |
| `runner.ts`, constructor/`run`/`#executeNode` | Constructs V1 LocalWorkerRuntime; schedules DAG, retries and dependencies; keeps live provider objects for fixtures | Scheduler owns identities, durable dependency transitions and attempt handles. Replace callback interface and V1 runtime construction with mandatory native host execution. Persist retry/fixture bindings before launch. |
| `runner.ts`, `#executeAttempt`, before `operation` | Creates attempt/staging directories, copies full repository, resolves input values, builds invocation, captures logs | Move attempt-specific allocation, repository copying, input hydration and invocation construction into the admitted host. Merely moving `operation.execute` leaves this work unaccounted. |
| `runner.ts`, operation `execute`/`#context` | Loads provider, serves RPCs, validates/clones/encodes results, stages selected/error evidence | All run in the same owned host. `createBusterCapabilityRuntime` constructs all eleven concrete routes there. Do not proxy expensive capability execution back into the supervisor. |
| `runner.ts`, `cleanup`/`collectEvidence`/`finalizeResult` | Provider cleanup, evidence reads/hash/copy, log materialization, report package/source work, adapter processes, final result normalization | Remain inside the host until all owned work settles. Existing early and final executor checks remain, then the native supervisor drains and replaces provisional observations with kernel counters. |
| `runner.ts`, `#persistWorkerCompletion` | Reads/copies all evidence again into durable storage; builds result/producer record/closure and publishes completion | Move bulk evidence preparation and specialist serialization into the host. Final authoritative result/closure publication must follow native resealing; parent must commit bounded references/metadata, not reread/reencode all artifact bytes. Requires a V3-aware persistence boundary. |
| `runner.ts`, post-executor result assembly | Revalidates outputs, maps resources/reports, hashes AttemptResult, removes repository/staging | Move specialist output/report transformation and staging cleanup into host. Supervisor checks final binding and attaches authoritative native receipt. No post-measurement report adaptation or bulk source cleanup in shared service. |
| `runner.ts`, `#cleanupFixtures` | Calls retained in-memory provider cleanup, terminates it, removes repository | Replace with durable fixture teardown request and awaited native lifetime completion; do not retain `LoadedTestProvider` in the scheduler. |
| `remote-plan-service.ts`, `recover` and terminal cleanup | Marks interrupted jobs terminal without native reconciliation; removes sources only for all-completed attempts | Reconcile owned scopes first, then job/fixture ledger and explicit source ownership. Cleanup eligibility is proven quiescence, not successful business outcome or status text. |

No existing source-level `startNativeBusterFixture` call is wired into the
production service/runner. The helper is exported and exercised by protocol
fixtures; that is not a production fixture integration.

## Serializable admission and specialist host

Introduce a Buster-owned validated request, for example
`buster-native-attempt-input.v1`, carried in V3 envelope `operation.values`.
The exact schema is new work, not an existing API:

- Correlation: job ID, immutable plan identity/digest, node/execution IDs,
  attempt ID/number, claim/generation and source-snapshot identity.
- Selected resolved node and only its required dependency outputs/artifact refs;
  explicitly bind provider and report-adapter package IDs, versions and content
  digests. Do not serialize mutable RegistrySnapshot maps or executable callbacks.
- A supervisor-derived workspace/source lease reference and policy snapshot
  reference/digest. Caller-controlled executable, UID, cgroup path or arbitrary
  filesystem root is not authority. The supervisor constructs launch commands.
- Separate ordinary-attempt versus `fixture-lifetime` phase and the corresponding
  accepted V3 resource policy. Capability grants and package refs must agree with
  the node and immutable registry selection. Credentials remain private assigned
  process configuration or protected references, not persisted envelope values.

The new role entrypoint should mirror the useful mechanics of
`skills/prism/server/native-worker-host.ts`: bounded stdin read inside the cgroup,
V3 validation, signal cancellation, original `WorkerAttemptExecutor`, one JSON
provisional result on stdout. Buster business code belongs in Buster, not Worker
Core. Extract `runner.ts`'s specialist operation, validation and artifact/report
helpers into Buster modules usable by that entrypoint; do not instantiate another
DAG runner inside the host. Construct actual registry/package objects from trusted
local inventory, and verify the selected package bytes inside the owned host.

Keep one serializable outer result with provider result, normalized reports,
produced outputs, durable evidence references and relevant fixture-readiness
identity. It must satisfy the original V3 result binding before emission. The
supervisor is authoritative for final counters, cancellation/fault precedence,
claim expiry, receipt and fsynced delivery. A host's stdout is provisional.

The current V1 plan `limits.processes` is not a native task budget. D13 requires
new explicitly accepted `maximumTasks` and independently chosen CPU/memory budgets;
there is no fixed process→task conversion. V1 `cpuMillis` is actually compared to
CPU milliseconds by `resource-accounting.ts`; do not confuse this with pool CPU
millicores/rate (`cpu.max`). Preserve old records unchanged. Add explicit native
receipt/lifetime references in a versioned Buster result contract and update
Nova/remote-plan/observability consumers together. Do not hide V3 receipts in a
provider-specific details field or label a new task count as `maximumProcesses`.

## Capability subprocesses: existing primitives are not enough by themselves

`provider-loader.ts` launches the provider sandbox locally. After movement into
the host, ordinary child processes inherit its cgroup; detached process groups do
not escape cgroup ownership. Preserve the existing filesystem/network/plugin
sandbox restrictions. Provider-process `/proc` sampling must stop being the
source of authoritative whole-attempt accounting.

There is a concrete privilege/topology gap for capabilities with independent
cgroup/UID policy. `browser-playwright-runtime.ts` creates a new cgroup beneath its
configured root and can select a different UID; `direct-command-runtime.ts` also
passes a configured cgroup root. Reusing their global roots would move helpers
outside the attempt. A dropped-privilege native host cannot safely gain write
access to role-wide cgroups, and simply deleting stricter capability limits would
weaken existing behavior.

Use the existing trusted `NativeWorkerOwnershipLease.launchAuthority()` for
privileged launches, with a Buster policy adapter that permits only fixed helper
kinds and validated bounded launch specifications. The privileged supervisor may
perform that small authorization/launch step; helper work and its output/report
processing stay in the attempt host. The control authority must never expose an
arbitrary root command or writable cgroup path to provider code.

For helpers that require their own hard sublimits, the minimal honest topology is
an aggregate attempt cgroup with a host child and bounded helper children. The
initial assessment found a populated-leaf-only Core implementation. Subsequent
Core work now provides aggregate scopes and owned child groups in
`native-resource-scope.ts` and `native-owned-children.ts`; that original source
limitation is superseded. Buster production integration and actual-kernel proof
remain distinct requirements. Its adapter must track only owned child groups,
launch into them before exec, observe aggregate parent counters, drain all
children and dispose them before the aggregate. Preserve
controller/no-internal-process rules. If a helper can preserve all its
existing restrictions by inheriting the same leaf without its own cgroup, prove
that particular route and avoid an unnecessary child group. Do not assume this
is true of all eleven routes or replace required hard limits with sampling.

The fourth pipe already has one consumer in `BusterFixtureControl.run`, which
expects readiness messages and rejects repeats. A helper-launch protocol cannot
add a competing reader. Introduce one bounded role-owned dispatcher with explicit
message tags/identities and route fixture messages to the existing durable phase
logic. Generic Core keeps channel limits, process ownership and launch authority;
it must not import concrete Buster plugins. Ordinary attempt hosts need the same
launch adapter when using these privileged helpers.

## Retained fixtures and DAG scheduler

D14 needs no physical cgroup handoff: allocate the **fixture lifetime** scope and
separate budget before setup, keep the same binding through retained use and
cleanup, and emit its terminal receipt only afterward. Existing
`startNativeBusterFixture`, `FileBusterFixtureJournal`, `BusterFixtureControl` and
`awaitBusterFixtureTeardown` implement useful lifetime/phase mechanics:

1. Persist fixture admission; start native lifetime execution.
2. Host verifies cleanup support, runs setup and produces validated ready outputs.
   It obtains its own read-only native binding from the trusted launcher context
   (`KUBECLAW_NATIVE_SCOPE`, boot/device/inode); supervisor compares it with actual
   ownership. Never take binding authority from a remote plan.
3. Supervisor persists readiness, sends ACK and only then resolves `ready`.
4. Scheduler exposes dependency readiness/outputs without pretending the fixture
   has a terminal Worker result. Track `ready` and `completion` separately; retain
   role resource reservation throughout. Otherwise a max-concurrency-one fixture
   waiting for its own dependent would deadlock a scheduler based only on terminal
   results. Ordinary scheduling permits and physical lifetime reservations are
   distinct: releasing a setup scheduling slot never releases the fixture budget.
5. Persist consumer dependency/active-use bindings. On dependency completion or
   cancellation persist teardown intent, send it and await `completion`. A failed
   fixture completion fences dependent admission and cancels/settles already
   running dependents rather than leaving a stale ready result usable.
6. Host cleans up and finalizes evidence/reporting in the same scope, includes the
   readiness digest, and exits. Core drains/reseals; fixture journal seals against
   that original Core result. Only this proves lifetime completion.

A second deadlock is physical capacity, independent of the scheduler's running
map: ready fixtures can occupy every fixed role scope or all memory/task budget,
leaving no room for their dependent ordinary attempt. Before starting a fixture
set, reserve explicit progress capacity for the dependent work under the same
fixed pool, or reject the graph as unschedulable. A conservative admission rule
can reserve the concurrently retained fixture vector plus the largest required
ordinary-attempt vector and its scope slot; it must also account for multiple
jobs sharing the pool. If the graph requires concurrent consumers, reserve that
actual minimum progress set instead. The vector includes CPU reservation, memory,
tasks and scope count, not merely a Node concurrency counter. Current
`NativeWorkerResourcePool.reserve` admits individual scopes, not such a graph
reservation; a scheduler/pool reservation integration is missing. Never release a
live fixture's reservation, increase configured limits after failure, or let a
full set of retained fixtures wait forever for an unreserved consumer slot.

The fixture claim window/timeout must cover the entire declared lifetime,
including retained consumer use and cleanup, not just setup `node.timeoutMs`.
Existing helper clips timeout to claim expiry and provides no renewal operation.
Choose an explicitly accepted finite lifetime policy (or implement separately
fenced renewal before relying on it); do not extend an immutable accepted claim
in memory. Calibrate reserves from real workloads under D13, not guessed values.

Existing helper readiness includes ProviderResult but not the runner's final
mapped/durable artifact outputs. Add that bounded, versioned mapping before
scheduler admission; validate output/evidence integrity and package grants inside
the host before readiness. A passed provider outcome alone does not replace those
checks. Also resolve cancellation ordering with real dependent processes, not
only a fake readiness consumer.

On restart the current Core ownership recovery terminates/drains previous scopes;
there is no live host/control-channel adoption. Preserve that fail-closed policy:
record recovery teardown, reconcile fixtures and terminate/cancel associated
consumers, never replay historical readiness as current authorization. Native
launcher parent-death handling further makes transparent fixture continuation an
unsupported claim. External fixtures still require their own cleanup/reconciliation;
a drained local scope does not prove remote resources deleted.

## Journals, finalization and source reclamation

`NativeAttemptJournal` durably binds accepted envelope, original output and sealed
V3 receipt. `NativeWorkerOwnership` binds host boot/device/inode, fences unknown
scopes and persists final counters before disposal. `recoverNativeWorkerAttempts`
can regenerate interrupted/sealed results after ownership recovery. These are
reusable; they do not supply the missing job→attempt→fixture/source index.

Persist that Buster index before any scope can launch, including job preparation.
Each edge contains claim/generation/spec digest, source-snapshot reference and
native/fixture identity. Retry must first consult the original journal; generating
another random attempt ID on replay would bypass idempotency. Unknown or mismatched
edges stop admission/reclamation. Recovery order is host pool verification,
ownership reconciliation, native journal recovery, fixture reconciliation,
Buster job/result completion, then source cleanup, before HTTP readiness.

`FileDurableAttemptStore` currently accepts WorkerAttemptResultV1 and the runner
rewrites evidence/result/closure after the callback. A cast to V3 is not enough.
Extend the durable completion protocol with explicit native result binding:
host prepares immutable evidence and specialist projection; supervisor adds the
sealed native receipt/reference and commits bounded completion intent. Replay
finishes that intent without rerunning provider, report adaptation or copying all
evidence in the parent. Keep the old V1 reader for history, not an execution fallback.

The unavoidable parent work is authenticated bounded input transport, durable
admission/ownership/claim checks, capacity reservation, bounded helper launch
validation, kernel polling/drain, bounded output spooling/binding and authoritative
receipt/metadata commit. Declare and cap this trusted overhead separately. It
cannot recursively measure its own final receipt commit. Bulk source/evidence,
provider/capability RPC computation, reports and specialist finalization cannot be
reclassified as supervisor bookkeeping to escape B1.

Job archive decode/extraction is shared preparation with its own native owner;
per-attempt repository copy remains in each attempt owner. Recovery can reclaim
sources for failed/cancelled as well as successful attempts once all native owners
are quiescent and no live fixture or other source lease remains. Use the existing
FD-pinned `cleanupTerminalWorkspace` only after this gate. Persist cleanup intent
and its source identity, and allow bounded restart retries. Do not rely on PID
alone or job terminal metadata. Unknown host/scope binding retains data with an
explicit diagnosis; known live orphans must be drained and actually reclaimed.

Include `repository.tar.gz`, workspace repository/test-attempt copies, embedded
archive bytes in job records, staging, native output/journal/fixture records,
observability metadata and quota reservations in the runtimeRoot inventory.
Existing completed-only `remote-plan-compaction.ts` requires retained source proof
and validates original result/history. Test those original consumers. Define
failed/cancelled embedded-archive retention explicitly and apply D07; do not add
automatic deletion of authoritative evidence or logs. File bytes reclaimed and
metadata/result/record capacity still occupied are separate reported quantities.

## External BuildKit boundary

`container-build-runtime.ts` runs local buildctl and manifest verification; these
belong in the attempt scope. The remote/shared BuildKit daemon and build containers
do not. Current successful response contains digest/logs/duration/definition and
platform, not CPU/memory/task ownership or a server-side build reservation.
A local buildctl timeout/cancellation is not proof of remote drain.

Connect container.build to a separately admitted external build owner/lease with
fixed daemon/build capacity, per-build identity, cancellation/completion receipts
and restart reconciliation. Bind that receipt to the attempt and show its resource
scope separately. If no genuine remote accounting/enforcement is available, fail
that required capability at admission; do not publish zero external consumption
or call the local cgroup a whole-build budget. This edge intersects IFR-10/IFR-16
and is not satisfied by the present local process executor.

## Case-to-production map

All rows below are implementation/test destinations, **not passing evidence**.
The existing individual matrix retains each input and expected result.

| Cases | Required production seam and original mechanisms | Existing state |
| --- | --- | --- |
| B01–B04, B07–B14, B19 | New specialist host, extracted runner operation, capability factory, provider/report/artifact work, Core aggregate scope and final native result | Core kernels/process mechanisms exist; Buster host/wiring and full helper ownership do not. |
| B05, B40 | Service start/readiness within recovered NativeWorkerOwnership plus actual role pool/host binding | Core pool verifies controllers/counters/limits; service does not use it. |
| B06 | container.build external lease/accounting and original buildctl/registry path | External ownership/receipt missing. |
| B15, B38–B39 | Shared role pool admission plus actual scheduler reservation/node preflight | D16 renderer/pool mechanisms exist; Buster activation and actual selected host proof missing. |
| B16–B18 | Native cancellation/process control, owner drain, journal recovery, real Buster provider+helpers | Generic primitives exist; production integration and original-workload cases missing. |
| B20–B23, B25–B29, B32–B33, B36 | Separate fixture lifetime, durable readiness/teardown, DAG consumer bindings and recovery | Phase helpers exist; production scheduler/host and real dependent cases missing. |
| B24, B34–B35, B37 | V3 tasks/policy/receipt binding, versioned Buster result consumers, measured calibration | V3 Core types exist; Buster emits V1; no workload calibration established here. |
| B30 | Original Prism ordinary-attempt path alongside Buster fixture | Preserve its separate lifetime; cross-role real native proof still required. |
| B31, B41 | Original Nova dispatch, active images, actual host pools and scheduler reservations | Separate live acceptance; no local synthetic substitute. |
| W01–W05 | Owned job preparation/attempt completion, identity-bound cleanup eligibility across all outcomes | Extraction cancel/FD helper work exists; durable job-wide owner gate missing. |
| W06–W11, W20–W22 | Startup reconciliation and durable job/source/fixture index, finite recovery deadline and positive orphan reclamation | Core recovery exists; Buster service only changes job status and retains all restart inputs. |
| W12–W17 | Existing FD-pinned terminal-workspace helper and race regressions | Locally verified helper slice in original matrix; does not establish caller quiescence. |
| W18–W19 | Real service invokes that helper after native quiescence; repeated jobs show net bytes and quota usage | Production-native evidence missing. |
| W23–W26 | Original compaction/replay, failed/cancelled retention and whole runtimeRoot inventory | Completed compaction exists; required consumer/retention/quota proof remains. |
| W27 | Actual worker/pod restart on persistent volumes | Separate live acceptance. |
| BD01, WD01–WD02 | Resource/fixture/host contract and recovery/retention runbooks with actual limits, diagnostics and evidence | WD01 helper-only documentation exists; whole-point documentation remains open. |

## Minimal staged implementation without a permanent fallback

1. Extract a serializable Buster operation/input/result contract and specialist
   module from the existing runner. Add malformed identity/package/path/budget
   cases before implementation. Prove the extracted path preserves original
   provider/report/evidence behavior; do not call this native completion.
2. Complete the generic ownership topology/launch adapter where needed, and run
   a single original Buster attempt through V3 including repository preparation,
   capabilities, reports, durable evidence and final cleanup. Add native resource
   overload/cancel tests with actual children; missing delegation must fail.
3. Wire durable fixture lifetime, one control dispatcher, scheduler ready versus
   complete states and consumer/source bindings. Test actual dependent work and
   crash points before considering the native path production-ready.
4. Integrate V3 durable completion and job/source recovery, all terminal outcomes,
   positive orphan reclamation and original compaction/replay. Account for every
   retained byte class. Preserve historical V1 readers without mutating receipts.
5. Activate the single native production path through remote-plan CLI/service,
   selected host role configuration and all consumers. Remove productive V1
   LocalWorkerRuntime/callback fallback, authoritative provider sampling and
   global capability cgroup escape paths in the same cutover. Missing native or
   external BuildKit prerequisites reject admission; there is no catch-and-run-V1.
6. Fresh independent review must trace actual entrypoints and adversarial native
   workloads against B01–B41/W01–W27; update B-DOC/W-DOC with exact effective
   behavior and evidence. Keep kernel-local tests and later live deployment
   results distinct under D12. No new host action is authorized by this design.

These stages are reviewable implementation increments. Until all required pieces
are wired and genuinely tested, BUSTER-ENGINE-001/004 stay open; unconnected host
scaffolding, protocol fixtures or a process around the entire plan are not closure.

## Preparation boundary follow-up

The [owned admission and preparation assessment](buster-native-preparation-20260921.md)
traces an additional prerequisite: HTTP and job-store validation already decode
and buffer the embedded archive before extraction. A native tar-only move would
leave that work outside ownership. The coherent increment therefore includes
streamed ingress to an owned validator, immutable source leases, versioned job
metadata and explicit historical-record recovery. This follow-up records a
dependency and precriteria, not an implemented or accepted cutover.

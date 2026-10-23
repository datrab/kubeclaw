# Buster execution configuration

The Buster engine owns `settings.execution` in
[`buster-engine.config.json`](../../config/components/buster-engine.config.json).
That file contains the selected operator values. The
[component schema](../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json)
defines required fields and legal ranges; it does not supply missing values.
The retained legacy execution format requires 44 fields. Forty-two are positive integers;
`provider.heapFraction` and `reports.heapFraction` are numbers strictly greater than zero and at most one.
Unknown fields, missing values, strings and out-of-range values are rejected.
Fractions are rejected for integer fields.

The production factory reads one component-bundle snapshot. The service and
Runner validate the execution settings before creating their stores and retain
an immutable copy. The default provider loader, report finalizer and attempt and
admission stores receive values from that snapshot. Changing a caller's original
object does not change a running service's policy. Supply a complete new bundle
generation when changing operator values.

The retired Runner options `cleanupTimeoutMs` and
`maximumProviderResultBytes` are rejected even if their values equal the central
configuration. Do not add them alongside `executionPolicy` in direct callers.

## Provider execution

Paths below are relative to `settings.execution.provider`.

| Field | Meaning |
| --- | --- |
| `cleanupTimeoutMs` | Millisecond budget used for provider completion phases and retained-fixture cleanup. |
| `maximumResultBytes` | Maximum serialized provider-result size. |
| `claimGraceMs` | Additional claim lifetime beyond the node timeout and its completion-phase budgets. |
| `queueTimeoutMs` | Queue deadline offset from attempt issuance, in milliseconds. |
| `workerResultWrapperBytes` | Space reserved for the worker-result envelope beyond provider and report results. |
| `maximumProtocolBytes` | Cumulative child stdout limit across protocol messages, logs and results. |
| `terminationGraceMs` | Parent SIGKILL delay after termination request, only while the child has not closed. |
| `terminationTimeoutMs` | Final wait bound for actual child closure; must exceed termination grace. |
| `capabilityDrainTimeoutMs` | Bound for settling still-owned capability operations after process closure. |
| `minimumHeapMiB` | Floor for Node's old-space heap allowance, expressed in MiB. |
| `heapFraction` | Fraction of the resolved invocation memory used to derive the Node old-space allowance. |
| `maximumPendingCapabilities` | Maximum concurrent capability calls owned by one provider session. |
| `minimumOpenFiles` | Minimum descriptor allowance for the provider's sandbox process. |
| `artifactFileDescriptorReserve` | Additional descriptor allowance above the invocation's artifact-file count. |


The worker result budget is the sum of provider result bytes, aggregate report
bytes and wrapper bytes. Validation rejects a sum outside the safe integer
range. These settings do not replace a resolved node's execution timeout,
capability grants or resource limits.

The default Loader and each public Session constructor require the complete
immutable `{provider, observation}` policy from that same snapshot. Missing
settings fail before package snapshot or process creation. Normal execution and
cleanup recovery use the same policy; an observation-only constructor is invalid.
The shipped values are 500ms escalation, 1000ms final termination wait and 1000ms
capability drain. These are authored values, not fixed lifecycle constants.
The native supervisor independently escalates after twenty 5ms reap waits and can
close the child before the parent grace expires. That separate operational stop
policy is not centralized by this migration and remains open CONFIG work.
A drain timeout does not establish that pending capabilities settled.

Node old-space uses the larger of `minimumHeapMiB` and the floored product of
invocation memory in MiB and `heapFraction`. This is an old-space allowance, not
a guarantee of process startup: Node and other memory remain inside the resolved
workload's independent memory limit. The descriptor allowance is the larger of
`minimumOpenFiles` and artifact-file count plus the reserve; addition must remain
exactly representable. Unit conversions are fixed. None of these settings raises
the resolved memory budget or bypasses sandbox enforcement.


## Report normalization

Paths are relative to `settings.execution.reports`.

| Field | Meaning |
| --- | --- |
| `maximumAggregateResultBytes` | Serialized size budget shared by all normalized reports in an attempt. Each adapter receives the remaining budget. |
| `maximumSourceBytes` | Maximum source artifact bytes accepted by an adapter. |
| `maximumCases` | Maximum normalized test cases per adapter result. |
| `maximumFindings` | Maximum report-level findings per adapter result. |
| `maximumCaseFindings` | Maximum findings per normalized case. |
| `maximumTimeoutMs` | Upper bound on adapter wall time, also capped by provider cleanup time. |
| `memoryBytes` | Memory allowance passed to the report process. |
| `minimumCpuTimeMs` | Minimum CPU allowance; must be a whole number of seconds expressed in milliseconds. |
| `maximumOpenFiles` | File descriptor allowance passed to the report process. |
| `runtimeMemoryReserveBytes` | Runtime memory reserve added to the source/result memory model; shipped as 64 MiB. |
| `minimumOpenFiles` | Minimum accepted per-adaptation descriptor allowance; cannot exceed maximumOpenFiles. |
| `minimumHeapMiB` | Node old-space allowance floor in MiB for the report child. |
| `heapFraction` | Fraction of the selected report memory used to derive Node old-space. |


CPU allowance is the larger of `minimumCpuTimeMs` and adapter wall time rounded
down to whole seconds. Memory must accommodate the runtime reserve and selected
source/output limits: at least `runtimeMemoryReserveBytes` + three times `maximumSourceBytes` + twice
`maximumAggregateResultBytes`. The component validator and Helm enforce this
relationship. The report runtime requires this same immutable reports snapshot before creating
its runtime directory. Per-adaptation limits cannot exceed its selected capacities.
The CPU ceiling is derived as max(minimumCpuTimeMs, maximumTimeoutMs rounded down
to whole seconds), so it cannot fall below the selected CPU floor. The existing
HARD_LIMIT_EXCEEDED diagnostic now refers to the explicitly selected policy bound;
no separate hardcoded resource ceiling supplies another operational value.
Detail counts5000/5000/100 remain structural constraints of the versioned report
result schema. Node heap selection does not guarantee process startup or raise
the selected workload memory limit.

The descriptor domain deliberately changes: the former fixed minimum of 16 is
now the selected required floor (1..256), with maximum at least that floor. The
shipped floor remains 16; selecting a smaller value does not guarantee Node can
start. Positive consumer controls use working 64/96 descriptor allowances.

The shared process-input policy is a separate section of the same execution snapshot,
not a second report policy owner. Native supervisor timing remains separately owned.


## Process observation

Paths are relative to `settings.execution.observation`.

| Field | Meaning |
| --- | --- |
| `resourceSampleIntervalMs` | Recurring RSS sampling interval inside the provider child. |
| `processSampleIntervalMs` | Parent interval for observing the provider process tree. |

The parent passes the required child interval in the initialization message.
The child starts its recurring timer after validating that message and before
importing the provider. Reinitialization with the same value reuses the timer;
a different value is rejected. Startup RSS is recorded separately. Sampling
intervals are scheduling inputs, not a guarantee that every transient resource
spike is observed.

## Durable store capacities

Attempt-store paths are relative to `settings.execution.stores.attempts`.

| Field | Meaning |
| --- | --- |
| `maximumEvidenceObjects` | Maximum retained evidence-object count. |
| `maximumEvidenceBytes` | Total retained evidence byte capacity. |
| `maximumEvidenceObjectBytes` | Maximum bytes in one evidence object; cannot exceed total evidence capacity. |
| `maximumResults` | Maximum full attempt-result records not yet replaced by retained projections. Historical result identities in projections do not consume this count. |
| `maximumClosures` | Maximum full producer-closure records not yet replaced by retained projections. |
| `maximumMetadataBytes` | Maximum serialized attempt-store metadata size. |
| `maximumPendingEvidenceAgeMs` | Age after which uncommitted evidence is eligible for reclamation during store operations. |

Admission-store paths are relative to `settings.execution.stores.admission`.

| Field | Meaning |
| --- | --- |
| `maximumIngressBytes` | Maximum bytes accepted for one admission input. |
| `maximumRecords` | Maximum current admitted producer-record entries; retired entries do not consume this count. |
| `maximumBytes` | Canonically serialized admission-state capacity, including admitted records, quarantine, retirement entries and metadata. Normal admission and quarantine writes also leave the store's metadata reserve available. |
| `maximumQuarantineRecords` | Maximum retained quarantined-record count. |
| `maximumQuarantineBytes` | Canonically serialized quarantine capacity, including encoded payloads and metadata; this is not a raw payload-byte allowance. |

These capacities bound actual store writes. Increasing a capacity does not
authorize deleting history or replacing historical identities with current
configuration values. Pending-evidence reclamation concerns uncommitted evidence;
it is not a retention policy for completed results.

A provider completion first persists its result and completion intent. Admission
and closure publication follow. An admission outage can therefore leave a
durable completion awaiting recovery. Returning the durable result does not
declare observability complete. Nova's reconciler resumes admission and evaluates
completeness; the outage must not cause the completed provider to execute again.

## Other owners and verification limits

From the repository root, run `npm run verify:buster:execution-config` with the
normal development dependencies and native sandbox toolchain installed. It
builds the sandbox, checks the execution-policy TypeScript project and runs the
registry, policy, sampling, store, process-session and capability tests serially.
The TypeScript project checks its declared source closure; it does not provide
type checking for every JavaScript test. Run `npm run verify:lint:policy-delivery`
to check the lint rules and their actual Helm delivery into runtime mounts.
These focused commands supplement the original runner, provider, readiness and
native-isolation gates; they do not replace them. A command's presence does not
mean that the current source revision has passed it.

Job admission and dependency readiness remain separate sections of the Buster
component. Local worker drain, cancellation and replay settings belong to
[`worker-core.config.json`](../../charts/kubeclaw/files/config/worker-core.config.json).
Provider-specific request configuration remains part of the resolved plan.

This reference describes the implemented execution-policy slice. It does not
claim that every remaining provider protocol cap or plugin policy has already
been centralized, or that native isolation and deployment behavior have passed
their separate acceptance gates. Current implementation and verification status
is tracked in the [remediation register](../review/remediation/register.json).

## Shared process-input lifecycle

`settings.execution.processInput` supplies three required positive timer-safe integers:
`cleanupTimeoutMs` bounds native close plus owned-group acknowledgement (shipped 1500 ms),
`terminationGraceMs` schedules SIGKILL after TERM (shipped 250 ms), and
`acknowledgementPollMs` spaces actual group checks (shipped 10 ms). Grace must be
strictly below cleanup timeout and polling must not exceed that timeout.

Report adapters, Kubernetes fixtures and Tailscale exposure commands receive the
same immutable execution snapshot. Missing or invalid lifecycle policy, command
timeout or output capacity fails before spawning; the default command wrappers
no longer invent 30000 ms/1 MiB values. Their existing explicit per-command limits
remain in force. Failure to confirm actual close and owned-group disappearance
remains a cleanup failure; destroyed parent pipes do not prove child termination.

Unexpected signal and process-group observation errors are retained as causes of
`PROCESS_INPUT_CLEANUP_FAILED`. A failed TERM or timed KILL does not release
ownership: cleanup still waits for actual close within the configured deadline.
If that deadline expires, the aggregate also retains
`PROCESS_INPUT_CLEANUP_TIMEOUT` and any errors already observed. An absent process
(`ESRCH`) remains an expected signal outcome. This behavior is implemented;
runtime verification of the latest error-retention changes remains pending in
the remediation evidence.

The Tailscale caller's explicit 1 MiB output budget, Kubernetes manifestBytes*2
output relationship and each invoker's separate polling configuration remain
separate existing authorities. This focused migration does not close those D17
items, the Foundation process-group capture deadline (250 ms), or the native C supervisor stop policy. No native/live acceptance is implied.


## Selected report package snapshots

The current `buster-engine` author uses `pipeline-component.v4`, execution
`buster-execution.v3` and report policy `buster-reports.v2`. Every selected
profile supplies `execution.reports.packageSnapshot`:

| Field | Meaning |
| --- | --- |
| `maximumFiles` | File count ceiling for the adapter package, up to 2048. |
| `maximumBytes` | Aggregate package content ceiling in bytes, up to 67108864. |
| `timeoutMs` | Snapshot operation deadline in milliseconds, up to 30000. |

All three fields are required positive integers. These settings are distinct
from report artifact limits. They are captured once, frozen, and passed to the
actual source read, snapshot copy, and copied-package read. The shipped values
preserve the previous behavior. Missing or unknown selected values fail closed;
no selected generation receives hidden defaults.

`buster-original-execution.v3` retains the complete selected execution policy.
Replay uses those original values even if the current generation changes.
Original v1/v2 readers and their fixed historical package behavior remain
available without adding selected values to historical captures. A version/policy
mismatch is rejected before effects. This source integration does not establish
full native, archive or CONFIG C0–C6 acceptance.

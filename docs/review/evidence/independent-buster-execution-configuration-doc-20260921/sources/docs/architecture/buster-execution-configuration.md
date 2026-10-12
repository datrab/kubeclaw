# Buster execution configuration

The Buster engine owns `settings.execution` in
[`buster-engine.config.json`](../../charts/kubeclaw/files/config/buster-engine.config.json).
That file contains the selected operator values. The
[component schema](../../skills/common/plugin-runtime/foundation/config/swarm-components.schema.json)
defines required fields and legal ranges; it does not supply missing values.
All 28 execution fields are required positive integers. Unknown fields, missing
values, strings, fractions and out-of-range values are rejected.

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

The worker result budget is the sum of provider result bytes, aggregate report
bytes and wrapper bytes. Validation rejects a sum outside the safe integer
range. These settings do not replace a resolved node's execution timeout,
capability grants or resource limits.

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

CPU allowance is the larger of `minimumCpuTimeMs` and adapter wall time rounded
down to whole seconds. Memory must accommodate the runtime reserve and selected
source/output limits: at least 64 MiB + three times `maximumSourceBytes` + twice
`maximumAggregateResultBytes`. The component validator and Helm enforce this
relationship. Selecting larger application values does not remove the report
runtime's independent security bounds.

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

Job admission and dependency readiness remain separate sections of the Buster
component. Local worker drain, cancellation and replay settings belong to
[`worker-core.config.json`](../../charts/kubeclaw/files/config/worker-core.config.json).
Provider-specific request configuration remains part of the resolved plan.

This reference describes the implemented execution-policy slice. It does not
claim that every remaining provider protocol cap or plugin policy has already
been centralized, or that native isolation and deployment behavior have passed
their separate acceptance gates. Current implementation and verification status
is tracked in the [remediation register](../review/remediation/register.json).

# Worker Profiles, Engines, and Roles

Status: current configuration and contract reference
Audience: platform operator, worker implementer, pipeline author
Owner: worker core and Prism
Evidence: contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json; skills/worker/core/worker/local-runtime.ts; skills/worker/core/worker/native-pool-policy.ts; skills/prism/engine/worker-envelope.ts; skills/prism/server/agent-attempt.ts
Applies to: worker protocol v1, profile v2/v3, and current Prism workers
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Use the correct identity concept

KubeClaw uses “profile” and “role” for different boundaries. Do not substitute
one for another.

| Concept | Owner | What it controls |
| --- | --- | --- |
| Worker profile | Worker producer plus worker contract | Exact engine bytes, worker kind, capabilities, and measurable resource semantics accepted for an attempt. |
| Worker type | Worker profile | Scheduling/implementation class such as `prism` or `prism-agent`; it is not authorization by itself. |
| Engine reference | Worker profile | Versioned operation contract and content digest for executable behavior. |
| Agent role | Pipeline stage configuration | Dispatch hint such as a specialist role. It does not grant a worker capability or select a Linux identity. |
| Native pool role | Host-generated pool policy | Binds a worker process to one host cgroup pool, node identity, capacity, and ownership store. |
| Database role | Prism database bootstrap | Separates schema changes, application access, and read-only access. It is unrelated to worker profiles. |

## Current worker profile (`worker-profile.v3`)

The profile is a closed object. Every field is required. A producer computes
`profileDigest` over the profile without the digest field. An attempt carries
the whole profile, and the runtime accepts it only when the digest is one of
the profiles advertised by the worker registration.

| Path | Type and constraints | Meaning |
| --- | --- | --- |
| `schemaVersion` | Exact `worker-profile.v3` | Current native-attempt-tree resource contract. |
| `profileId` | Stable ID, maximum 256 | Human-meaningful profile identity. Changing behavior or resource semantics needs a new identity/digest. |
| `profileDigest` | Lowercase `sha256:` digest | Integrity binding for all other profile fields. |
| `workerType` | Stable ID, maximum 256 | Worker implementation family. |
| `coreContractId` | Versioned contract ID matching `name@positive-version`, maximum 256 | Worker-core contract implemented by this profile. |
| `engine` | Closed engine object | Exact operation implementation identity. |
| `capabilities` | Unique array, at most 128 stable IDs | Maximum capabilities the profile can use. Attempt `grantedCapabilities` must be no broader. |
| `resourceCapabilities` | Closed v2 capability object | States what resource quantities the host can measure for this profile. |

`engine` contains four required fields:

| Field | Constraint |
| --- | --- |
| `engineId` | Stable ID, maximum 256. |
| `contractId` | Versioned contract ID, maximum 256. |
| `engineVersion` | Non-empty string, maximum 4,096. |
| `contentDigest` | Lowercase `sha256:` digest of the selected engine content identity. |

The current v3 `resourceCapabilities` object is exact:

| Path | Required value |
| --- | --- |
| `schemaVersion` | `worker-resource-capabilities.v2` |
| `cpuTimeMs` | `{scope:"native-attempt-tree", unit:"milliseconds", measurement:"measured"}` |
| `maximumMemoryBytes` | `{scope:"native-attempt-tree", unit:"bytes", measurement:"measured"}` |
| `maximumTasks` | `{scope:"native-attempt-tree", unit:"linux-tasks", measurement:"measured"}` |

This exactness is a safety property. A generic “process count” does not describe
Linux cgroup tasks, and process-local sampling does not prove a complete native
attempt tree.

## Resource requests and host acceptance

A v3 attempt supplies closed `worker-resource-budgets.v2` fields
`cpuTimeMs`, `maximumMemoryBytes`, and `maximumTasks`. Each is either
`{state:"requested",limit:<positive integer>}` or
`{state:"unrequested"}`. The Prism native engine requires all three to be
requested and refuses a fresh attempt whose limit exceeds host policy.

The worker result reports resource accounting separately. A profile saying
`measurement: "measured"` is not itself an observation. The native worker must
return observed counters under the matching scope and unit.

## Current shipped Prism profiles

### Deterministic/native Prism engine

The native profile is `worker-profile.v3` with:

- `profileId`: `prism-design-engine-v3`
- `workerType`: `prism`
- engine `prism-design-engine`, contract `kubeclaw.prism-design-engine@1`,
  version `1.0.0`
- v3 native-attempt-tree measured resource capabilities
- capabilities `artifacts.read`, `artifacts.write`, `network.http`,
  `secrets.read`, and `telemetry.emit`

In production, `PRISM_ENGINE_CONTENT_DIGEST` must be a lowercase `sha256:`
digest. Development can derive a local identity, but that fallback is not a
production trust proof.

### OpenClaw agent launcher

The agent launcher remains `worker-profile.v2`:

- `profileId`: `prism-openclaw-launcher-v2`
- `workerType`: `prism-agent`
- engine contract `kubeclaw.prism-agent-launcher@1`, version `2.0.0`
- capabilities `openclaw.agent` and `artifacts.write`
- resource capability schema v1 with CPU time, maximum memory, and maximum
  processes marked `unavailable` for the `local-cli-process-tree`

This profile is honest about the boundary: Node child-process launch does not
produce trustworthy complete child-tree resource accounting in this
deployment. Do not interpret unrequested budgets or unavailable measurement as
zero use.

## Profile v2 compatibility

Profile v2 has the same top-level and engine fields as v3. Its
`worker-resource-capabilities.v1` uses `cpuTimeMs`, `maximumMemoryBytes`, and
`maximumProcesses`. Each metric declares:

- `scope` (non-empty string),
- its fixed unit (`milliseconds`, `bytes`, or `processes`), and
- `measurement`: `measured`, `sampled` with positive `sampleIntervalMs`, or
  `unavailable` with a non-empty reason.

Use v2 only with a v2 attempt/result contract. Do not rename
`maximumProcesses` to `maximumTasks` without moving to the v3 contract and a
native attempt-tree enforcement boundary.

## Worker registration and capacity

`LocalWorkerRuntime` receives operator/composition inputs:

| Option | Requirement or default |
| --- | --- |
| `workerId`, `workerType`, `coreVersion` | Required strings; the registration contract validates their final form. |
| `protocolVersions` | Required list; duplicates are removed and values sorted. |
| `profiles` | Required profile list; each digest becomes an admission allowlist entry. |
| `capacity` | Required integer 1–4,096. |
| `drainTimeoutMs` | Optional positive timer-safe integer; default 300,000. |
| `cancellationTimeoutMs` | Optional positive timer-safe integer; default 30,000. |
| `replayLimit` | Optional integer 1–1,000,000; default 65,536 accepted attempt IDs. |

Registration publishes total, available, and active capacity. Admission also
checks lifecycle state, worker binding in the claim, queue/claim deadlines,
protocol, profile digest, replay, and active capacity. Capacity is an admission
count, not CPU or memory capacity.

## Native pool policy

Host preparation, not an attempt envelope or mutable worker environment,
creates the native aggregate policy. The file must use an absolute path, be a
regular root-owned file, not be group/world writable, and be at most 65,536
bytes.

| Path | Requirement |
| --- | --- |
| `schemaVersion` | Integer `1`. |
| `role` | Exact role requested by the worker, currently `prism` for the native Prism supervisor. |
| `nodeName` | Non-empty host node identity. |
| `policyDigest` | 64 lowercase hexadecimal characters. |
| `cgroupRoot`, `ownershipRoot`, `nodeIdentityFile`, `runtimeIdentityFile` | Normalized absolute paths other than `/`. |
| `maximumActiveScopes` | Positive safe integer. |
| `limits.memoryBytes`, `limits.tasks` | Positive safe integers for aggregate memory and Linux tasks. |
| `limits.cpuQuotaMicroseconds`, `limits.cpuPeriodMicroseconds` | Positive safe integers; runtime additionally requires both at least 1,000 and CPU period at most 1,000,000. |

The native worker verifies the actual cgroup v2 filesystem, aggregate
`memory.max`, disabled swap, `pids.max`, `cpu.max`, domain type, peak counters,
and writable kill boundary before it claims readiness. A policy file alone is
not capacity proof.

## Selection and precedence

1. Host deployment selects the pool role and aggregate capacity.
2. Worker composition advertises exact profiles and count capacity.
3. The attempt selects one advertised profile by its complete digest and asks
   for a subset of its capabilities plus resource budgets.
4. Worker admission checks the attempt, then native admission compares budgets
   with host policy.
5. Stage `agentRole` can influence dispatch routing inside an adapter, but it
   cannot bypass any of these checks.

Do not add a profile by changing only a pipeline document. The worker producer,
worker registration, host capacity, engine bytes, and dispatcher must agree.

## Change impact and errors

A content digest, engine contract/version, capability, resource semantic, or
profile field change produces a different profile digest. Existing stored
attempts retain their original profile. A fresh worker can accept them only if
it still advertises that digest and implements the matching contract. Native
pool policy changes require host preparation and worker restart/readiness; an
attempt cannot raise aggregate limits.

Common signals are `WORKER_LOCAL_PROFILE_UNSUPPORTED`,
`WORKER_LOCAL_PROTOCOL_UNSUPPORTED`, `WORKER_LOCAL_CAPACITY_EXHAUSTED`,
`WORKER_LOCAL_ATTEMPT_DUPLICATE`, `WORKER_NATIVE_POOL_POLICY_*`,
`WORKER_NATIVE_POOL_LIMIT_MISMATCH`, `PRISM_NATIVE_PROFILE_NOT_ACCEPTED`, and
`PRISM_NATIVE_BUDGET_NOT_ACCEPTED:<metric>`. Correct the producer/worker/host
agreement; do not rewrite a persisted attempt or digest.

> **Source evidence — profile and host boundaries**
>
> **Claim:** A worker profile binds engine content and capabilities, local admission matches its digest, and native aggregate capacity comes only from a trusted host policy.
>
> **Implementation:** [profile-based local admission](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/worker/core/worker/local-runtime.ts#L89-L107); [attempt checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/worker/core/worker/local-runtime.ts#L155-L173); [trusted pool policy loader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/worker/core/worker/native-pool-policy.ts#L18-L52)
>
> **Contract or setting:** [engine identity fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json#L98-L120); [v3 profile fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json#L122-L165)
>
> [CPU and memory capability semantics](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json#L882-L934); [task capability semantics](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/contracts/pipeline-worker-core/v1/schemas/pipeline-worker-core.v3.schema.json#L935-L955)
>
> **Test evidence:** [worker contract check](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-pipeline-worker-core-contracts.mts#L1-L45)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Contract validation and local cgroup checks do not establish cluster scheduling capacity or external service availability.

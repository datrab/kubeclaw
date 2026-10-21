# Operator configuration

Centralization is in progress. Six Prism worker settings, two shared native
transport settings, three resource-policy settings, nine supervisor settings and
three Control service-policy settings, the Control listener port and three Studio
settings now come from the six component files referenced by
[`swarm.config.json`](../../charts/kubeclaw/files/config/swarm.config.json).
Remaining platform, native-worker, Buster, Nova and deployment settings still use
their existing loaders; this document does not claim a fully centralized system.

The physical author map is:

| File under `charts/kubeclaw/files/config/` | Required settings |
| --- | --- |
| `prism-control.config.json` | Control policy/listener plus `dispatchTimeoutMs` |
| `prism-studio.config.json` | Studio listener, Control origin and deadline |
| `prism-worker.config.json` | `ingress` and native `supervisor` |
| `prism-execution.config.json` | shared Prism `resourcePolicy` and `maximumResultBytes` |
| `buster-engine.config.json` | `preparation`, `admission` and `dependencyReadiness` |
| `worker-core.config.json` | `localRuntime.drainTimeoutMs`, `cancellationTimeoutMs`, and `replayLimit` |

Each document has `schemaVersion: "swarm-component.v1"`, the corresponding `owner`,
and `settings`. The entry has `schemaVersion: "swarm-entry.v2"` and six fixed
relative references. Every configurable value is explicit, including nullable
values; neither schemas nor code fill missing settings. This migration preserves
all existing authored values and does not complete plugin/Orchestrator-Core/host configuration.

`prism-control.config.json → settings` contains the following Control policy fields plus the separately described required `dispatchTimeoutMs`: 

| Key | Type/unit | Current authored value | Consumer |
| --- | --- | --- | --- |
| `pipelinePreferenceSubject` | null or `user-` plus 24 lowercase hex digits; authenticated user ID | null | platform authorization and persisted personal-history selection |
| `artifactRoot` | normalized absolute non-root directory | `/var/lib/prism/artifacts` | Control content-addressed artifact store and artifact PVC mount |
| `port` | integer TCP port, 1–65535; zero/random assignment rejected | `8080` | Control HTTP listener, probe targets, Service target, Envoy local backend and Control destination NetworkPolicies |
| `studioPublicUrl` | absolute HTTP(S) URL without credentials, query or fragment | `https://prism-studio` | Studio link in the design-set response |

Null disables pipeline personal learning; it does not select an implicit user.
The configured user must already be the intended authenticated subject. A request
cannot select a different subject. The Studio URL is a public base location; the
route appends its project/document query. The artifact root must name the mounted
persistent directory. Changing its path changes the mount location of the existing
artifact PVC, not the content-addressed layout or backup retention policy.

Remove `PRISM_PIPELINE_PREFERENCE_SUBJECT`, `ARTIFACT_ROOT` and
`PRISM_STUDIO_PUBLIC_URL` from Control's startup environment; the shared startup
loader rejects them even when empty. Remove Helm `control.pipelinePreferenceSubject`
too. Edit the complete central document and use the normal release path. Both roles
validate the document, but only Control consumes these policy fields. The running
Control captures an immutable snapshot before asynchronous signing-key I/O; later
file or environment changes take effect only on a new startup. Malformed paths or
URLs now fail before serving requests instead of during request handling.

An older Control image may itself declare `ARTIFACT_ROOT`. Removing a Pod env
entry does not remove that image default, and setting an empty value is also
rejected. Rebuild the Control image from the corrected Dockerfile and select it
through the normal versioned release flow. On a Docker-capable verification host,
run `bash scripts/check-built-runtime-image.sh prism-control <image-reference>`
from the repository root. That existing gate now passes inherited image environment
to the shipped loaders. Local declared-ENV tests are not a substitute for this
built-image check. See the [image correction and evidence](../review/remediation/implementation/control-image-environment-20260921.md).

Backup jobs retain their separate `ARTIFACT_ROOT` mount transport. PostgreSQL and
service secrets remain external Secret material. SPIFFE mode, generated peer IDs,
Other Service/Envoy endpoints and listener ports still require their coordinated upstream
migration; classification of their generated reads is not centralization of their
authors. Historical discovery omitted local-helper credential reads, so its fourteen
Control rows are not a complete Control credential inventory. See the
[Control policy criteria and evidence](../review/remediation/implementation/config-control-policy-20260921.md).

| Author key under `prism-worker.config.json → settings.ingress` | Type/unit | Current value | Consumer |
|---|---|---|---|
| `maximumActiveRequests` | positive integer, requests | 16 | HTTP work admission |
| `maximumProbeRequests` | positive integer, requests | 4 | separate health/probe admission |
| `maximumConnections` | positive integer, connections | 128 | HTTP server connection limit |
| `requestTimeoutMs` | positive integer, milliseconds | 120000 | request-body receive deadline |
| `maximumInputBytes` | positive integer, bytes | 16777216 | HTTP request body, native attempt journal, process input and host stdin |
| `shutdownTimeoutMs` | positive integer, milliseconds | 120000 | complete worker shutdown deadline |

The existing in-memory native settings projection combines these explicitly owned fields:

| Author file | Settings key | Type/unit | Current value | Consumer |
|---|---|---|---|---|
| `prism-execution.config.json` | `maximumResultBytes` | positive integer, bytes | 67108864 | Control HTTP response stream and worker durable result journal |
| `prism-control.config.json` | `dispatchTimeoutMs` | positive integer, milliseconds | 900000 | Control dispatch request, including response body consumption |

The worker and transport settings are explicit author values, not fallback defaults
in the runtime. Each is required and at most 2147483647. Work plus probe reservations must fit
within the connection limit. Request-body and shutdown deadlines are independent:
shutdown cancels outstanding work rather than waiting out its request deadline.
At startup, shutdown must strictly exceed the authored supervisor close plus drain
budgets. Helm applies the same check and additionally requires shutdown strictly
below the Pod termination grace. Neither check compares the request-body deadline.
These HTTP admission counts are not Linux task limits or native-worker attempt
budgets.

`requestTimeoutMs` sets Node's request-receive timeout, not a precise per-request
timer. Node checks incomplete requests periodically; this worker retains the
default 30-second checking interval. A small configured timeout can therefore
produce its HTTP 408 roughly one checking interval later, and a delayed event
loop can add further delay. The local behavior test deliberately uses the
unchanged interval and observes a real 408 after about 30 seconds. Do not use
this setting as a hard subsecond response-time guarantee. The shutdown deadline
is a separate lifecycle timer.

Edit the responsible component file and use the normal render/release/GitOps path.
Prism's chart references the entry and all six component files through explicit
repository symlinks; `helm template` and `helm package` include the complete bundle. There is no manual
copy or second editable configuration. The generated ConfigMap is mounted
read-only in both Control and Worker; its checksum triggers both rollouts when
configuration changes. Both roles capture settings at startup. It does not reread settings for each
request, and modifying a running ConfigMap alone is not a completed rollout.

Release materialization permits only the explicit relative aliases recorded in
[`release-configuration.mjs`](../../scripts/updates/release-configuration.mjs): the
Prism entry, six component files, both schemas and the shared Helm validator;
Kubeclaw also references both canonical schemas. Edit the canonical targets,
never independent chart copies. All linked target bytes must belong to the selected
image build's source commit; configuration changes require a matching successful build.
Both chart packages must contain the entire bundle and shared validation source.

`SWARM_CONFIG` is required and names an absolute entry path. Both deployed charts
select `/etc/kubeclaw/swarm/swarm.config.json`; there is no home-directory fallback.
The loader resolves the entry once to its physical ConfigMap generation and reads
all six references relative to that directory before activating any consumer.
The snapshot is frozen and never hot-reloaded. Local operators must publish a
complete coherent bundle and keep it unchanged while loading. Observed changes
are rejected; a stable pre-existing manually mixed bundle cannot be identified
as such without an external publication contract. No adversarial ABA guarantee
or manually maintained digest index is claimed.

Kubeclaw no longer copies or injects secrets into operator JSON. Init removes only
the two formerly generated `/config/swarm.config.json` and
`/runtime-config/swarm.config.json` files, rejecting nonregular or multiply linked
objects. Lint-file copying remains separate. Former `swarmConfigJson` Values input
is rejected even when empty. Secrets remain external; never put webhook values
into component documents.

Missing files, malformed JSON,
unknown keys, missing values, wrong types and conflicting limits fail before
Control or Worker startup. The loader does not coerce strings or silently use old defaults.

The former environment settings `PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS`,
`PRISM_WORKER_MAXIMUM_PROBE_REQUESTS`, `PRISM_WORKER_MAXIMUM_CONNECTIONS`,
`PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS`, `PRISM_WORKER_SHUTDOWN_TIMEOUT_MS` and
`PRISM_NATIVE_MAXIMUM_INPUT_BYTES`, `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` and
`PRISM_NATIVE_DISPATCH_TIMEOUT_MS` are
rejected, even if they equal the authored value. Remove them when migrating.
The former Helm value `worker.shutdownTimeoutMs` is also rejected. The chart
schema rejects `worker.native.maximumInputBytes` and `native.maximumInputBytes`;
there is no Helm override for these limits. `worker.native.maximumResultBytes`,
`control.maximumWorkerResponseBytes` and `control.nativeWorkerDispatchTimeoutMs`
also fail rather than silently creating a second authority. Secrets remain
external and retain their existing authentication checks; they are neither
accepted in this operator section nor included in effective setting objects.

`maximumInputBytes` measures bytes of the serialized JSON attempt, not object
count or JavaScript string length. The HTTP limit retains the existing 422 error
(`Prism attempt request is too large`) before authentication/execution. A body
within the limit must still pass authentication and contract validation. The
native journal and process independently enforce this same input budget. The
supervisor receives the HTTP startup snapshot; it does not reread configuration.
Each child receives `PRISM_NATIVE_ASSIGNED_INPUT_BYTES` in its closed, generated
environment. This is an internal transport, rejected if set on the operator
process; do not configure it in a Pod or shell. A spawned child's stdin parser
rejects input over that assigned budget. This setting neither increases memory
reservations nor proves that a host has available native capacity.

`maximumResultBytes` counts serialized UTF-8 bytes, including JSON syntax. Control
rejects an oversized worker response with `PRISM_NATIVE_RESULT_BODY_LIMIT` and
cancels its stream. The worker journal rejects oversized sealed result receipts
with `WORKER_NATIVE_JOURNAL_RESULT_LIMIT`; an admitted but unsealed attempt does
not become a successful receipt. Keep this budget large enough for complete
receipts, including lifecycle/resource diagnostics. This limit does not replace
the attempt's specialist-result or stdout/stderr limits.

`prism-execution.config.json → settings.resourcePolicy` is a required object with exactly:

| Author key | Type/unit | Current value |
|---|---|---|
| `cpuTimeMs` | positive safe integer, cumulative CPU milliseconds of the native attempt tree | 60000 |
| `memoryBytes` | positive safe integer, attempt-tree memory bytes | 8589934592 |
| `tasks` | positive safe integer, Linux tasks including threads | 2048 |

These resource values permit integers through 9007199254740991; they are not
Node timer durations and do not inherit the transport timer ceiling. A schema-valid
value is not evidence that the selected host can provide it. At supervisor
composition, memory and tasks must each fit the selected root-owned pool policy;
otherwise startup fails with `PRISM_NATIVE_POLICY_EXCEEDS_POOL:<metric>`.
Cumulative CPU time is not compared to the pool's CPU quota or period: those
express a CPU rate, not a total execution budget. Concurrent capacity still
requires the existing pool reservations and actual host checks.

Control and Worker freeze this policy at startup. The producer receives Control's
snapshot explicitly and does not read environment settings for each attempt.
The worker admits new V3 budgets against its snapshot and maps requested CPU,
memory and Linux-task values to native process limits. A new request above any
policy maximum fails with `PRISM_NATIVE_BUDGET_NOT_ACCEPTED:<metric>`.
The three old keys `PRISM_NATIVE_CPU_TIME_MS`, `PRISM_NATIVE_MEMORY_BYTES` and
`PRISM_NATIVE_TASKS` are rejected even when empty or equal to the author value.
There is no equivalent Helm override; edit the canonical author and roll out both
roles. Historical V1 process counts are unchanged and must not be relabeled as
Linux-task counts.

An already accepted business identity retains its persisted original envelope
and budgets when retried, even after a policy change. The worker's recovery path
preserves that existing admission; changing the current policy is not a retroactive
cancellation mechanism. Explicit cancellation and recovery retain their separate
contracts. Root-owned pool and kernel checks remain mandatory; local configuration
and admission tests do not prove native execution.

`prism-worker.config.json → settings.supervisor` contains these nine required values:

| Key | Unit | Current value | Consumer |
|---|---|---|---|
| `uid` | child Linux UID | 1000 | native launch command |
| `gid` | child Linux GID | 1000 | native launch command |
| `maximumOwnershipRecords` | records | 65536 | ownership store and attempt journal metadata |
| `maximumOwnershipBytes` | serialized bytes | 67108864 | ownership state and journal metadata |
| `maximumOutputBytes` | combined stdout/stderr bytes | 33554432 | process capture, durable output and journal reservation |
| `maximumJournalBytes` | retained bytes | 68719476736 | journal admission/storage budget |
| `pollIntervalMs` | milliseconds | 20 | native resource observation interval |
| `drainTimeoutMs` | milliseconds | 10000 | launcher and owned scope drain |
| `closeTimeoutMs` | milliseconds | 105000 | process close, cancellation and control settlement |

All are positive integers through 2147483647, except `maximumJournalBytes`,
which permits integers through 9007199254740991. UID/GID zero remains forbidden,
as before. These are explicit authored values; the supervisor no longer has
numeric environment fallbacks. `maximumJournalBytes` includes pending reservations
and metadata headroom, so admission may reject before physical disk bytes reach
that number. Neither byte setting performs automatic truncation or deletion.
A schema-valid value does not establish sufficient disk space, process capacity,
or a measured safe shutdown duration.

Remove `PRISM_NATIVE_UID`, `PRISM_NATIVE_GID`,
`PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS`, `PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES`,
`PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES`, `PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES`,
`PRISM_NATIVE_POLL_INTERVAL_MS`, `PRISM_NATIVE_DRAIN_TIMEOUT_MS` and
`PRISM_NATIVE_CLOSE_TIMEOUT_MS` from operator environments; startup rejects every
one, including empty strings. Remove the former Helm `worker.native.closeTimeoutMs`
key too: the chart rejects it. Edit the complete canonical supervisor object and
roll out the configuration through the normal release path. Both mounted roles
validate and freeze the same document; only Worker consumes these supervisor
settings. Running processes retain their startup snapshot.

The generated `worker.native.nodeName`, `namespace` and `policyDigest` binding
remain in the host-preparation values file. Root-owned pool policy, node/runtime
identity, cgroup paths, launcher and image identity retain their existing authority
and checks. This migration neither changes those authors nor makes ordinary unit
or filesystem tests evidence of privileged UID/GID switching or kernel drain.

`dispatchTimeoutMs` covers the entire Control-to-Worker HTTP exchange, including
waiting for headers and consuming a streamed body. Expiry aborts that HTTP
request; it does not certify native process termination or erase its durable
attempt identity. Recovery/retry must retain the same accepted identity. Changing
the authored file affects new process startups, not an already loaded snapshot.
A Node timer is subject to event-loop scheduling, not a hard real-time deadline.

Validate the slice with:

```sh
node --test skills/prism/tests/swarm-worker-config.test.mts skills/prism/tests/swarm-input-limit.test.mts skills/prism/tests/swarm-native-settings.test.mts
node --test tests/verification/deployment/prism-swarm-config.test.mjs
helm template prism charts/prism --namespace default -f charts/prism/ci-values.yaml
```

The Helm example uses synthetic CI image and node references and must not be
applied to a cluster. Built-image CI additionally runs the actual shipped loader
in both Prism Control and Worker images with the mounted author file through `scripts/check-built-runtime-image.sh`.
Local loader and Helm tests do not prove that an image was built or deployed.

## Control listener and stable discovery

Author `prism-control.config.json → settings.port` in the same canonical file mounted into Control.
Control captures one frozen composition before product signing-key I/O; its HTTP
listener and service configuration use that same snapshot. Changing the file after
startup requires a rollout; the chart's existing config checksum triggers one.
`PORT` is rejected by Control even if empty or equal to the authored port, and
Control's image and workload no longer set it. Studio also rejects `PORT` and uses
the central settings described below. Worker also rejects PORT and uses its
component ingress.port; ingestion retains its separate listener authority. Database URLs, service credentials and trust identities
retain their existing owners.

The `prism-control` Service stays at port 8080 for existing discovery URLs; its
`targetPort`, Control probes, Envoy `control-local` and Control destination network
policies follow the authored process port. SPIFFE uses the existing 8443 service
and sidecar listener. These Service ports are topology contracts, not secondary
listener overrides. Ports 1–65535 are schema-valid; actual host/namespace bind
permissions and collisions still apply and startup errors are not hidden. A
privileged port is not guaranteed merely because the document validates.

The built-image gate now passes an explicit `prism-control`, `prism-worker` or `prism-studio` role
and tests that role's production loader with inherited environment intact. The
previous cross-role loader call inside each image is superseded: Worker, Control and Studio all
reject their retired PORT author. Local source/image-ENV probes do not replace
a Docker build or a deployed networking test.

## Studio listener and Control proxy

The required `prism-studio.config.json → settings` object has exactly three fields:

| Key | Type/unit | Current authored value | Consumer |
| --- | --- | --- | --- |
| `port` | integer TCP port, 1–65535 | `8080` | Studio listener, readiness/liveness probes, Service target and ingress NetworkPolicy |
| `controlTimeoutMs` | integer milliseconds, 1–2147483647 | `30000` | Control proxy request and response-stream deadline, starting after the incoming request body has been read |
| `controlUrl` | absolute HTTP(S) origin, optional trailing slash | `http://prism-control:8080` | Base origin for proxied Control requests |

Edit these fields in `prism-studio.config.json` under `settings`. Remove `PORT`,
`PRISM_CONTROL_TIMEOUT_MS` and `PRISM_CONTROL_URL` from Studio's environment:
startup rejects each old key even when empty or equal to the central value.
The former Helm keys `studio.port`, `studio.controlTimeoutMs` and
`studio.controlUrl` are also rejected. Missing fields, extra keys, invalid types
or out-of-range values fail before the listener starts. Studio validates the
complete referenced bundle and captures its settings at startup; a later change
requires a rollout. The chart mounts the whole bundle and includes all seven files
in the workload checksum.

The URL must not contain credentials, a non-root path, query, fragment,
backslash or control character. The standalone loader accepts HTTP(S) origins;
the Helm deployment supports only its existing Control Service on port 8080:
`http://prism-control:8080`, or the equivalent namespace-qualified
`http://prism-control.<namespace>.svc:8080` and
`http://prism-control.<namespace>.svc.cluster.local:8080`. It rejects arbitrary
external origins because the chart does not provision their network topology.
The Studio Service remains at port 80; its target follows the authored Studio
listener port. Control discovery remains at Service port 8080. Changing a
listener port does not change either Service's public port or guarantee that the
new process port can be bound in the selected runtime.

The proxy deadline aborts the upstream exchange, including a streamed response.
The response uses the timeout error path; an already-started response cannot be
replaced with a new HTTP status. It does not prove cancellation of a Control job.
`STUDIO_ROOT` remains an installation asset-path input, and
`PRISM_INGRESS_SECRET` remains externally supplied secret material. Neither is
an alternative network-setting author. Without the ingress secret, proxy requests
fail with `PRISM_STUDIO_PROXY_NOT_CONFIGURED`; a valid config alone does not
establish authentication.

The [Studio configuration and service tests](../../skills/prism/tests/studio-config.test.mts)
exercise the production loader and HTTP service; the
[canonical image check](../../skills/prism/tests/studio-canonical-image.mts)
requires the authored port 8080 in the isolated image. Source and Helm results
are documented in the [independent Studio review](../review/remediation/implementation/independent-studio-complete-20260921.md).
The actual image build/run and deployment remain separate open gates.

## Buster service admission

Edit `settings.admission` in `buster-engine.config.json`; Buster receives the
complete bundle through its explicit `SWARM_CONFIG` entry. The service CLI validates and captures one immutable snapshot containing
both admission and preparation before constructing its client and service. All
three admission fields are required positive safe integers (1–9,007,199,254,740,991);
unknown fields, missing fields, strings, fractions and out-of-range values fail startup.
Changing the file requires a new service startup; running jobs do not reload it.

| Field | Authored value | Effect |
| --- | --- | --- |
| `maximumActiveJobs` | 2 | Maximum simultaneously executing service jobs. |
| `maximumQueuedJobs` | 8 | New admission is rejected when this many accepted jobs are waiting. Known identical replay remains available; restart does not discard previously accepted jobs to shrink the queue. |
| `maximumConcurrentAttempts` | 64 | Per-job maximum declaration and sum of declarations reserved by active jobs. A waiting job starts only when both this budget and an active-job slot fit. |

These counts are not Linux tasks, processes, CPUs or native preparation slots.
Preparation slots cover staging/extraction; active jobs can continue after those
slots are released. The FIFO scheduler can leave capacity unused while its first
waiting job cannot fit. Reducing the attempt budget below a durably accepted job's
declaration makes startup recovery persist that job as failed with
`BUSTER_REMOTE_CONCURRENCY_EXCEEDS_SERVICE_LIMIT`; it does not silently raise the
budget. Queue admission rejects with `BUSTER_REMOTE_ADMISSION_FULL`. This migration
preserves existing scheduling/recovery behavior and does not prove host capacity.

Remove `BUSTER_V2_MAX_ACTIVE_JOBS`, `BUSTER_V2_MAX_QUEUED_JOBS` and
`BUSTER_V2_MAX_CONCURRENT_ATTEMPTS` from the environment, even if empty or equal to
the central value. Remove `maximumActiveJobs`, `maximumQueuedJobs` and
`maximumConcurrentAttempts` from the old Buster runtime JSON. Both retired author
paths now fail with `SWARM_CONFIG_LEGACY_OVERRIDE`. The image's former queue ENV
was 8 and overrode local fallback 16; the single central value preserves the
effective image value 8. Do not copy those old fallbacks into generated runtime
JSON. Source-attestation keys, tokens and trust settings retain their separate
external authorities; they are not copied into the central operator policy.

The canonical ConfigMap and existing checksum rollout supply this document; there
is no new Helm admission override. No image build, native isolation proof or live
Git/Argo rollout is implied by these configuration tests.

## Worker listener component migration

The Worker listener is authored only by `prism-worker.config.json`
`settings.ingress.port`, explicitly 8080 in the canonical profile. The integer
range is 1–65535. Remove Worker `PORT` from launch environments and `worker.port`
from Helm values: even empty or equal values are rejected. Missing configuration
fails before native initialization. The Worker captures the validated setting
once; configuration changes require restart/rollout. Host bind permissions and
port collisions still apply.

The public `prism-worker` Service remains 8080; its target, Worker probes,
Envoy `worker-local` destination and plaintext Worker network-policy edges follow
the authored port. SPIFFE ingress/service 8443 and sidecar routing remain unchanged.
This does not centralize all service topology or secret/trust settings. The
role-specific image gate keeps inherited environment intact and checks the actual
Worker loader. Source tests cannot substitute for an actual built-image or native
worker-process proof. See the [Worker listener criteria](../review/remediation/implementation/config-worker-listener-20260921.md).

Local author checks passed at the documented boundaries; fresh combined review,
positive native entrypoint and built-image acceptance remain pending.


### Local Worker Core policy

`worker-core.config.json`, owner `worker-core`, authors `settings.localRuntime.drainTimeoutMs` (300000), `cancellationTimeoutMs` (30000), and `replayLimit` (65536). All three fields are required; timers accept integer milliseconds from 1 through 2147483647 and replay capacity accepts integers from 1 through 1000000. The entry references this sixth component and both charts deliver all seven bundle files under the same immutable ConfigMap generation. Changing this component participates in the actual workload rollout checksum. There is no environment override or low-level constructor default.

Buster reads the complete bundle once before startup and passes the immutable policy through production service composition and prepared execution into the default Worker Core runtime. Replay capacity counts retained accepted attempt identities inside each prepared-job runtime until their claims expire; a second job receives a separate runtime. It is neither durable replay history nor a process-global admission queue. The existing Buster path does not call Core drain, so this migration does not add a Buster drain lifecycle. Core drain waits `drainTimeoutMs`, cancels remaining attempts, then waits `cancellationTimeoutMs`; its actual consumer tests are separate from Buster replay propagation. Custom low-level runtime injection still requires an explicit policy but does not prove that the injected runtime implements it.

## Buster dependency readiness

Set both fields under `settings.dependencyReadiness` in `buster-engine.config.json`. The existing bundle reference is the only configuration entrypoint; there is no separate environment or Helm-values override.

| Field | Explicit canonical value | Required bounds and effect |
| --- | --- | --- |
| `maximumExecutionMs` | 1000 | Safe integer 1–30000 milliseconds; maximum duration of one dependency process. |
| `maximumOutputBytes` | 65536 | Safe integer 1–1048576 bytes; combined stdout and stderr ceiling for that process. |

Both fields are mandatory even when `container.build` is disabled. Validation never enables that capability or starts a probe. With it enabled, the actual service invokes the configured buildctl executable against its configured BuildKit address. Concurrent readiness requests share an in-flight check; completed results are not cached. Timeout, excess output, spawn failure or unsuccessful exit make functional readiness unavailable. New jobs and accepted replays are checked before acceptance/start; terminal replays remain readable without a dependency probe. Shutdown cancels the active check and awaits closure. These limits apply to the readiness process, separately from build execution budgets. Readiness is availability evidence, not BuildKit isolation.

Remove `dependencyReadiness` from the former generated/runtime JSON before upgrading: presence is rejected even for null, empty or equal-valued objects. Missing fields, strings, fractions and out-of-range values are rejected instead of receiving defaults. Direct service API callers must also supply the complete policy. Update and publish the complete config generation, render the relevant chart, then restart/roll out the process; existing instances retain their captured policy. The owner contributes to the config rollout checksum. Liveness `/healthz`, initialization `/bootstrapz`, and dependency readiness `/readyz` remain separate.

Controlled executable tests establish policy propagation and process enforcement; they do not establish actual buildctl availability, a built image, a working BuildKit daemon, native isolation, or cluster activation. Those proofs remain separate. The process helper's fixed PATH/locale and other Buster runtime/provider settings are not migrated by this two-field change.


## Nova Core selected runtime policy

Author Core settings only in `config/nova/core.config.json` profiles. Every
supported Platform v2 input must explicitly select `corePolicySelection` with
`file` and `profile`. Relative policy paths resolve against the canonical
Platform author directory; normal Nova/Buster image copies are available at
`/etc/kubeclaw/nova/core.config.json` (not automatically selected). Missing or
incomplete profiles reject; no ENV or former-literal fallback exists.

The selected21 numeric leaves cover stage/observer memory, mutation lifetime and
renewal, journal deadline, audit bytes, separate resource metadata/provisional
locks and effect-journal inline bytes, and recovery capacities. Startup validates
and freezes selected values before registry activation. Retained runs select
their stored Core policy before recovery/resume/admin/retirement locks, even
when current policy B is unavailable. Legacy snapshots without it require their
original runtime. See the foundation configuration README for exact API and
programmatic constructor migration details. This does not establish full
Buster chart/image, authenticated source, native execution or global acceptance.


## Buster normal image and chart delivery

The Buster image build now emits the exact `buster` runtime package at `/app`
and both `buster-preparation` and `buster-runtime` selections from
`config/pipeline.config.json`. Helpers, pinned installer metadata and image proof
support live outside that package root; do not overlay files into `/app` or
mount a raw checkout there. The generated system configuration is installed at
`/etc/kubeclaw/config`. Native parent/child startup verifies the installed package
and captured selections before using the selected settings.

Run `npm run config:buster:sync` after changing canonical configuration and
commit the resulting `charts/kubeclaw/files/pipeline/buster-topology.json`.
`config:buster:check` and normal release materialization reject stale projections.
This shared chart topology is a derivative, not an alternate runtime author.
Remove retired `SWARM_CONFIG`, `swarmConfigJson`, `busterComponentFile` and old
`/etc/kubeclaw/swarm` runtime mounts rather than supplying equal-valued copies.

The image-record workflow extracts `/opt/buster-image-tools/buster-delivery.json`
from the exact digest-qualified built image without invoking its entrypoint.
Release collection retains that metadata; release materialization validates its
source revision, generation and namespace/release tuple, then transports its
exact expected parent receipt into `pipelineDelivery.buster`. The chart mounts
that receipt as a whole read-only ConfigMap directory at `/run/pipeline-delivery`
without `subPath`, and its content participates in the rollout checksum. Do not
hand-author, reconstruct or substitute an expected receipt from current source.
A release lacking extracted Buster metadata must build/record its image first;
old production release records are not silently upgraded.

Image proof support is test-only at `/opt/buster-image-proofs`, with Buster,
Foundation and SDK imports linked to the installed emitted package. Existing
actual BuildKit, browser and restricted-capability identity/cgroup proofs remain
required. Local package/render tests do not establish Docker installation,
UID1000 execution or native acceptance. No deployment is performed by generation
or verification. Other Buster service/browser policies still authored by the
entrypoint remain a separate externalization residual; this delivery migration
does not claim those settings have moved to the central owner.


## Selected Artifact Store capacities

The existing Nova `corePolicySelection` also selects required
`settings.artifactStore` in `config/nova/core.config.json`. The four explicit
fields are `maxArtifactBytes` (16777216), `maximumRecords` (100000),
`maximumStoreBytes` (268435456) and `maximumRecordBytes` (65536). These preserve
the former behavior; all must be positive safe integers. Both per-artifact and
per-record byte limits must not exceed the store limit. Record metadata and blob
storage retain their original independent accounting; this is not one combined
metadata-plus-blob quota.

Nova startup projects the selected values into
`kubeclaw.artifact-store:artifact-store` before registry configuration validation
and passes that captured configuration to actual adapter activation. Keep only
installation data such as `artifactRoot` in the raw Platform adapter entry.
Remove all four old limit keys from that entry: even equal-valued or null copies
are rejected as competing authors. No schema default or adapter fallback remains.
Direct programmatic adapter callers must supply all four explicitly.

Run snapshots retain the resolved policy and effective adapter configuration.
Recovery/resume uses policy A retained by that run without rereading current B;
missing legacy policy leaves require the original runtime, not new defaults.
Publish the complete selected policy and rebuild the normal image when changing
it. Existing live adapters keep their captured settings until restart. This
four-setting batch is separate from the State/Wait and Telemetry capacities
below; whole-package/native acceptance remains open.


## Selected State and Wait Store capacities

The same explicit Nova Core file/profile selection requires separate
`settings.stateStore` and `settings.waitStore` objects. Each has three required
positive safe integer fields: `maxEntryBytes` (1048576), `maximumRecords` (100000)
and `maximumStoreBytes` (268435456). These six settings preserve the former
behavior. The per-entry and complete serialized-store limits remain independent;
a smaller store limit is allowed and still constrains real reads/writes.

Nova projects each selected policy into the original registration
`kubeclaw.state-store:state` or `kubeclaw.wait-store:waits` before registry config
validation and actual activation. Keep installation `root` only in the raw
Platform entries. Remove all three old limit keys from each entry; null or
equal-valued copies are still rejected. Direct adapter callers must supply all
three explicitly; schema defaults and runtime fallback/coercion are gone.

The effective adapter configs and selected policies are retained in the run
snapshot. A resumed A uses its stored policy even when current B is absent.
Reading a projected retained Wait also requires its recorded `maxEntryBytes`;
missing old policy data requires the original runtime, never an implicit 1MiB.
This does not change Wait source identity, grants, projection ownership,
idempotency or retirement protocols. Publish the complete policy/rebuild normal
images; existing adapters retain their captured limits until restart.


## Selected Telemetry Store capacities

`settings.telemetryStore` in the selected Nova Core file/profile requires
`maxRecordBytes` (1048576), `maximumRecords` (100000) and `maximumStoreBytes`
(268435456). These three positive safe integers preserve the former behavior.
Per-record and complete serialized-store limits remain independent. Nova
projects them into `kubeclaw.telemetry-store:telemetry` before registry validation
and actual adapter activation, and retains that effective config in the run
snapshot. A resumed A uses recorded A even when current policy B is absent.

Keep installation `root` only in the raw Platform adapter entry; remove all
three limit overrides, including equal-valued copies. Schema defaults and
adapter fallback/coercion no longer exist. Direct programmatic callers supply
all three explicitly. Old snapshots missing required selected policy need their
original runtime, not new defaults. Rebuild normal images after publishing the
complete selected policy; existing instances retain their captured settings.

The record-byte limit still bounds the input JSON graph before redaction and
the stored redacted record. Secret/personal-field projection, graph/depth/node
checks, idempotency, owner identity and cancellation are unchanged. Agent
Observability's ingester delegates to this telemetry adapter and its evidence
observer delegates to Artifact Store; this adds no separate observer limits or
new dormant settings. Native and whole-package acceptance remain separate.


## Selected Operator and Transport delivery-store capacities

The selected Core policy requires separate `settings.operatorMessagingStore`
and `settings.transportPublisherStore` objects. Each requires
`maximumDeliveryRecords` (100000) and `maximumDeliveryBytes` (268435456) as
positive safe integers. These four settings preserve the former store behavior.
They select the actual durable delivery stores of
`kubeclaw.operator-messaging:operator` and
`kubeclaw.transport-publisher:publisher`, not task targets or sender identities.

Nova projects the values before registry validation and uses the captured
configuration at actual activation. Run snapshots retain these effective values;
recovery/resume selects stored A without reading current B. Remove both limit
keys from raw Platform adapter entries, including equal-valued or null copies.
Keep `deliveryRoot`, targets, endpoint/secret references and target payload policy
there until their separate receiving migration. Direct API callers explicitly
supply both store limits. No store schema default or adapter fallback remains.

A failed quota admission still follows the original durable reservation protocol;
this migration does not alter signed request bodies, delivery IDs, idempotency,
receiver receipts, pending/failure/retry records or retirement ownership rules.
Publish/rebuild the complete selected policy for new instances; existing
instances retain captured limits. Missing retained policy requires the original
runtime, not current config defaults. Target payload/default policies are not
claimed migrated by this store-only group. Original publisher test fixture's
non-local stage ID remains a recorded verification failure; neither its identity
nor the canonical stage-ID schema was changed to claim a pass. Native and
whole-package acceptance remain OPEN.


## Selected OpenClaw dispatch processing limits

`settings.openClawDispatch` in the selected Core policy requires
`resultReadMaximumBytes` (1048576) and `collectorWaitTimeoutSeconds` (15).
Nova projects them only into `kubeclaw.runtime-dispatch:openclaw` before registry
validation/activation and retains that effective config with the run. The HTTP
runtime-dispatch registration is separate and uses the HTTP byte profiles below. Remove both limit keys
from raw Platform entries; equal/null duplicate values reject. Direct activation
callers supply these top-level values plus the timing-profile map described
below, not per-target processing overrides. Targets are
captured/frozen at startup; retained A does not reload current B on resume.

The byte limit is a positive safe integer passed explicitly to the existing
no-follow local workspace result reader, which rejects missing or invalid limits.
It replaces that reader's old1MiB default only; it is not a new bound on remote
results, repository-adapter reads, structured collector outputs or writes. The
2048-byte result-path protocol limit remains separate and unchanged.

The collector setting is the requested wait budget in seconds for each
`agents_wait` call, not an overall session deadline or poll-backoff interval.
It accepts integral0..2147483 seconds (bounded for millisecond timer conversion).
Zero requests a nonblocking check. The receiving OpenClaw host can still clamp
it to its configured maximum. Direct collector reads validate it before any
request, so missing values cannot select an upstream default. Existing session
timeout, poll/max-poll limits, cancellation, collector identity and output
validation remain unchanged. Per-target model/prompt/network policy defaults
are not claimed migrated here. Local gateway protocol vectors and physical file
tests do not prove paid/native model or collector execution; global acceptance
remains OPEN.


## Explicit per-target OpenClaw timing profiles

The selected Core `openClawDispatch.targetTimingProfiles` is a required, nonempty
map. Each named profile authors all five fields in milliseconds except the count:

| Field | `standard` (former defaults) | `production-pipeline` (existing producer) |
| --- | ---: | ---: |
| `spawnIntervalMs` | 1500 | 1500 |
| `pollMs` | 1000 | 2000 |
| `maxPollMs` | 15000 | 15000 |
| `maxPolls` | 1800 | 1200 |
| `sessionTimeoutMs` | 1800000 | 1800000 |

Each raw Platform OpenClaw target explicitly sets `timingProfile` to one existing
name. The name `standard` has no implicit meaning: missing/unknown selectors
reject. Remove all five old timing fields from targets, including equal/null
copies. The only value author is the selected Core profile map; raw Platform
`targetTimingProfiles` overrides reject. Direct adapter callers explicitly supply
the map and target selectors. Distinct targets may select distinct complete
profiles; no generic merge or per-target value fallback is performed.

Existing supported bounds remain: spawn0..60000, polling at least10, positive
safe-integer poll count, maxPollMs at least pollMs, sessionTimeoutMs at least
pollMs and at most86400000. Every authored profile is validated, even unselected.
Values reach existing spawn pacing, exponential/capped polling, poll-count cutoff
and session deadline consumers. These remain separate from per-call collector
wait seconds. The normal production-pipeline producer now selects its preserved
profile; generation/source inspection is not a deployment/native success claim.

New runs retain both resolved timing policies and each target's selector in the
existing run snapshot. Recovery/resume/admin restore only the original processing
selector from that same snapshot, before preparation. A missing/broken current B
policy or changed B selector cannot replace A. Other current endpoint/model/
identity/grant/installation data still faces the unchanged pinned configuration
check; this is not permission to ignore changed targets. Missing old retained
profile data requires the original runtime, not reconstructed defaults. No graph,
owner, authorization or source-receipt protocol was added by this migration.

## Explicit HTTP runtime-dispatch byte profiles

Selected Nova Core `settings.httpDispatch.targetByteProfiles` is the sole author
for HTTP target body caps. `standard` preserves1MiB request and1MiB response.
Each HTTP runtime target explicitly names its `byteProfile`; there is no default
profile or target-level fallback. The complete closed profile contains
`maxRequestBytes` and `maxResponseBytes`, each integer1..8388608. Named profiles
support distinct target budgets; all profiles validate even when unused.

Nova delivers the selected map before original registry validation and activation;
raw adapter maps or former target byte fields reject even equal/null. Actual
receiver captures caps and preserves JSON UTF-8 boundary behavior: request before
network, response after JSON/status validation. This is not a streaming response
limit and does not replace network adapter caps, authentication or secrets.
Resume/recovery/admin restore original processing selector and Core values from
the same retained snapshot; endpoint/authentication/token/grants and target set
remain subject to unchanged configuration pinning. Missing original policy or
selector requires original runtime. Native and whole CONFIG acceptance stay OPEN.

### Nova committed-source acquisition budgets

For the standalone remote-gate CLI, opt into
`schemaVersion: "nova-remote-test-gate-runtime.v2"` and add
`corePolicySelection: {"file":"<central-core-file>","profile":"standard"}`
to its runtime document. Relative owner paths resolve from that runtime file,
not the process working directory. No source budget is authored inline there.
V2 also requires explicit `authentication: "bearer"` or `"spiffe-proxy"`.
Bearer requires the existing token environment-variable locator; proxy mode
forbids `tokenEnvironmentVariable`, even if equal-valued or unused. Missing,
unknown or malformed modes fail before creating gate state, rather than selecting
bearer implicitly. The closed v1 reader retains its original behavior.
The selected Core profile's `settings.sourceAcquisition` owns `timeoutMs`,
`maximumMetadataBytes`, `maximumStderrCharacters`, `cleanupTimeoutMs`,
`forceKillAfterMs`, and `pollIntervalMs`. Defaults formerly in source processing
remain 30000/65536/4096/1500/250/10 in the explicit standard profile. Task deadlines
may shorten but cannot extend the selected acquisition deadline.

The loader captures these values before creating the gate. Running gate instances
keep that capture if the current owner changes or disappears. Callers restoring
an original captured source policy pass it as the loader's existing third
argument; that path does not read the current owner. This does not introduce a
new durable binding ledger or claim a complete cross-restart CLI recovery
migration. The v1 runtime reader remains closed and preserves its historical
behavior; adding the v2 selector or inline source values to v1 is rejected.

### Versioned project compiler policy

The canonical `config/nova/core.config.json` now publishes
`nova-core-runtime-policy.v3`. Every profile explicitly carries
`settings.policyVersion: "nova-core-runtime-policy.v3"` and the required
`settings.projectCompiler` with `schemaVersion: "project-compiler-runtime.v1"`.
This is the supported runtime compiler contract, not activation of the earlier
experimental candidate or its membership/authority proposals.

`projectCompiler.repairBudget.categories` authors the independent `lint`,
`review` and `test` order limits; `maximumOrchestratorOrders` is separate.
`execution` authors `maxTechnicalRetries` and `timeoutMs` for module work.
`executionGroups.{source,cumulative,demo}.timeoutMs` supplies three separate
helper budgets. Standard values preserve the original generated graph exactly:
2/2/2 repair orders, one orchestrator order, one technical retry, 1800000 ms
module/cumulative timeout and 120000 ms source/demo timeout.
Review presence is a task declaration, not a configuration branch: only modules
with a declared Review stage receive the selected review budget. Mixed projects
need no duplicate profiles or per-module configuration authors. Attempt and
remediation totals remain derived from the applicable order budgets.

The real project CLI loads one Core selection relative to its canonical Platform
file, compiles with it, and hands that same immutable value to runtime validation
and new-run startup. New selected runs capture `registry.projectCompilerVersion`
and the complete original `registry.configuration.corePolicy`. Project recovery
reads that snapshot before reconstruction and never reads today's Core owner;
unsupported versions and partial original captures reject. Legacy graphs without
the compiler discriminator retain the original compiler even when a v2 Core
runtime policy exists. v1 Core publications remain supported for those legacy
callers, but a v1 document cannot carry the v2 compiler policy. The candidate
compiler entry still returns `activationAllowed: false`.

Notification `maxTitleChars` and `maxReasonCodeChars` cannot exceed 512 and 256,
respectively: these are the existing operator-message receiver's protocol bounds,
not new operator defaults. Central, registration and direct producer validation
reject unsupported selections before a publish effect.


Operator delivery additionally selects
`operatorMessagingPayload.payloadStructure.{maximumDepth,maximumArrayEntries,maximumObjectProperties}`.
The standard values preserve the existing protocol ceilings (20/1000/1000).
Stricter positive limits are supported; missing, oversized or duplicate local
values reject. Real delivery, receipt reconstruction and lookup receive the
captured target limits. The original durable projection validator deliberately
uses the fixed original protocol ceiling, not a live owner's possibly narrower
admission setting; it does not admit new deliveries or overwrite original records.

Compatibility qualification: unchanged compiler encodings and complete v1
runtime-policy captures remain supported. Older incomplete policy generations
must run with their captured original reader/source/schema closure. The current
loader never fills missing captured settings from current configuration or
former literals. This is not evidence that native historical reader replay has
passed; that acceptance remains separate and open.


Core v3 is the explicit structural-admission successor of v2; the compiler
contract itself remains `project-compiler-runtime.v1`. Complete original v1/v2
Core captures retain their exact original shape (no `payloadStructure` is
inserted). Their operator projection remains the original untagged receiver
contract, with the fixed protocol limits 20/1000/1000. Core v3 produces the
explicit `payloadPolicyVersion: "operator-payload.v2"` and required selected
`payloadStructure` at the receiving adapter. Missing/partial v3 captures or
unknown receiver tags reject; they cannot enter the legacy branch. This is a
versioned original receiver, not a synthesized configuration merge. Previously
incomplete historical native generations still require their original full
reader/source/schema closure and retain their separate acceptance gate.

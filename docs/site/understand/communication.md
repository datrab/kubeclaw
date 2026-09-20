# Communication: End-To-End Transport And Failure Contracts

Status: implemented paths documented; unavailable guarantees stated explicitly
Audience: platform operator, runtime maintainer, integration developer, security reviewer
Owner: runtime and platform maintainers
Evidence: contracts/pipeline-test-gate/v1; contracts/pipeline-worker-core/v1; skills/nova/core; skills/worker/core; skills/common/plugins/redis-transport; charts/kubeclaw; charts/prism; tests/verification/reliability
Evidence revision: `549dfe003d41fca50b85c3040029a74a817715d6`
Applies to: current Nova, Buster, Prism, Worker Core, specialist, Redis, registry, Git, BuildKit, Tailscale, and SPIFFE paths
Last verified: code, schema, chart, manifest, and focused test inspection on 2026-09-20

## How To Read This Page

A connection is safe only when its message, identity, time, ordering, storage,
and failure rules agree. A diagram can show direction, but it cannot show all
these conditions. The matrix below is therefore the primary communication
inventory.

“None” means that the implementation deliberately has no mechanism. “Owner
store” means the receiving domain persists the accepted operation. “Caller
journal” means Nova or the invoking runtime keeps the durable intent. A retry is
safe only when the row names an idempotency or identity rule.

## Complete Connection Matrix

| Sender → receiver | Purpose and schema | Transport / endpoint | Authentication and authorization | Timeout and ordering | Retry, persistence, and deduplication | Backpressure | Failure effect and recovery |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nova → Buster | Submit `buster-plan-job.v1`; read status, `remote-plan-result.v1`, and digest-bound evidence. | HTTP(S): `POST /v1/plan-jobs`; `GET` or `DELETE /v1/plan-jobs/:jobId`; `GET .../results/:digest` and `.../evidence/:digest`. | Bearer token of at least 32 characters, or loopback HTTP behind a SPIFFE proxy; capability and fixed plan/source grants are in the job. | One gate deadline; polling is at least 10 ms; cleanup defaults to 10 s. Submit precedes status and import. | Nova stores intent first. Job ID derives from idempotency key. Buster locks and stores one job. Retry uses the same ID. Import records pending before blobs and completes once. | Configured response/result ceilings, plan limits, Buster concurrency, and evidence byte limits. | Retry only classified transport/server failures within the deadline. Lost response causes status reconciliation, never a new job. Digest or identity mismatch blocks import. |
| Nova → Prism Control | Submit `prism.design-request.v1`; receive `202 waiting` or an approved archive. | HTTP `POST /v1/dispatch`. SPIFFE mode sends it through the local mTLS proxy; HMAC mode uses the configured Control endpoint directly. | SPIFFE peer allowlist for Nova, Prism Agent, and test runner; HMAC signature fallback when SPIFFE is disabled. The idempotency key and configured preference subject are mandatory. | Request body is at most 2 MB. Caller-specific deadline applies. Architecture revisions must move forward. | PostgreSQL stores the request before work admission. Dispatch idempotency starts one design round. Existing approved baseline is returned for the bound approval. | Body ceiling, database pool, agent-job admission, and one active bridge job. | Invalid identity, signature, transition, or request fails closed. A waiting response is resumed through durable Prism state, not a second design identity. |
| Prism Control → native Prism Worker | Execute `worker-attempt-envelope.v3`; receive `worker-attempt-result.v3`. | HTTP `POST /v1/attempts`; `/health`, `/bootstrap`, and `/ready` separate liveness and admission. | SPIFFE Control allowlist or body-bound HMAC with timestamp and one-time nonce. Worker profile, claim, package, capability, and attempt digests authorize work. | Envelope queue deadline, attempt timeout, claim expiry, and cleanup deadlines. Worker executes one admitted native attempt at a time. | Control operation store reserves idempotency identity and records terminal result before hydration. Conflicting results are rejected. | Input ceiling, one native attempt, declared CPU/memory/task/log/evidence budgets. | 503 means dependency, reconciliation, or busy; 422 means rejected input/execution. Reconcile stored operation and Worker journal before retry. |
| Prism Control ↔ Prism Agent Bridge / OpenClaw | Claim durable agent jobs and commit exactly three designs or one next revision. | Control agent-job HTTP routes through loopback Envoy; bridge listens on `127.0.0.1:18080` and polls each second. | SPIFFE Prism Agent identity at Control. Job ID and fence bind mutation tools. | Bridge dispatch timeout 30 s; control reads 10 s; one active job; accepted job fence lasts 16 minutes. | PostgreSQL owns job state. Stable session key and job fence prevent replacement. A lost launch becomes an explicit errored/needs-Nova state. | One active job, 2 MB bridge body, fixed attempt and model limits. | Do not spawn again after uncertain launch. Inspect durable job; Nova resolves `needs_nova`. Shutdown stops polling and terminates the owned process. |
| Nova stage → Forge or Echo via runtime adapter | `kubeclaw.implementation.v2` or the Echo review request; strict typed completion. | In-process capability call, then OpenClaw Gateway HTTP/MCP/ACP for the selected allowlisted target. | Core capability grant, target ID allowlist, named secret; optional verified workspace owner. OpenClaw controls model/tool access. | Target polling defaults 1–15 s and session deadline 30 minutes. One session identity orders all polls and result collection. | Core effect identity and runtime idempotency key; session identity is reconciled after lost response. Final artifact is stored by the stage. | Fixed prompt/context/output budgets; target response sizes; bounded session polls. | Parser rejection blocks the stage. Abort sends cancel/stop and must prove terminal state. Unresolved cleanup blocks retry to prevent duplicate agents. |
| Nova Core → stage | Invoke stage with `StageInvocationContract`; receive `stage-result.v2`, wait, effects, facts, and artifacts. | In-process module call for direct activation; isolated stage IPC when that activation is selected. | Registry snapshot, package digest, registration ID, role selection, stage capability grant, attempt lease and fence. | Attempt lease and abort signal propagate. Scheduler orders graph dependencies; stages do not select successors. | Run journal and attempt records are authoritative. Attempt number and effect idempotency keys prevent reuse. | Declared input/artifact limits, scheduler concurrency, effect limits, and isolation channel limits. | Invalid result or expired fence cannot change lifecycle. Core records failure and applies declared retry/repair policy. |
| Stage → adapter | Request one effect such as Git, artifact, secret, dispatch, Redis, or Buster transport. | In-process capability router; adapter can then use local or network transport. | Exact capability grant, operation, resource type and canonical ID; confidential calls hide secret results from ordinary stage data. | Caller abort and effect deadline propagate. Core journals intent before uncertain external work. | Effect ID and idempotency key bind retries. Adapter-specific reconciliation decides whether an unknown result can repeat. | Adapter request/response limits and bounded cleanup scope. | Unknown external outcome becomes reconciliation-required. Do not translate it into an ordinary stage retry. |
| Core → observer | Deliver lifecycle and telemetry events after authoritative state changes. | In-process observer callback; an observer may emit to Redis or another sink through a granted adapter. | Observer registration and narrow telemetry capabilities. Observer has no lifecycle-write grant. | Delivery follows committed lifecycle order; observer deadline applies. | Canonical journal is the source of truth. Sink delivery can deduplicate by event/idempotency identity. | Observer queue and sink bounds. | Observer failure can degrade visibility but cannot reverse or invent pipeline state. Replay from authority where supported. |
| Native supervisor ↔ unprivileged worker host | Carry role-defined control messages; process input/result use the Worker envelope/result contracts. | One duplex native control stream with 4-byte big-endian length framing; process stdin/stdout is separate. | Local process ownership, fixed executable, dropped privilege, attempt identity, cgroup, and journal. No network credential. | Single reader; writes serialize in call order. Attempt, close, poll, and cleanup timeouts come from native policy. | Native journal records accepted input, process result, spooled output, and sealed result. The framing layer has no message deduplication. | Per-message and total-session byte ceilings; stdout/stderr spool and result limits. Stream write backpressure is awaited. | Truncated, oversized, closed, or ambiguous channel fails the attempt. Supervisor terminates and drains the owned process tree before recovery. |
| Plugin → Redis | Publish transport payload or telemetry JSON. | RESP over `redis://` or TLS over `rediss://`; `AUTH`, then one Lua `EVAL`. Stream is `<prefix>:v2:<kind>:<encoded target>`. | Password is resolved through `secrets.read`; URL cannot contain credentials. TLS validates the server hostname in `rediss` mode. Capability must match publisher or telemetry adapter. | Configured timeout, maximum 300 s. Redis stream IDs order accepted entries per stream. | Lua checks a digest-derived dedup key, then `XADD MAXLEN ~`, then stores entry ID with configured TTL. Redis is transport, not run authority. | Payload ≤1 MiB; response ≤about 1 MiB; `maxLen` ≤1,000,000; socket pressure and timeout stop the call. | Connection, auth, protocol, timeout, or response failure rejects the effect. Reconcile by the same idempotency key; lifecycle recovers from Nova's journal. |
| OpenClaw observer → Redis | Write agent-observability v1 control or payload events and failed-control dead letters. | `XADD MAXLEN ~` to fixed `pipeline:agent-observability:{control,payload,deadletter}:v1` streams. | Observer Redis credentials and optional TLS; host policy controls which OpenClaw hooks enter the writer. | One queue drains control before payload. Each command has a configured timeout. Control retries use bounded exponential delay; payload writes try once. | Redis retains entries to approximate configured length. Runtime sequence/content suppression reduces duplicate observations, but there is no atomic Redis dedup key and no consumer acknowledgement here. | Separate bounded control and payload queues. Full payload queue drops payload; control can evict payload but cannot exceed its bound. | Failed control writes go to the dead-letter stream after bounded retry. If that write also fails, counters and warnings are the only evidence. Telemetry loss never changes lifecycle authority. |
| User → Prism Studio / Control | Browser session, project and revision work, approval, publication. | HTTPS Tailscale Ingress to Studio; Studio proxies `/v1` to Control. | Tailscale identity exchange, signed 15-minute session cookie, CSRF cookie/header for mutations, product-role checks. | Studio proxy timeout; disconnect aborts upstream. Revision CAS orders edits and approval. | PostgreSQL persists domain state. Operation and revision identities reject stale writes. | Request/body limits, pool limits, one publication per locked project path. | Authentication, CSRF, stale revision, validation, or publication evidence failure stops mutation. Reload authoritative revision and retry explicitly. |
| Private client → Tailscale-published service | Reach Prism Studio, Archviewer, Argo/Ops surfaces, or a temporary Buster fixture. | Tailnet DNS and Tailscale Ingress; Buster exposure returns a typed HTTPS endpoint and lease. | Tailnet device/user ACL plus service auth where present. Archviewer also requires Basic auth. Temporary fixture authority is namespace-lease and capability bound. | Readiness and lease deadlines are service-specific. Exposure must exist before tests use it and release follows consumers. | Platform routes have controller state. Buster exposure persists lease identity; it is not a general durable message queue. | Ingress/service limits and test concurrency. | DNS, certificate, ACL, readiness, or lease failure blocks that consumer. Release or retain according to cleanup policy; never reuse a stale lease URL. |
| Nova / Buster → Git | Clone or fetch source; create a local worktree; commit selected files; merge an exact revision. | Operator-configured Git SSH/HTTPS remote and local filesystem worktrees. No supported local Git-mirror service exists in the current repository. | Deploy key and host trust at Git transport; Core capability grants and workspace owner records for mutation. | Git command deadlines; expected parent and source revision impose order. | Git objects and refs persist. Attempt generation separates worktrees. Commit SHA and owner record bind identity. | Repository size, command output, path count, disk, and lock-wait bounds. | Stale parent, conflict, lock timeout, remote failure, or owner mismatch blocks. Reconcile refs before retry. A managed Git mirror remains roadmap work and has no current fallback contract. |
| Buster → BuildKit → OCI registry | Build an image, push immutable manifest/layers, verify digest, then let consumers pull it. | BuildKit client protocol to rootless BuildKit; OCI Distribution API to local registry; upstream pulls may use Docker Hub mirror. | Registry client configuration controls endpoints and credentials. Current lab local registry is anonymous HTTP; it is not production-grade HTTPS. | Build and push deadlines are provider settings. Manifest digest binds later verification and pull order. | BuildKit cache and registry blobs persist independently. Content digests deduplicate layers and bind the selected manifest. | Build context, output, cache, disk, concurrent build, and registry limits. | Build, push, digest check, or pull failure fails the node. Retry only after checking whether the digest exists. A mirror miss is not local-registry success. |
| Workload → SPIRE / Envoy → protected service | Obtain SVID, establish mTLS, and forward verified SPIFFE identity to loopback application HTTP. | SPIFFE Workload API over CSI socket; Envoy mTLS listener and local plaintext application listener. | SPIRE issues workload identity. Envoy validates peer trust domain and SAN. Application accepts forwarded identity only from loopback proxy and an exact peer allowlist. | SVID rotation is handled by workload API/Envoy. Application request deadlines still apply. | No message persistence or deduplication at mTLS. Domain stores retain accepted operations. | Envoy connection/request limits plus application limits. | Missing SVID, invalid SAN, unlisted peer, non-loopback forwarded header, or proxy failure denies the request. Restore identity/proxy; never fall back silently to anonymous remote HTTP. |

## Endpoint Catalogue

| Service | Important endpoints | Caller identity | Main limit or failure response |
| --- | --- | --- | --- |
| Buster remote plan | `/v1/plan-jobs`, `/v1/plan-jobs/:id`, `/results/:digest`, `/evidence/:digest` | Nova bearer or SPIFFE proxy | Configured response/result/evidence ceilings; contract or digest mismatch fails. |
| Prism Control | `/v1/dispatch`, agent job/tool routes, internal artifacts, user `/v1` routes | Nova, Prism Agent, Worker, test runner, or signed user session according to route | Dispatch body 2 MB; route-specific validation and database transaction. |
| Prism Worker | `/health`, `/bootstrap`, `/ready`, `POST /v1/attempts` | Control SPIFFE ID or HMAC principal | 503 for busy/dependency/reconciliation; 422 for rejected attempt. |
| Prism Agent Bridge | `/health`, `/ready`, `/v1/dispatch`, `/v1/design-set`, `/v1/revise` on loopback | Same-pod OpenClaw/Envoy path and durable job ID | 2 MB body; 30 s dispatch; 10 s job read. |
| Ops MCP | `/healthz`, `/mcp` on loopback 8080 in the chart | Shared bearer; optional Origin allowlist | Logs 64 KiB; Kubernetes 8 MiB/10 s; Hubble 2 MiB raw/192 KiB output/12 s. |
| Archviewer | `/healthz`, static document paths on 3456 | Tailnet route plus Basic auth for documents | No directory listing; 401/403/404 fail closed. |
| OCI registry | `/v2/` and OCI blob/manifest routes | Anonymous HTTP in the current lab service | Not suitable as the final production registry security posture. |
| Local registry | `registry-local:5001` Service to container port 5000, `/v2/` health and OCI routes | Anonymous in the current lab | ReadWriteOncePod storage and one Recreate writer; no TLS or registry authentication. |
| Docker Hub mirror | `registry-mirror:5000`, `/v2/` and pull-through OCI routes | Cluster network boundary; upstream Docker Hub policy applies | Cache is not source authority; a running mirror does not configure clients. |
| Redis | `redis-master.kubeclaw.svc.cluster.local:6379` | Password; optional TLS is adapter-specific | Streams and dedup keys are bounded transport state, not canonical run state. |
| Prism PostgreSQL | `prism-postgresql:5432` | Four chart-managed database identities and NetworkPolicy | Domain transactions stop when unavailable; restore database and artifact set to one recovery point. |
| LiteLLM | `litellm.kubeclaw.svc.cluster.local:4000/v1`; `/health/liveliness`, `/health/readiness` | Consumer API key and provider credentials | OpenAI-compatible model/embedding gateway; not lifecycle authority. |
| Prometheus / Grafana | Chart-managed scrape endpoints; Grafana NodePort 30030 in the lab values | Grafana existing admin Secret; scrape authorization is chart/target specific | Optional monitoring. Prometheus retains 15 days on a 20 GiB claim in the checked-in values. |
| Alloy → Loki | `POST http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/push` | Monitoring namespace/network boundary; checked-in Loki has `auth_enabled: false` | Optional log projection. Alloy positions persist on each node; Loki retains 720 hours in the checked-in values. |

> **Source evidence — service and optional monitoring endpoints**
>
> [Prism Services expose Studio, Control, Worker, ingestion, and their mTLS variants on separate ports](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/prism/templates/services.yaml#L1-L47).
>
> [The local registry binds Service port 5001 to container port 5000 and probes `/v2/`](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/my-values/infra/registry-local.yaml#L1-L106).
>
> [The mirror exposes port 5000 and names Docker Hub as its only upstream](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/my-values/infra/registry-mirror.yaml#L1-L94).
>
> [Alloy sends node log streams to the exact Loki push URL](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/gitops/platform/values/alloy.yaml#L1-L101).
>
> [Prometheus and Grafana values define credentials, persistence, retention, resources, and the lab NodePort](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/gitops/platform/values/prometheus.yaml#L1-L44).

## Detailed Transport Notes

### Nova And Buster

Nova creates the complete job before transport. The job contains the resolved
plan, signed source snapshot, repository archive identity, per-node grants,
concurrency, stage ID, and request digest. Buster stores admission under the
derived job ID. Status polling and cancellation address that same ID. Result and
evidence downloads include a digest in the URL; Nova hashes received bytes
before import.

> **Source evidence — remote calls and content binding**
>
> [The transport defines all five remote operations, authentication modes, response ceilings, and digest checks](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/core/test-gates/remote-dispatch.ts#L23-L197).

### Core, Plugins, And Worker Control

Core communication is an authority boundary even when it is an in-process
function call. Registry selection and a capability grant occur before the call.
The invocation context carries attempt identity, fence, abort signal, config,
and effect access. A result is data until Core validates and reduces it.

The native control channel deliberately knows nothing about message meaning.
It preserves message boundaries and provides one ordered writer, one reader,
and byte ceilings. The specialist role must define schema and durable phase
acknowledgment. This keeps binary framing reusable without making it a hidden
state machine.

> **Source evidence — bounded framing**
>
> [The channel validates limits, serializes writes, frames lengths, rejects a second reader, and detects truncated input](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/worker/core/worker/native-control-channel.ts#L1-L74).

### Redis

The Redis publisher sends `AUTH` and one atomic Lua operation on a fresh socket.
The script returns the earlier stream entry when the dedup key exists. Otherwise
it appends the payload with approximate stream trimming and stores the new entry
ID for `dedupTtlMs`. The dedup TTL must cover the caller's retry window. After
it expires, the same key can create another entry.

The current adapter is a publisher, not a consumer-group implementation. It
does not promise end-to-end acknowledgement, replay position, or lossless
retention. Consumers must define those rules separately. Redis interruption
does not change Nova's durable lifecycle record.

The OpenClaw observer uses different, fixed observability streams. It keeps
control and payload queues separate, drains control first, retries only control
writes, and sends exhausted control events to a bounded dead-letter stream.
This path intentionally favors lifecycle-shaped observations over large model
payloads under pressure. It still does not create a durable consumer contract.

Redis migration is a storage operation, not a live protocol negotiation. The
migration check preserves stream entries, consumer pending state, and absolute
dedup expiry. It also proves that a lost-ack retry returns the original entry
after restore. Stop writers, verify the snapshot digest, migrate to an empty
target, verify it, and then cut clients over. Do not let two Redis instances
accept writes under one logical stream prefix.

> **Source evidence — stream, atomic deduplication, and limits**
>
> [The adapter validates configuration and atomically deduplicates before `XADD`](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/redis-transport/src/adapter.ts#L1-L91).
>
> [Stream names include version, kind, encoded target, and a hashed idempotency key](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/redis-transport/src/stream-identity.ts#L1-L8).
>
> [The RESP decoder permits exactly the AUTH and command replies within bounded memory](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/redis-transport/src/resp.ts#L1-L67).
>
> [The OpenClaw writer applies queue priority, bounded retry, `MAXLEN`, and dead-letter handling](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts#L140-L255).
>
> [The native migration test preserves stream, pending-consumer, and dedup-expiry state](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/tests/verification/reliability/redis-migration.test.mts#L12-L83).

### SPIFFE And mTLS

Applications do not parse a remote client's self-asserted SPIFFE header. Envoy
terminates mTLS and forwards verified client-certificate identity to the local
application. The application then requires a loopback proxy connection and an
exact allowed SPIFFE ID. This two-part check stops a remote caller from adding
the forwarding header directly.

SPIFFE protects transport identity. It does not replace attempt, job, digest,
fence, capability, or application-role authorization.

> **Source evidence — application-side peer proof**
>
> [Worker trust accepts one URI identity, validates its form, checks loopback proxy origin, and enforces the exact allowlist](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/worker/core/worker/trust.ts#L1-L52).

### Git, OCI, BuildKit, And Tailscale

These paths move artifacts or expose services; they do not decide pipeline
state. A Git commit binds source. Git currently uses the configured remote
directly; the repository does not provide a supported Git-mirror service. An
OCI manifest digest binds image content.
A Tailscale lease binds a temporary private endpoint. Nova and Buster import
these identities into their own durable records before they use the result.

The local registry and Docker Hub mirror have different jobs. The local
registry stores KubeClaw build output on Service port 5001. The mirror caches
Docker Hub pulls on port 5000. A cache hit does not prove that a locally built
image exists, and a pushed local image does not prove that clients use the
mirror. Generated node, BuildKit, and runtime client configuration must select
the correct endpoint explicitly.

> **Source evidence — content and route wiring**
>
> [The Buster runtime starts rootless BuildKit with generated registry configuration](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/docker/buster-runtime-entrypoint.sh#L1-L38).
>
> [One generator produces node, BuildKit, and runtime registry client settings from the selected endpoints](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/scripts/registry-client-config.mjs#L57-L104).
>
> [Archviewer demonstrates a private Tailscale Ingress whose Cilium rule binds the exact owning proxy](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/templates/archviewer.yaml#L22-L53).

## Global Retry Rules

1. Retry an in-memory calculation when it made no external change.
2. Retry a transport call only with the same durable operation identity.
3. Reconcile a lost response before creating new work.
4. Do not retry an expired claim, stale revision, failed identity proof, invalid
   schema, digest mismatch, or authorization denial as a transient error.
5. Apply pressure at the narrowest boundary. Do not increase every byte, queue,
   or concurrency limit to solve one oversized request.
6. Preserve the authoritative record before returning an ambiguous error.

## Evidence Limits

Contract and focused tests prove parsing, identities, limits, deterministic
retries, and failure mapping. They do not by themselves prove live DNS, Tailnet
ACLs, TLS certificates, SPIRE issuance, NetworkPolicy enforcement, registry
retention, BuildKit isolation, Redis durability settings, or external model
behavior. Those claims need the matching deployment and live acceptance checks.

# READER-PLATFORM-01 — fresh platform-developer reader

## Scope and finding

Reader-only examination of the frozen public Markdown artifact. I did not inspect repository sources, linked GitHub evidence, package READMEs, internal reports, chats, handoffs, matrices outside the public pages, review folders, acceptance definitions, or scratch directories. No artifact was mutated, no command from a procedure was executed, and no live product run was attempted. This report is the only written output.

The public documentation supplied the requested component, ownership, dependency, and recovery answers. **This is a successful documentation trace reconstruction, not an executed request or recovery.** There are no concrete observed run IDs, commit IDs, job IDs, digest values, lease generations, stream entry IDs, or receipts in the registered fixtures. The identities below are the exact identity *fields* described by the fixtures. Calling them observed execution would fail the evidence boundary.

## Exact navigation and pages actually used

1. Started at `README.md`; its architecture route led to `understand/README.md`.
2. The architecture index routed to `understand/components-and-authority.md`, `understand/request-state-recovery.md`, `understand/pipeline-dependencies.md`, `understand/communication.md`, and `understand/worker-core.md`.
3. The root workflow route led to `use/workflows/README.md`; task input supplied the two registered examples under `use/workflows/examples/`. `understand/communication.md#complete-showcase-success-trace` independently links both examples. I read both complete JSON files.
4. I read `understand/pipeline-dependencies.md` completely. Its public pipeline map supplied the component map; no external diagram was supplied or used.
5. `understand/components-and-authority.md` supplied the Nova role/Core distinction, neutral Worker Core controls, Buster semantics versus Nova lifecycle interpretation, and Prism authority. An initial combined page read was output-truncated; I do not claim to have read its omitted remainder.
6. `understand/communication.md` supplied its complete showcase success section, dependency-failure decision table, global retry rules, and evidence limits visible in the returned output. An initial combined read was truncated; omitted sections were not treated as evidence.
7. The Redis fixture links led to `use/diagnose.md#redis-unavailable`, `understand/telemetry.md#openclaw-agent-observability-v1-path`, and `understand/data-and-state.md#redis-durable-delivery-not-product-authority`. I read selected Redis diagnosis lines 578–620, 688–705, 736–749; data/state lines 1256–1277; telemetry lines 132–249, 1529–1584, 1922–1944.
8. Architecture/dependency links led to `understand/platform-and-operations.md`: required/conditional/optional systems lines 24–61 and CNI lines 245–264. Worker Core page selected sections read: restart/reconciliation and result/receipt lines 778–851; safe retry lines 906–916. Request/recovery selected sections read again: restart lines 466–498 and uncertain effects lines 532–566.
9. `rg` was used only within these allowed public pages to locate headings and relevant text. Some broad initial output was truncated; subsequent targeted reads supplied deciding evidence. No external evidence URLs were opened.

## Dependency classes and consumers

The public dependency page defines five classes: **Core** (every durable run), **showcase baseline** (complete learning lab), **role** (active deployed role), **stage** (selected graph stage), **access** (human/operator route). A required baseline service is not an unconditional dependency of every possible Core graph.

- Nova durable run storage is Core-required and canonical. Nova is the deployable role; Nova Core is its deterministic graph, lifecycle, effect, recovery, wait and closure authority. Compiler, plugins and adapters are within the role but are not themselves Core authority.
- Worker Core is required for its declared Buster/Prism worker roles and selected attempts. It owns neutral admission, identity, claim/generation, capacity, deadlines, termination, durable result binding and cleanup controls. Buster owns test/node semantics; Prism Control owns design/job semantics; Nova interprets their results for the pipeline.
- Git origin is required showcase source infrastructure and consumed by Nova's selected source/workspace path. Exact commits and verified tree bytes matter, not branch names or successful SSH. No supported shared Git mirror/failover contract exists. Docker Hub mirror is not Git mirroring.
- Redis is required showcase baseline and a Nova/Buster readiness dependency in the checked-in profile. Portable use requires it only for selected Redis adapters/observers. It owns transport/stream and finite dedup state, never Nova lifecycle or Buster job truth.
- Prism PostgreSQL is showcase plus active Prism role-required, owned by Prism Control for projects, revisions, operations, requests/jobs, preferences and approvals. LiteLLM PostgreSQL is a distinct showcase/selected gateway dependency, owned by the model-gateway operator for model/key/accounting/gateway state. Neither is Nova's journal or Buster's job/evidence store. Credentials, volumes and restore groups are separate.
- Rootless BuildKit is showcase/Buster runtime-required and stage-required for container builds. Build worker/cache only, not lifecycle authority.
- Writable OCI registry is showcase-required and stage-required for builds, pushes or image pulls. Owns produced blobs/manifests; consumers must verify immutable digests. Checked-in Buster values alone do not select the registry-client endpoints/transport; deployment overrides are required.
- Docker Hub pull-through mirror is showcase-required/readiness input, but an optional replaceable cache in the portable pipeline/client contract. Eligible clients must explicitly select it; a ready mirror is not proof of routing. A cache miss can still require upstream availability.
- Tailscale is showcase-required; stage-required for selected private fixtures and access-required for private Studio/operator routes. Owns route/lease generation, not approval or pipeline state. Fixture use and private human access require separate proof.
- K3s, DNS/storage/scheduling/one network, SPIRE and Envoy are required secured showcase infrastructure. Current secured deployment requires Cilium; Flannel fallback is planned/unproved, not an implemented equivalent. SPIRE identity and application peer allowlists do not own jobs.
- LiteLLM and its PostgreSQL support the selected embedding gateway; Vertex supplies `gemini-embedding-001` output. Managed OpenAI supplies configured OpenClaw reasoning, not lifecycle decisions. Discord is required for enabled bot entry paths, optional to portable Core; webhook use is conditional on selected consumer.
- Argo CD is optional; direct Helm is possible with exactly one deployment owner. Monitoring (Prometheus/Grafana/Loki/Alloy) and Ops Pod are optional and not pipeline prerequisites. Their observations are not canonical transitions.
- Production authenticated HTTPS local registry is planned, not established by the anonymous HTTP lab profiles. Direct retained-volume and active GitOps ephemeral registry profiles have different recovery guarantees. A pod restart in the ephemeral profile can lose layers/manifests. Do not presume retained images or an off-host backup.

## Complete registered success order, identities and authority

Schema: `kubeclaw.documented-request-trace.v1`. Scenario: `complete-showcase-success`. Status: `conceptual-reference-only-not-live-proof`. Every step below has `evidenceStatus: reference-only; no live evidence is attached`.

The scope explicitly says no maintained joined harness binds Prism Studio approval, Nova project run, Discord, Redis, Cilium/Hubble and Buster BuildKit/Tailscale into one evidence chain. Standalone checks remain separate. The deployment success exercise proves only its compiled Nova project/final Buster demo chain; it does not fill the missing joins.

### 1. Deployment configuration owner

- **Input identity:** selected profile, immutable release receipts, and target namespace
- **Handoff/action:** Select the CNI, storage classes, registry endpoints, mirror endpoint, secrets, and exactly one deployment owner before reconciliation.
- **Output identity:** selected values digest and deployment revision
- **Deciding authority:** Platform configuration owner
- **Reporting only:** Helm release, Argo Application.
- **Safe stop/recovery boundary:** Stop before workload admission when ownership or an immutable input is unresolved.

### 2. K3s and Cilium

- **Input identity:** selected cluster and secured network profile
- **Handoff/action:** Provide API, scheduling, DNS, storage, Pod networking, and the checked-in allowed and denied routes.
- **Output identity:** node, CNI policy, allowed flow, and denied flow evidence
- **Deciding authority:** Cluster and network operators
- **Reporting only:** Kubernetes readiness, Hubble flows.
- **Safe stop/recovery boundary:** Do not claim network enforcement from rendered manifests or ready Pods without live positive and negative flows.

### 3. SPIRE and Envoy

- **Input identity:** namespace and ServiceAccount selectors for Nova, Buster, Prism Agent, Control, and Worker
- **Handoff/action:** Issue rotating SVIDs and authenticate each protected hop while applications accept forwarded identity only from loopback.
- **Output identity:** SPIFFE IDs, SVID generations, and authenticated peer records
- **Deciding authority:** SPIRE and each receiving application allowlist
- **Reporting only:** Envoy health, certificate diagnostics.
- **Safe stop/recovery boundary:** Stop protected traffic on missing, stale, wrong, or caller-supplied identity.

### 4. Writable OCI registry and Docker Hub mirror

- **Input identity:** selected registry-client contract and digest-pinned upstream reference
- **Handoff/action:** Prove the selected endpoints, a cold mirror-routed pull, and push, digest read, and pull for the writable registry.
- **Output identity:** registry-client contract digest, upstream digest, and produced manifest digest
- **Deciding authority:** Registry owns stored blobs; the consuming check owns acceptance
- **Reporting only:** /v2/ health, mirror cache status.
- **Safe stop/recovery boundary:** Do not substitute a tag, an insecure endpoint, or endpoint health for digest verification.

### 5. Redis transport

- **Input identity:** redis-secrets/redis-password and bounded stream probe identity
- **Handoff/action:** Authenticate, answer PING, and append one bounded observation with its deduplication identity.
- **Output identity:** stream key, entry ID, and deduplication key
- **Deciding authority:** Redis owns the transport entry; Nova and Buster retain lifecycle authority
- **Reporting only:** readiness, observer counters.
- **Safe stop/recovery boundary:** Do not reconstruct pipeline state from Redis or erase canonical state when a projection is missing.

### 6. LiteLLM PostgreSQL and Prism PostgreSQL

- **Input identity:** separate database releases, credentials, volumes, and owner-specific probes
- **Handoff/action:** Prove each database readiness, persistent volume, and distinct runtime identity without crossing restore domains.
- **Output identity:** LiteLLM database check and Prism database check with separate volume identities
- **Deciding authority:** Each database owner
- **Reporting only:** Pod readiness, storage metrics.
- **Safe stop/recovery boundary:** Stop the affected domain; never use one database backup or credential set for the other.

### 7. LiteLLM and Vertex AI

- **Input identity:** consumer key, master key, database, Google service-account identity, and model gemini-embedding-001
- **Handoff/action:** Route one authenticated embedding request and validate that the response contains a bounded numeric vector.
- **Output identity:** model identity and validated vector result bound to the requesting session
- **Deciding authority:** LiteLLM owns gateway state; Vertex owns the provider result
- **Reporting only:** LiteLLM health, provider diagnostics.
- **Safe stop/recovery boundary:** Keep the consumer operation incomplete after authentication, quota, timeout, model, or vector failure.

### 8. Nova and Buster Discord channels

- **Input identity:** distinct bot tokens, channel IDs, allowed user, and denied user
- **Handoff/action:** Prove one allowed message and one denied-user attempt for each enabled channel.
- **Output identity:** Discord message IDs and receiving OpenClaw session identities
- **Deciding authority:** Channel allowlist and receiving application
- **Reporting only:** Discord delivery state.
- **Safe stop/recovery boundary:** A delivered message cannot create a pipeline transition without Nova admission.

### 9. Nova OpenClaw and Nova Core

- **Input identity:** allowed Discord message and configured managed reasoning session
- **Handoff/action:** Form the requested workflow input, then admit it through Nova Core and create the canonical run journal.
- **Output identity:** OpenClaw session, runId, request digest, and initial journal record
- **Deciding authority:** Nova Core
- **Reporting only:** model response, Discord reply.
- **Safe stop/recovery boundary:** Do not treat a model answer or chat acknowledgement as run admission.

### 10. Git origin

- **Input identity:** repository URL, mounted deploy-key identity, and requested immutable revision
- **Handoff/action:** Fetch the exact objects, verify the commit and source tree, and store source identity before execution.
- **Output identity:** commit ID and verified source-tree digest
- **Deciding authority:** Nova Core accepts or rejects source identity
- **Reporting only:** Git transport logs.
- **Safe stop/recovery boundary:** Do not replace the required commit with a branch head or stale local checkout.

### 11. Nova Prism stage

- **Input identity:** runId, stageId, attemptId, architecture artifact digest, and phase
- **Handoff/action:** Record the attempt and reserve a runtime-dispatch effect whose idempotency key derives from run, architecture digest, and phase.
- **Output identity:** effect ID, idempotency key, and dispatch request digest
- **Deciding authority:** Nova Core
- **Reporting only:** stage log.
- **Safe stop/recovery boundary:** The durable effect reservation must exist before protected transport begins.

### 12. Nova Envoy and Prism Agent Envoy/bridge

- **Input identity:** Nova SPIFFE ID, Prism Agent SPIFFE ID, and the reserved dispatch request
- **Handoff/action:** Carry the request through Nova loopback Envoy, the agent-prism mTLS listener, its loopback bridge, and the second Envoy hop to Control.
- **Output identity:** authenticated Nova-to-Agent and Agent-to-Control peer evidence
- **Deciding authority:** Prism Agent and Control peer allowlists
- **Reporting only:** Envoy access logs, bridge HTTP response.
- **Safe stop/recovery boundary:** Reconcile the same dispatch identity after an uncertain response; do not create another design round.

### 13. Prism Control and Prism PostgreSQL

- **Input identity:** authenticated agent peer, body digest, idempotency key, preference subject, schema, and architecture revision
- **Handoff/action:** Validate the request and commit the project, design request, preference generation, and agent job before returning waiting state.
- **Output identity:** project ID, request digest, generation, agent job ID, and PostgreSQL transaction
- **Deciding authority:** Prism Control
- **Reporting only:** 202 waiting response.
- **Safe stop/recovery boundary:** Reject stale revisions, changed idempotent bytes, invalid peers, and uncommitted jobs.

### 14. Prism Agent bridge and OpenClaw

- **Input identity:** durable job ID, stable project session, claim expiry, and fence
- **Handoff/action:** Claim the job once, start one bounded OpenClaw attempt, and return exactly three designs bound to job, generation, and fence.
- **Output identity:** claim, runner, attempt envelope, fence, session, and three design digests
- **Deciding authority:** Prism Control job store
- **Reporting only:** OpenClaw process exit, model response.
- **Safe stop/recovery boundary:** An uncertain launch becomes needs_nova; never spawn a replacement agent for the same claim.

### 15. Prism Control and Prism Worker

- **Input identity:** fenced design result and accepted Worker attempt envelope
- **Handoff/action:** Lock and validate the result, execute any bounded native work through the protected Worker route, then commit the digest, Worker receipt, and terminal job state.
- **Output identity:** Worker attempt receipt, design digests, and terminal Prism job record
- **Deciding authority:** Prism Control
- **Reporting only:** Worker log, process exit.
- **Safe stop/recovery boundary:** A model response, render output, or process exit alone is not a committed Prism result.

### 16. Tailscale, Prism Studio, and Prism Control

- **Input identity:** private hostname, Tailnet identity, signed application session, project, and selected design digest
- **Handoff/action:** Reach Studio privately, create the application session, select one direction, and approve its exact digest.
- **Output identity:** route identity, session, selection revision, and approval record
- **Deciding authority:** Authorized human through Prism Control
- **Reporting only:** Tailscale route status, browser response.
- **Safe stop/recovery boundary:** Do not bypass private access, product authorization, CSRF, or revision checks.

### 17. Nova resume and Prism Control

- **Input identity:** active wait ID, authorized resume signal, approved revision, and deterministic next-phase key
- **Handoff/action:** Resume the original run, fetch the approved content-addressed archive, and verify its manifest and object digests before import.
- **Output identity:** signal ID, baseline archive digest, imported artifact ID, and resumed attempt
- **Deciding authority:** Nova Core
- **Reporting only:** signal transport, download response.
- **Safe stop/recovery boundary:** Reject stale signals and digest mismatches; do not manufacture a replacement baseline.

### 18. Nova to Buster and Tailscale fixture

- **Input identity:** runId, stageId, attemptId, signed source snapshot, plan digest, job idempotency key, and private fixture request
- **Handoff/action:** Submit one immutable Buster job; admit it once and allocate one generation-bound private fixture lease when the plan requires it.
- **Output identity:** Buster jobId, accepted request digest, lease ID, generation, and fixture endpoint
- **Deciding authority:** Buster owns job admission and fixture lease; Nova owns the pipeline attempt
- **Reporting only:** transport response, Ingress readiness.
- **Safe stop/recovery boundary:** Reconcile the same job and lease after an uncertain response; do not allocate replacements.

### 19. Worker Core, rootless BuildKit, mirror, and writable OCI registry

- **Input identity:** accepted attempt envelope, capability grant, registry-client contract, local BuildKit socket, and digest-pinned source
- **Handoff/action:** Build through Worker Core, use the selected mirror for eligible upstream content, push to the selected registry, and verify the immutable manifest digest.
- **Output identity:** attempt receipt, BuildKit result, upstream digest, and produced OCI manifest digest
- **Deciding authority:** Worker Core accepts the attempt; Buster reduces node state
- **Reporting only:** BuildKit log, registry health, cache status.
- **Safe stop/recovery boundary:** After an uncertain push, inspect the intended digest before any rebuild; never substitute a tag.

### 20. Buster result import, Nova journal, Redis observers, and Discord

- **Input identity:** jobId, result digest, evidence digests, cleanup receipts, and original lifecycle identities
- **Handoff/action:** Release the fixture lease, return the bounded result, verify every imported byte, and commit Nova terminal state before observers publish derived events and messages.
- **Output identity:** Buster terminal job, release receipt, complete import, Nova terminal run, Redis entry IDs, and Discord message ID
- **Deciding authority:** Nova Core
- **Reporting only:** Redis observers, Discord, monitoring.
- **Safe stop/recovery boundary:** Keep the attempt incomplete on digest or cleanup uncertainty. Derived delivery cannot create or change terminal state.

## Recovery ownership across the requested boundaries

- **Nova:** Nova Core recovers the recorded graph, pinned packages/configuration and ordered journal, reconciles effects and remote work before new execution. No recompile or replacement run; unresolved wait/cooldown stops progress; terminal runs do not enter ordinary recovery. If run storage is unprovable, stop mutation and restore its authoritative group. Accepted effects without reliable receipts block for the effect owner’s reconciliation.
- **Worker Core:** Native host/supervisor recovers ownership before admission under its supervisor lock. Unknown, changed, missing or inconsistent scope/host binding fences admission for operator action. A sealed result is replayed exactly, not executed again. Missing native process result becomes sealed `errored` / `WORKER_NATIVE_INTERRUPTED_RESULT_UNAVAILABLE`; never-launched gets cleanup `not_required`, drained previously launched work gets cleanup `failed` and must reconcile specialist external effects before higher generation. The controller decides safety of a new generation. A receipt/digest is not a cryptographic signature or remote identity proof.
- **Git:** Source/repository operator restores access to the exact revision; Nova Core accepts/rejects the commit/tree binding. A verified existing snapshot is usable only if it is exactly the required revision and workflow allows it; never substitute branch head.
- **PostgreSQL:** Restore each owner’s distinct domain. Prism Control/operator restores a matched Prism database/artifact recovery point and reconciles operations/jobs before reopening work. Model-gateway operator restores LiteLLM’s own database/credentials, verifies models/keys and proves a real model route. Never cross-restore databases or overwrite Nova/Buster state.
- **BuildKit and registry:** Stop affected build node; builder/registry operators restore the selected service/profile and retained content. Buster checks the intended immutable manifest after uncertain push before rebuild, can reuse a verified manifest only if recorded attempt permits it, otherwise resumes the repaired path under original attempt identity. A tag, process exit or `/v2/` health is insufficient. Mirror operator restores/proves misses and hits; client-contract owner proves actual mirror routing.
- **Tailscale:** Route/operator and Buster fixture lease owner reconcile the original owner and lease/Ingress generation before restoring/resuming. Do not allocate replacement exposure while first outcome is uncertain. Restore Tailnet DNS/TLS/ACL/proxy and prove the same client path; reconcile/release lease and retain cleanup receipts. Human authorization/CSRF/revision and approval remain Prism Control decisions.
- **Redis:** Separate platform restoration from adapter/observer replay ownership, as below.

## Registered Redis-unavailable decision trace

Scenario: `container-build-redis-unavailable`; status: `contract-example-not-live-proof`; base: `complete-showcase-success in request-trace-success.json`.

Injection: Redis becomes unavailable after Nova has committed the run and before the observer appends the attempt event.

**First failed signal:** Authenticated PING, bounded XADD, or the owning adapter command returns a classified connection, authentication, timeout, protocol, or no-eviction capacity error.

- Absence of a stream entry does not prove that Nova did not commit the lifecycle event.
- A later Redis readiness success does not prove that the missing projection was replayed.

**Authority after failure:**

- pipeline lifecycle: Nova event journal and run state; Redis role: non-authoritative projection.
- Buster job, node result, and evidence: Buster durable stores; Redis role: non-authoritative transport or observation.
- Prism project, design request, agent job, revision, and approval: Prism Control and Prism PostgreSQL; Redis role: none.
- built image: OCI manifest digest and Buster receipt; Redis role: none.
- private fixture route: Tailscale lease generation and fixture receipt; Redis role: none.

**Safe stop:** Stop only the adapter, observer, or consumer whose contract requires Redis. Do not change a committed Nova or Buster result and do not create a replacement lifecycle event.

**Recovery owner:** The Redis platform operator restores the selected Redis authority. The owning adapter or observer then reconciles from its documented source and original identity.

**Ordered recovery:**

1. Retain the Nova and Buster owner records, the exact Redis error, and the original event or delivery identity.
2. Classify DNS, network, authentication, timeout, protocol, memory, and storage separately.
3. Restore the same Redis endpoint and credential source. Do not point one run at a new unverified authority.
4. Prove authenticated PING and the adapter's bounded write behavior.
5. Replay only when the adapter contract has a durable source and permits replay. Reuse the original idempotency or delivery key.
6. Verify the returned stream entry and deduplication result. Record an unrecoverable projection gap when no durable replay source exists.
7. Resume only the stopped consumer. Confirm that Nova and Buster owner records did not change during transport recovery.

**Bounded retry:** Retry only under the owning adapter deadline and deduplication window. Stop on authentication, protocol, no-eviction capacity, or repeated timeout failure. The OpenClaw agent-observability payload path has one write attempt and no replay source; its control path has three bounded attempts and one best-effort dead-letter write.

Producer specificity matters: Nova Observer Runtime retains canonical event, delivery attempts and checkpoint, invokes under configured timeout, retries to configured `maxAttempts` with `backoffMs`, and checkpoints only after success. Required observer exhaustion fails the host operation; best-effort blocks that observer/run in the drain without advancing checkpoint, while other observers/runs can continue. Lost acknowledgment must be checked at the sink before manual retry. Never manually advance a checkpoint or casually rewind it.

The distinct Buster OpenClaw host ingress path has only in-memory queues/dedupe and no repository consumer/checkpoint/replay. Payload has one attempt; control has three, with 100 ms and 200 ms waits under a 1,000 ms delay ceiling; each command timeout is 5,000 ms; exhausted control has one best-effort DLQ write. Queue loss, payload failure and restart gaps cannot be recovered by that extension. Its `XADD *` is not the generic adapter’s idempotent Lua publish; it can duplicate on replay/restart. The generic Redis adapter dedup key has a finite TTL; on expiration a very late replay can append again, so consumers need stable event/delivery identity where longer correctness is required.

The public outage procedure additionally requires writer ownership/preservation before fault injection, an already exited Nova owner and stopped run/adapter writers through before/during/after audits. It does not authorize interrupting an active pipeline to manufacture evidence. The described isolated reachability experiment expects only Redis PING reachability failure; auth/unrelated/wrapper failure is a different outcome. It restores the recorded replica count and requires both authenticated role checks plus bounded stream behavior; Pod readiness alone is not recovery. Failed rollout/checks keep admission stopped; never delete the PVC.

**Completion:** Redis accepts the bounded check and any permitted replay under the original identity, or the operator records the projection as unrecoverable. Nova and Buster authority records remain unchanged.

## Uncertainties, failure threshold and result

No requested component is omitted from the reconstructed public contract. No authority was assigned to a reporter, no baseline service was silently treated as optional, no planned Flannel/production registry/Git mirror capability was claimed implemented, and no unsafe replacement or unlimited retry was proposed. I found no need for forbidden sources or facilitator component hints.

Concrete successful execution, actual first Redis error, exact stream/dedup replay result, unchanged live journal/PVC, network enforcement, actual registry-client selection and complete joined acceptance remain **unobserved**. The fixtures intentionally contain no such values. The target completion condition explicitly says no current command in the document satisfies the joined 20-step live condition. Therefore this reader result establishes navigation and contract comprehension only; a demand for a live successful request or recovery would be blocked by the published evidence, not completed.

Potential wording tension retained rather than resolved by guessing: the conceptual success fixture warns not to substitute an insecure endpoint, while the dependency/communication pages explicitly describe current anonymous HTTP lab registry profiles and future authenticated HTTPS production work. I treat lab presence as lab-only evidence, not proof of a secure production path; the selected deployment/transport must be resolved before admission.

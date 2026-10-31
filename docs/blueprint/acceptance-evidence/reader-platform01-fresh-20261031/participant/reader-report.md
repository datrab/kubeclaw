# READER-PLATFORM-01 — actual participant evidence

Role: MODEL platform-developer. Fresh independent context; no prior contribution known. No human/live/deployed acceptance claim. Reviewed revision supplied by task: `55d177d7821a4f6abab7f7375afa47a58697f712` (not independently checked outside allowed inputs).

Started: 2026-10-31 22:57:26 UTC. Recorded: 2026-10-31T22:58:26.197402+00:00.

## Actual outcome: FAIL

The required complete **observed** request cannot be reconstructed from registered inputs. Success artifact `/status` = `conceptual-reference-only-not-live-proof`; `/scopeBoundary` says no maintained harness binds all interactions; `/purpose` says it is not an execution record; `/completionCondition` says no current command satisfies its joined identity condition. Every `/steps/N/evidenceStatus` says no live evidence attached. Input/output identities below are schema descriptions, not actual values. Redis artifact `/status` = `contract-example-not-live-proof`, and its first failure is a class of possible signals, not one recorded occurrence. This is the exact input gap, not an assertion that a live run failed. No repair, guess, or substituted evidence was attempted.

## Actual navigation

1. Read docs/site/README.md, followed architecture entry link.
2. Read understand/README.md; attempted understand/request-flow.md (nonexistent; path guess, no content accessed). Read both registered JSON artifacts.
3. Read linked understand/pipeline-dependencies.md and understand/communication.md together; tool output truncated. No external source links followed.
4. Used rg within four allowed documentation pages for dependency, retry and Redis headings.
5. Read platform-and-operations.md lines 24–60; diagnose.md 578–612; telemetry.md 185–211 and 1925–1947.
6. Produced this evidence and SHA-256 manifest by reading the same permitted inputs. No tests, install, runtime calls, source searches, checkout edits or new proof corpus.

## All registered target handoffs — NOT observed runtime order

Source for each row: `use/workflows/examples/request-trace-success.json#/steps/<zero-based index>`. The order column is the artifact order, not observed execution.

| Order / JSON pointer | Components | Exchanged input → output identity descriptions | May decide | May only report | Safe stop / recovery boundary |
|---|---|---|---|---|---|
| 1 /steps/0 | Deployment configuration owner | selected profile, immutable release receipts, and target namespace → selected values digest and deployment revision | Platform configuration owner | Helm release, Argo Application | Stop before workload admission when ownership or an immutable input is unresolved. |
| 2 /steps/1 | K3s and Cilium | selected cluster and secured network profile → node, CNI policy, allowed flow, and denied flow evidence | Cluster and network operators | Kubernetes readiness, Hubble flows | Do not claim network enforcement from rendered manifests or ready Pods without live positive and negative flows. |
| 3 /steps/2 | SPIRE and Envoy | namespace and ServiceAccount selectors for Nova, Buster, Prism Agent, Control, and Worker → SPIFFE IDs, SVID generations, and authenticated peer records | SPIRE and each receiving application allowlist | Envoy health, certificate diagnostics | Stop protected traffic on missing, stale, wrong, or caller-supplied identity. |
| 4 /steps/3 | Writable OCI registry and Docker Hub mirror | selected registry-client contract and digest-pinned upstream reference → registry-client contract digest, upstream digest, and produced manifest digest | The registry has authority for stored blobs. The consuming check has authority for acceptance. | /v2/ health, mirror cache status | Do not substitute a tag, an insecure endpoint, or endpoint health for digest verification. |
| 5 /steps/4 | Redis transport | redis-secrets/redis-password and bounded stream probe identity → stream key, entry ID, and deduplication key | Redis has authority for the transport entry. Nova and Buster retain lifecycle authority. | readiness, observer counters | Do not reconstruct pipeline state from Redis or erase canonical state when a projection is missing. |
| 6 /steps/5 | LiteLLM PostgreSQL and Prism PostgreSQL | separate database releases, credentials, volumes, and owner-specific probes → LiteLLM database check and Prism database check with separate volume identities | Each database owner | Pod readiness, storage metrics | Stop the affected domain. Do not use one database backup or credential set for the other. |
| 7 /steps/6 | LiteLLM and Vertex AI | consumer key, master key, database, Google service-account identity, and model gemini-embedding-001 → model identity and validated vector result bound to the requesting session | LiteLLM has authority for gateway state. Vertex has authority for the provider result. | LiteLLM health, provider diagnostics | Keep the consumer operation incomplete after authentication, quota, timeout, model, or vector failure. |
| 8 /steps/7 | Nova and Buster Discord channels | distinct bot tokens, channel IDs, allowed user, and denied user → Discord message IDs and receiving OpenClaw session identities | Channel allowlist and receiving application | Discord delivery state | A delivered message cannot create a pipeline transition without Nova admission. |
| 9 /steps/8 | Nova OpenClaw and Nova Core | allowed Discord message and configured managed reasoning session → OpenClaw session, runId, request digest, and initial journal record | Nova Core | model response, Discord reply | Do not treat a model answer or chat acknowledgement as run admission. |
| 10 /steps/9 | Git origin | repository URL, mounted deploy-key identity, and requested immutable revision → commit ID and verified source-tree digest | Nova Core accepts or rejects source identity | Git transport logs | Do not replace the required commit with a branch head or stale local checkout. |
| 11 /steps/10 | Nova Prism stage | runId, stageId, attemptId, architecture artifact digest, and phase → effect ID, idempotency key, and dispatch request digest | Nova Core | stage log | The durable effect reservation must exist before protected transport begins. |
| 12 /steps/11 | Nova Envoy and Prism Agent Envoy/bridge | Nova SPIFFE ID, Prism Agent SPIFFE ID, and the reserved dispatch request → authenticated Nova-to-Agent and Agent-to-Control peer evidence | Prism Agent and Control peer allowlists | Envoy access logs, bridge HTTP response | Reconcile the same dispatch identity after an uncertain response. Do not create another design round. |
| 13 /steps/12 | Prism Control and Prism PostgreSQL | authenticated agent peer, body digest, idempotency key, preference subject, schema, and architecture revision → project ID, request digest, generation, agent job ID, and PostgreSQL transaction | Prism Control | 202 waiting response | Reject stale revisions, changed idempotent bytes, invalid peers, and uncommitted jobs. |
| 14 /steps/13 | Prism Agent bridge and OpenClaw | durable job ID, stable project session, claim expiry, and fence → claim, runner, attempt envelope, fence, session, and three design digests | Prism Control job store | OpenClaw process exit, model response | An uncertain launch becomes needs_nova. Do not spawn a replacement agent for the same claim. |
| 15 /steps/14 | Prism Control and Prism Worker | fenced design result and accepted Worker attempt envelope → Worker attempt receipt, design digests, and terminal Prism job record | Prism Control | Worker log, process exit | A model response, render output, or process exit alone is not a committed Prism result. |
| 16 /steps/15 | Tailscale, Prism Studio, and Prism Control | private hostname, Tailnet identity, signed application session, project, and selected design digest → route identity, session, selection revision, and approval record | Authorized human through Prism Control | Tailscale route status, browser response | Do not bypass private access, product authorization, CSRF, or revision checks. |
| 17 /steps/16 | Nova resume and Prism Control | active wait ID, authorized resume signal, approved revision, and deterministic next-phase key → signal ID, baseline archive digest, imported artifact ID, and resumed attempt | Nova Core | signal transport, download response | Reject stale signals and digest mismatches. Do not manufacture a replacement baseline. |
| 18 /steps/17 | Nova to Buster and Tailscale fixture | runId, stageId, attemptId, signed source snapshot, plan digest, job idempotency key, and private fixture request → Buster jobId, accepted request digest, lease ID, generation, and fixture endpoint | Buster has authority for job admission and the fixture lease. Nova has authority for the pipeline attempt. | transport response, Ingress readiness | Reconcile the same job and lease after an uncertain response. Do not allocate replacements. |
| 19 /steps/18 | Worker Core, rootless BuildKit, mirror, and writable OCI registry | accepted attempt envelope, capability grant, registry-client contract, local BuildKit socket, and digest-pinned source → attempt receipt, BuildKit result, upstream digest, and produced OCI manifest digest | Worker Core accepts the attempt. Buster reduces node state. | BuildKit log, registry health, cache status | After an uncertain push, inspect the intended digest before any rebuild. Do not substitute a tag. |
| 20 /steps/19 | Buster result import, Nova journal, Redis observers, and Discord | jobId, result digest, evidence digests, cleanup receipts, and original lifecycle identities → Buster terminal job, release receipt, complete import, Nova terminal run, Redis entry IDs, and Discord message ID | Nova Core | Redis observers, Discord, monitoring | Keep the attempt incomplete on digest or cleanup uncertainty. Derived delivery cannot create or change terminal state. |

## Dependency classification for every component in target trace

Classification distinguishes current showcase requirement from portable graph semantics. No traced baseline service is called optional merely because Core can omit its consuming stage. Sources: pipeline-dependencies.md §§Dependency Classes, Required Showcase Baseline, Git Source and the Missing Git Mirror; platform-and-operations.md:24–60; understand/README.md §§Architecture Scope and Role Words.

| Traced dependency / surface | Current classification | Portable / ownership qualification |
|---|---|---|
| Deployment configuration, Helm | Required configuration and one owner | Helm is a reconciler; Argo CD is optional alternative, never a second concurrent owner |
| K3s, DNS, scheduler, storage, one CNI | Required showcase | Kubernetes deployment dependencies, not Core semantics |
| Cilium and Hubble | Cilium required secured profile; Hubble network evidence | Hubble reports; Flannel fallback planned, not implemented/proved |
| SPIRE, Envoy | Required showcase protected routes | Identity proof does not admit jobs |
| Nova/OpenClaw/Nova Core and durable journal | Required declared orchestration role; journal Core dependency | Model response is not run admission |
| Git origin | Required showcase/source path | Exact revision; shared Git mirror absent/planned, not current |
| Redis | Required showcase/readiness | Conditional adapter/observer dependency in portable graph, transport only |
| LiteLLM PostgreSQL and LiteLLM | Required checked-in profile | Conditional selected gateway and its database; not Nova journal |
| Prism PostgreSQL | Required showcase and active Prism role | Separate Prism recovery domain |
| Managed reasoning, Vertex AI | Reasoning required enabled agent sessions; Vertex required remote memory search | Neither required for deterministic Core work |
| Discord | Required two enabled bot entry paths | Optional to non-Discord Core path; webhook only if selected |
| Prism stage, Agent/bridge/OpenClaw, Control, Worker/Worker Core, Studio | Required for declared selected design workflow | Control owns jobs/design; authorized human approval through Control; Worker Core accepts bounded attempts |
| Buster and Worker Core | Required selected Buster work | Buster job/node authority, Worker admission, not Nova terminal authority |
| Rootless BuildKit | Required Buster profile/showcase | Stage dependency only for selected container-build provider |
| Writable OCI registry | Required intended build showcase | Deployment client selection unresolved in checked-in values; current anonymous HTTP lab path, authenticated HTTPS production boundary planned |
| Docker Hub mirror | Required showcase endpoint/readiness | Replaceable optional semantic cache; explicit client selection needed, currently empty Buster selection is not proof of use |
| Tailscale | Required complete showcase | Conditional private Studio access or fixture lease consumer |
| Monitoring (Prometheus/Grafana/Loki/Alloy) | Optional | Reporting only, no canonical authority |

## Redis fault recovery contract

Source: `request-trace-redis-unavailable.json` exact top-level keys below; corroboration diagnose.md:578–612 and telemetry.md:1925–1947. No fault was injected or observed by this participant.

| Required item | Finding | Citation |
|---|---|---|
| First failed health signal | Authenticated PING, bounded XADD or owning command classified connection/authentication/timeout/protocol/no-eviction capacity error. Artifact does not identify a single actual failing operation. Stream absence is not evidence of absent Nova commit; recovered readiness not replay proof. | /firstFailedSignal |
| Safe stop | Stop only Redis-required adapter/observer/consumer. Preserve committed Nova/Buster result, original event/delivery identity and error; no replacement lifecycle event. | /safeStopRule; /orderedRecovery/0 |
| Recovery owner | Redis platform operator restores same selected endpoint and credential source; owning adapter/observer reconciles only permitted durable original source. | /recoveryOwner; /orderedRecovery/2 |
| Ordered completion | Classify cause; restore same authority; authenticated PING plus bounded write; permitted replay with original key; verify entry/dedup or record unrecoverable gap; resume only stopped consumer and verify owner records unchanged. | /orderedRecovery; /completionCondition |
| Bounded retry | Adapter deadline and dedup window; stop on authentication/protocol/no-eviction capacity/repeated timeout. OpenClaw payload: one attempt/no replay; control: three attempts then one best-effort dead letter. No endless loop or checkpoint edit. | /boundedRetryRule; telemetry.md:202–211,1929–1938 |
| Remaining authority | Nova journal/run state; Buster durable job/evidence; Prism Control/PostgreSQL; OCI digest/Buster receipt; Tailscale generation/fixture receipt. Redis is not their product-state authority. | /authorityAfterFailure/0–4 |

## Four outcome judgments

| Required outcome | Judgment | Precise basis |
|---|---|---|
| complete-request-trace | FAIL | success JSON /status, /scopeBoundary, /purpose, /steps/0–19/evidenceStatus, /completionCondition: no observed same-request chain or concrete exchanged identity values. All eight requested components are named in the target table, but naming a target is not tracing one observed request. |
| authority-boundaries-correct | PASS for documented-contract interpretation only | All 20 target handoffs preserved above with /decisionOwner and /reportersOnly; no reporter promoted to lifecycle authority. Not proof those handoffs executed. |
| required-versus-optional-correct | PASS for documentation inventory interpretation only | pipeline-dependencies.md §§Dependency Classes and Required Showcase Baseline; platform-and-operations.md:24–60; all traced components classified above, conditional portable semantics distinguished from showcase requirement. |
| recovery-owner-found | PASS for contract identification only | Redis JSON /firstFailedSignal, /safeStopRule, /recoveryOwner, /orderedRecovery, /boundedRetryRule; actual incident signal/recovery execution not supplied. |

A single failed required outcome makes this reader case FAIL. No whole-gate award is made. Secondary material limitation: registry-client selection and joined harness are explicitly unresolved; neither was silently filled in. No forbidden source consulted.

## Source SHA-256 manifest

| Allowed input | SHA-256 |
|---|---|
| README.md | `4301425464181be552e9509083c3d5ef5b7011664f51b9736c9ab4ee3da060c0` |
| understand/README.md | `fc24b3f49148a76197136ddbd2dc9dfe5badc262af77b80ab9e0c5fcbb2b7067` |
| understand/pipeline-dependencies.md | `6805be36685c4fcc13f895dfa2e8d4a43bd1bfeff55fdf80774a5652760b6755` |
| understand/communication.md | `87d3e70d96a6398bb50ab28051219b369349c16045980fe34b394f81af2608e2` |
| understand/platform-and-operations.md | `e8b85782b9b8ec62331ff1d1c3deb8c7dbc3a3b8f584093d96c994f738fe55f5` |
| use/diagnose.md | `0429e50c4852dc82b091eda209e06da6408d401b2fc648a7f720372d79b78ab3` |
| understand/telemetry.md | `64d71087e94101d7256a5137401abca9a5377aa947bf6a1dba3c59ddb9542d9c` |
| use/workflows/examples/request-trace-success.json | `e2f92f057f5e2c7d1f8bd9d8c9faebdf826d1f818bf0c44405a9d0efe5b07ed7` |
| use/workflows/examples/request-trace-redis-unavailable.json | `9ea32431ccb8979cb625a6c487fd39e348a49e2fe3bd332a647cdc3a9c89e239` |

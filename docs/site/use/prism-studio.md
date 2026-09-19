# Operate Prism: From Architecture to Approved Handoff

Status: implemented with stated deployment and live-proof limits
Audience: Prism operator, designer, incident responder, platform maintainer
Owner: Prism maintainers
Evidence: skills/prism; skills/nova/plugins/prism-design; charts/prism; scripts/deploy.sh
Evidence revision: `4e52c72788ac002788bc036a497d76c13e6a35fd`
Applies to: the current Prism Control, Studio, agent, native worker, ingestion service, and Nova Prism stage
Last verified: source, contract, chart, and focused-test inspection on 2026-09-19

## Purpose

This guide gives an operator one complete Prism journey.
It starts when Nova submits an architecture.
It ends when Nova imports the exact Baseline Bundle that a human approved.

Use this page to:

- prepare and deploy Prism;
- find a project in Studio;
- compare and select a design direction;
- make visual or natural-language changes;
- inspect, restore, preview, evaluate, approve, and publish a revision;
- resume the waiting Nova run with the correct identities;
- diagnose a stopped or uncertain operation without creating duplicate work.

Prism is a design system, not an application generator.
Its approved output contains a structured Design Document, a design specification,
acceptance criteria, preview evidence, assets, checksums, and a manifest.
The implementation pipeline remains responsible for production code.

> **The important authority boundary**
>
> Studio approval publishes an immutable Baseline Bundle. It does not resume Nova.
> A separately authenticated Nova signal resumes the run. Nova then asks Prism for
> the approved bundle and verifies all content before it accepts the handoff.
>
> [The Prism stage creates the wait, publishes the operator request, and validates the later approval signal](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/nova/plugins/prism-design/src/stage.ts#L8-L34).

## Know the Running Parts

| Part | What it owns | What it does not own |
| --- | --- | --- |
| Nova Prism stage | Architecture handoff, wait identity, operator notification, resume validation, and final bundle import | Design editing and bundle publication |
| Prism Control | Projects, requests, rounds, documents, revisions, approvals, corpus records, worker dispatch, and bundle assembly | Model reasoning and browser presentation |
| Prism agent | Three initial directions and natural-language revisions in one project session | Direct database writes, approval, and publication |
| Agent bridge | Durable Control job claims and one bounded OpenClaw process invocation | Admission of new work without a Control job |
| Studio | Authenticated human interaction, typed visual edits, preview, evaluation, warning acceptance, approval, and publication request | Canonical state and automatic Nova resume |
| Prism worker | Deterministic rendering, evaluation, embeddings, evidence, resource control, and durable attempt results | Pipeline scheduling and human authority |
| Ingestion service | Isolated acquisition, validation, temporary quarantine, and cleanup | Corpus publication and retrieval policy |
| PostgreSQL with pgvector | Canonical relational state, revisions, operation identity, preference events, embeddings, and migrations | Artifact bytes |
| Artifact store | Content-addressed assets, previews, logs, and Baseline Bundle bytes | Searchable domain metadata |

Control is the center of the operator path.
Studio is a client of Control.
The worker and agent cannot approve their own output.
This separation prevents an automated component from turning a proposal into
approved pipeline input.

> **Source evidence — component flow**
>
> [Control accepts the Nova dispatch, stores the architecture request, and starts a design round](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L174-L240).
>
> [The agent bridge claims only durable jobs and records the bounded OpenClaw outcome](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/agent-job-runner.mjs#L16-L46).
>
> [The native worker host uses a deterministic provider; production model work stays in the managed Prism agent](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/native-worker-host.ts#L12-L33).

## Before You Start

You need all of the following items:

1. A reviewed runtime release selection with Prism image digests.
2. A Kubernetes cluster with the required Prism namespace and image-pull Secret.
3. PostgreSQL storage and artifact storage with sufficient capacity.
4. The native worker host policy and its generated Prism values.
5. SPIFFE CSI support when the selected deployment enables worker trust.
6. Tailscale access to the private Studio endpoint when Tailscale exposure is enabled.
7. `gatewayToken-prism` in `openclaw-shared-secrets`.
8. A valid Prism code bundle URL and a commit that matches the selected runtime receipt.
9. The authorized operator issuer ID used by the Nova Prism stage.

Stop if an identity, digest, Secret, or native host binding is unknown.
Do not replace an unknown value with a new value during an active run.
That action can make a durable request impossible to reconcile.

### Current repository limit

The deployment script expects materialized files at
`releases/values/prism.yaml` and `releases/values/prism-agent.yaml`.
They are release outputs, not the chart defaults.
If these files are absent, materialize the reviewed runtime release first.
Do not deploy from `charts/prism/values.yaml` alone and call it a selected release.

The chart defaults contain safe structural defaults, but their image digests are
empty. The deploy script rejects an empty or invalid selected digest.

> **Source evidence — release admission**
>
> [The deploy command requires both materialized values files and validates all four Prism image digests](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L1593-L1616).
>
> [The chart defaults deliberately leave the four image digests empty](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/charts/prism/values.yaml#L1-L7).

## Configuration Sources and Precedence

Prism has more than one configuration owner.
Do not treat all settings as equivalent.

### Deployment precedence

The effective service values use this order, from lowest to highest precedence:

1. Chart defaults in `charts/prism/values.yaml`.
2. Materialized selected values in `releases/values/prism.yaml`.
3. The optional private file named by `PRISM_VALUES_FILE` before the deploy script starts.
4. Deploy-script image, trust, namespace, and Secret overrides.

The Prism agent uses the same pattern:

1. The shared agent chart defaults.
2. Materialized selected values in `releases/values/prism-agent.yaml`.
3. The optional private file named by `PRISM_AGENT_VALUES_FILE` before the deploy script starts.
4. The generated code-bundle override and selected LiteLLM endpoint.

The script saves the optional file names as overlays and then replaces the shell
variables with the materialized release paths. This detail explains why an
operator-supplied file adds private values but cannot replace selected release truth.

> **Source evidence — precedence**
>
> [The deploy script captures private overlays and fixes the base files to materialized release values](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L100-L103).
>
> [Service release values, private overlay, fixed trust and Secret overrides are applied in that order](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L1725-L1744).

### Main Helm values

| Value | Default | Meaning and safe rule |
| --- | --- | --- |
| `images.{control,studio,worker,ingestion}` | Repository set; digest empty | Use only receipt-selected digests. A tag is not a release identity. |
| `imagePullSecrets` | `ghcr-secret` | Secret that can pull all selected images. |
| `control.pipelinePreferenceSubject` | empty | Empty means automated rounds do not use one person's learned preferences. Set only an existing authenticated Prism `userId`. |
| `control.productDecisions.enabled` | `false` | Enables the separate signed product-decision authority. Configure all issuer, operator, key, controller, and token fields together. |
| `control.replicas` | `1` | Control process count. Database transactions remain the canonical concurrency boundary. |
| `studio.replicas` | `1` | Studio proxy and static UI count. Studio does not store canonical design state. |
| `worker.native.nodeName` | empty | Required selected native worker node. Use generated host-policy output. |
| `worker.native.namespace` | empty | Required host pool namespace. It must match the host policy. |
| `worker.native.policyDigest` | empty | Required exact host-policy digest. Do not calculate it by hand. |
| `worker.native.closeTimeoutMs` | `105000` | Cooperative native close budget. It must fit inside the service and Pod budgets. |
| `worker.shutdownTimeoutMs` | `120000` | Complete worker shutdown budget. |
| `worker.terminationGracePeriodSeconds` | `150` | Kubernetes grace period. It must be longer than the service shutdown path. |
| `ingestion.enabled` | `false` | Enables the isolated acquisition service. Control corpus ingestion needs it. |
| `ingestion.resources` | empty when disabled | Required operator sizing when ingestion is enabled. |
| `ingestion.quarantineTtlMs` | `3600000` | Temporary acquired content lifetime, clamped by the service to 1 minute through 24 hours. |
| `postgresql.enabled` | `true` | Deploys the chart-owned PostgreSQL with pgvector. |
| `postgresql.storage` | `100Gi` | Canonical database PVC request. Size from measured growth and backup time. |
| `postgresql.storageClass` | empty | Cluster default when empty. Set explicitly if restore and topology policy require it. |
| `postgresql.existingSecret` | empty | Deploy script binds the selected Prism database Secret. |
| `artifactStorage.storage` | `100Gi` | Content-addressed artifact PVC request. |
| `artifactStorage.storageClass` | empty | Cluster default when empty. Match restore and topology requirements. |
| `backup.schedule` | `0 2 * * *` | Local backup schedule. Local backup is not an off-host copy. |
| `backup.verificationSchedule` | `0 3 * * 0` | Bundle and backup verification schedule. |
| `backup.databaseProofSchedule` | `0 4 * * 0` | Database restore-proof schedule. |
| `backup.maximumBytes` | `85899345920` | Maximum one backup output size. |
| `backup.maximumRetainedBytes` | `96636764160` | Local retained-byte ceiling. The chart does not provide automatic expiry. |
| `backup.maximumDurationSeconds` | `3600` | Backup execution limit. |
| `tailscale.enabled` | `true` | Exposes Studio through the Tailscale operator. |
| `tailscale.hostname` | `prism-studio` | Private MagicDNS host label. |
| `workerTrust.spiffe.enabled` | `false` in chart defaults | Production selection can enable SPIFFE. All trust identities must then be complete. |
| `workerTrust.spiffe.*` | platform defaults | Trust domain, service accounts, CSI socket, Envoy image, and sidecar resources. Change as one reviewed trust policy. |

The exact accepted Helm shape is closed by the chart JSON Schema.
Use that schema when an override is rejected.

> **Source evidence — Helm values**
>
> [The maintained chart defaults define service, storage, backup, exposure, and trust values](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/charts/prism/values.yaml#L1-L92).
>
> [The chart schema is the exact input contract](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/charts/prism/values.schema.json#L1-L531).

### Runtime settings and defaults

| Consumer | Setting | Default or requirement |
| --- | --- | --- |
| Control | `DATABASE_URL` | Required by the production listener. The chart reads `runtime-url` from the database Secret. |
| Control | `PORT` | `8080` |
| Control | `ARTIFACT_ROOT` | `/var/lib/prism/artifacts` |
| Control | `PRISM_WORKER_URL` | `http://prism-worker:8080` |
| Control | `PRISM_INGESTION_URL` | `http://prism-ingestion:8080` |
| Control | `PRISM_CONTROL_INTERNAL_URL` | `http://prism-control:8080` |
| Control | `PRISM_STUDIO_PUBLIC_URL` | `https://prism-studio` |
| Control | `PRISM_PIPELINE_PREFERENCE_SUBJECT` | Unset. If set, it must be a valid `user-` subject and is platform-owned. |
| Control | `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` | `67108864` |
| Control | `PRISM_NATIVE_DISPATCH_TIMEOUT_MS` | `900000` |
| Studio | `PORT` | `8080` |
| Studio | `STUDIO_ROOT` | Built `dist-studio` directory |
| Studio | `PRISM_CONTROL_URL` | `http://prism-control:8080` |
| Studio | `PRISM_CONTROL_TIMEOUT_MS` | `30000` |
| Worker | `PORT` | `8080` |
| Worker | `PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS` | `16` |
| Worker | `PRISM_WORKER_MAXIMUM_PROBE_REQUESTS` | `4` |
| Worker | `PRISM_WORKER_MAXIMUM_CONNECTIONS` | `128` |
| Worker | `PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS` | `120000` |
| Worker | `PRISM_WORKER_SHUTDOWN_TIMEOUT_MS` | `120000` |
| Native worker | `PRISM_NATIVE_MAXIMUM_INPUT_BYTES` | `16777216` in supervisor and worker ingress |
| Native worker | `PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES` | `33554432` |
| Native worker | `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` | `67108864` |
| Native worker | `PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES` | `68719476736` |
| Native worker | `PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS` | `65536` |
| Native worker | `PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES` | `67108864` |
| Native worker | `PRISM_NATIVE_CPU_TIME_MS` | `60000` |
| Native worker | `PRISM_NATIVE_MEMORY_BYTES` | `8589934592` |
| Native worker | `PRISM_NATIVE_TASKS` | `2048` |
| Native worker | `PRISM_NATIVE_POLL_INTERVAL_MS` | `20` |
| Native worker | `PRISM_NATIVE_DRAIN_TIMEOUT_MS` | `10000` |
| Native worker | `PRISM_NATIVE_CLOSE_TIMEOUT_MS` | `105000` |
| Native worker | `PRISM_NATIVE_UID`, `PRISM_NATIVE_GID` | `1000`, `1000` |
| Native worker | `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` |
| Ingestion | `PORT` | `8080` |
| Ingestion | `PRISM_QUARANTINE_ROOT` | `/quarantine` |
| Ingestion | `PRISM_QUARANTINE_TTL_MS` | `3600000`, clamped to `60000..86400000` |
| Database bootstrap | `ADMIN_DATABASE_URL` | Required administrative PostgreSQL URL. Use it only for bootstrap. |
| Database bootstrap | `PRISM_MIGRATOR_PASSWORD` | Required password for the schema-owning migration role. |
| Database bootstrap | `PRISM_RUNTIME_PASSWORD` | Required password for the normal read and write runtime role. |
| Database bootstrap | `PRISM_READONLY_PASSWORD` | Required password for the read-only role. |
| Native worker | `PRISM_ENGINE_CONTENT_DIGEST` | Required SHA-256 identity in production. |
| Native worker | `NODE_ENV` | `production` makes the engine content digest mandatory during configuration admission. |

Native path, scope, engine digest, pool-policy, and trust settings do not have
permissive production fallbacks. Missing or invalid values stop startup.

> **Source evidence — runtime configuration**
>
> [Control captures one immutable configuration snapshot and defines its service defaults](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-config.ts#L9-L72).
>
> [Studio validates its port and Control timeout](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/studio-config.ts#L4-L17).
>
> [Worker ingress and shutdown defaults are validated as positive timer-safe integers](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/worker-config.ts#L1-L38).
>
> [The native supervisor defines resource, journal, path, identity, and timing settings](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/config/native-worker.ts#L4-L83).

The following settings are required when their feature is active. They have no
safe implied identity:

| Boundary | Required settings |
| --- | --- |
| Control session and internal fallback authentication | `PRISM_SESSION_SECRET`, `PRISM_INGRESS_SECRET`, `PRISM_DISPATCH_SECRET`, `PRISM_WORKER_SECRET`, `PRISM_INGESTION_SECRET` |
| SPIFFE trust | Set `WORKER_TRUST_SPIFFE_ENABLED` to `true`; set `PRISM_TRUSTED_NOVA_SPIFFE_ID`, `PRISM_TRUSTED_WORKER_SPIFFE_ID`, `PRISM_CONTROL_SPIFFE_ID`, and `PRISM_TRUSTED_AGENT_SPIFFE_ID`; `PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID` is an optional separate identity. |
| Worker SPIFFE trust | Set `WORKER_TRUST_SPIFFE_ENABLED` to `true` and set `PRISM_TRUSTED_CONTROL_SPIFFE_ID`. |
| Native supervisor | `PRISM_NATIVE_POOL_POLICY_FILE`, `PRISM_NATIVE_LAUNCHER`, valid engine digest and root-managed node, runtime-identity, cgroup, ownership, and journal paths from the selected policy |
| Native host process | `KUBECLAW_NATIVE_SCOPE`, `PRISM_NATIVE_MAXIMUM_INPUT_BYTES`, `PRISM_CONTROL_INTERNAL_URL`, and SPIFFE or `PRISM_WORKER_SECRET` artifact authentication |
| Optional product authority | `PRISM_PRODUCT_DECISIONS_ENABLED=true`, `PRISM_PRODUCT_ISSUER`, `PRISM_PRODUCT_OPERATORS`, `PRISM_PRODUCT_ORIGIN`, `PRISM_PRODUCT_PRIVATE_KEY_FILE`, `PRISM_PRODUCT_CONTROLLER_URL`, `PRISM_PRODUCT_CONTROLLER_CA_FILE`, `PRISM_PRODUCT_CONTROLLER_TOKEN_FILE` |

The optional product authority is not the Prism design approval.
It signs accept or extend decisions for a separate demo-product controller.
Keep its operators, Ed25519 key, controller trust, audit rows, and recovery path
separate from the Baseline Bundle approval flow.

> **Source evidence — conditional configuration**
>
> [Control rejects an incomplete SPIFFE trust policy and otherwise requires the fallback secrets](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-config.ts#L16-L55).
>
> [Product authority is disabled unless explicitly selected and then requires HTTPS, an operator allowlist, and a dedicated Ed25519 key](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/control/product-decisions.ts#L20-L43).

### Deploy-command settings

| Setting | Default | Effect |
| --- | --- | --- |
| `PRISM_VALUES_FILE` | none | Optional private service-values overlay. It does not replace the materialized release file. |
| `PRISM_AGENT_VALUES_FILE` | none | Optional private agent-values overlay. |
| `PRISM_{CONTROL,STUDIO,WORKER,INGESTION}_IMAGE_REPOSITORY` | selected values | Explicit repository override. The corresponding selected digest remains mandatory. |
| `PRISM_{CONTROL,STUDIO,WORKER,INGESTION}_IMAGE_DIGEST` | selected values | Explicit digest override. It must be a complete SHA-256 digest. |
| `PRISM_CODE_BUNDLE_ARCHIVE_URL` | value file or derived GitHub URL | Exact Prism runtime code archive. |
| `PRISM_CODE_BUNDLE_EXPECTED_COMMIT` | selected runtime commit | Must match the selected runtime receipt. |
| `PRISM_CODE_BUNDLE_CONTRACT_VERSION` | `v2` | Code-bundle contract version. |
| `PRISM_CODE_BUNDLE_AUTH_SECRET` | agent value | Secret used to read a private bundle. |
| `PRISM_CODE_BUNDLE_AUTH_SECRET_KEY` | `token` | Key in the bundle-reader Secret. |
| `PRISM_IMAGE_PULL_SECRET_NAME` | `ghcr-secret` | Pull Secret bound into the service release. |
| `PRISM_RUNTIME_SECRET_NAME` | `prism-runtime` | Runtime Secret selected by the deployment. |
| `PRISM_DATABASE_SECRET_NAME` | `prism-postgresql-auth` | Database Secret selected by the deployment. |
| `NATIVE_WORKER_NODE_POLICY_FILE` | platform native-pool file | Input for Prism native deployment preflight. |

Environment overrides are operational inputs.
Record them with the deployment evidence because they can make a render different
from the committed values files.

### Prism agent values

The separate `agent-prism` release uses the common KubeClaw agent chart.
Its selected values must fix these Prism-owned choices:

| Value family | Prism rule |
| --- | --- |
| `agentRole` | Must be `prism`. |
| `image` and `imagePullSecrets` | Must select the reviewed Prism agent image and pull credentials. |
| `codeBundle` | Must enable the version-matched archive for the selected commit in production. |
| `auth` | Must read `gatewayToken-prism` from an existing Secret. |
| `litellm` | Must use the managed endpoint and Secret. Do not copy the key into plain values. |
| `discord` | Disabled by default. Enable only with a dedicated Prism token, channel, and allowlist. |
| `commands` | Explicit owner and Discord allowlists. They are authority, not user-interface preferences. |
| `agent.model` | Selected primary and fallback OpenAI routes for the Prism agent. |
| `agent.git` | Current deployment can sync an explicit repository with its SSH Secret. Runtime contracts still come from the code bundle. |
| `workerTrust.spiffe` | Must match the platform trust domain when the agent talks to Control. |
| `service` and bridge sidecar | Must route Prism dispatch to the colocated bridge without exposing the internal Control path. |
| `workspace` | Supplies the Prism role and mandatory tool instructions. A prompt does not replace tool-side schema validation. |

The common chart contains other capabilities for other roles.
Their presence in chart defaults does not make them part of Prism.

> **Source evidence — agent configuration**
>
> [The common agent chart defines bundle, auth, trust, LiteLLM, Discord, model, and Git value families](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/charts/kubeclaw/values.yaml#L16-L220).
>
> [The deploy command binds the selected Prism bundle and platform LiteLLM endpoint after the private agent overlay](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L1688-L1748).

### Nova Prism-stage configuration

The pipeline plugin has four closed settings:

| Field | Rule | Reason |
| --- | --- | --- |
| `agent` | Exactly `prism` | Prevents a project from redirecting design work to another runtime. |
| `target` | Nonempty operator target | Selects where the approval request is published. |
| `issuerId` | Nonempty operator issuer | Binds the only identity that can resolve the wait. |
| `timeoutMinutes` | Integer from 1 through 525600 | Creates the absolute approval-wait expiry. |

These settings come from Nova's resolved plugin configuration, not from Prism
Helm values. The capability grant must separately allow the Prism agent, artifact
namespaces, operator target, signal type, and issuer ID.

> **Contract evidence — stage configuration**
>
> [The Prism stage configuration schema is closed and requires all four fields](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/nova/plugins/prism-design/schemas/config.schema.json#L1-L1).

### Secrets

| Secret | Keys used by Prism | Purpose |
| --- | --- | --- |
| `prism-postgresql-auth` | `password`, `runtime-password`, `migrator-password`, `readonly-password`, `admin-url`, `runtime-url`, `migrator-url`, `readonly-url` | Separate database identities for administration, migration, runtime, and read-only access |
| `prism-runtime` | `session-secret`, `ingress-secret`, `dispatch-secret`, `worker-secret`, `ingestion-secret` | Session signing and internal request authentication when the matching SPIFFE path is not used |
| `openclaw-shared-secrets` | `gatewayToken-prism`, LiteLLM key, optional `discordToken-prism` | Prism agent gateway, managed model route, and optional Discord interface |
| `ghcr-secret` | Kubernetes pull credentials | Private selected images |
| `github-bundle-reader` or configured replacement | Bundle token key | Version-matched private Prism code bundle |
| Product decision signing Secret | `private-key.pem` by default | Optional dedicated Ed25519 product-decision authority |
| Product controller CA Secret | `ca.crt` by default | Optional controller TLS trust |

The Prism part of `deploy.sh secrets` creates missing Prism database and runtime Secrets.
It does not rotate existing values.
This behavior is deliberate: an uncoordinated database password change can stop
old Pods before new Pods complete their rollout.

Never store provider tokens in `prism-runtime` or inject them into Control,
Studio, worker, or ingestion. The Prism OpenClaw agent is the only production
component that owns the managed model route.

> **Source evidence — Secret creation**
>
> [The deployment command creates missing values, verifies every required key, and does not print secret values](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L1639-L1681).

## Deploy Prism

### 1. Render before you change the cluster

Run the repository's release materialization check first.
Then render the selected Prism releases with the deployment script.

```bash
node scripts/updates/materialize-release.mjs --family=runtime --check
./scripts/deploy.sh render prism
```

Inspect the render for:

- four digest-pinned service images;
- one version-matched Prism agent image and code bundle;
- the intended namespace, native node, pool namespace, and policy digest;
- the expected database and runtime Secret names;
- SPIFFE identities and Envoy sidecars when SPIFFE is enabled;
- the Tailscale Ingress host;
- PVC sizes, storage classes, backup jobs, and Pod resource limits.

Stop if the render uses a mutable image tag as its release identity, an empty
native binding, an unexpected Secret, or an unexpected service account.

### 2. Prepare platform and Secrets

```bash
./scripts/deploy.sh setup
./scripts/deploy.sh secrets
```

The Prism command also verifies and creates its dedicated missing Secrets.
Confirm that `gatewayToken-prism` exists before deployment.

### 3. Deploy

```bash
./scripts/deploy.sh prism
```

The command performs these operations:

1. It verifies the selected images, values, and code bundle.
2. It validates the native worker deployment against the host policy.
3. It checks SPIFFE CSI support.
4. It verifies the Prism Secrets.
5. It lints and installs the Prism service chart with an atomic Helm upgrade.
6. It captures migration logs even when Helm removes a failed hook.
7. It lints and installs the separate `agent-prism` release.
8. It waits for PostgreSQL, Control, Studio, worker, and the Prism agent.

Atomic Helm rollback does not undo a committed database migration or an external
Secret change. Schema changes must remain compatible with the previous application
until the old workload can no longer return.

> **Source evidence — deployment order**
>
> [The deploy command runs render checks, host preflight, Secret checks, migration-aware Helm install, and agent install](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/deploy.sh#L1684-L1795).
>
> [Migrations take one advisory lock and commit each ordered migration name in one transaction](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/index.ts#L21-L75).

### 4. Verify status and smoke behavior

```bash
./scripts/deploy.sh prism-status
./scripts/deploy.sh prism-smoke
```

Also inspect the expected workloads:

```bash
kubectl get deploy agent-prism prism-control prism-worker prism-studio -n kubeclaw
kubectl get statefulset prism-postgresql -n kubeclaw
kubectl get jobs,cronjobs,pvc,svc,ingress -n kubeclaw
kubectl exec -n kubeclaw deployment/agent-prism -c kubeclaw -- openclaw gateway status
```

If the worker is not ready, do not bypass the readiness probe.
Readiness proves native ownership reconciliation and database nonce access.
Liveness only proves that the process can answer.

## The Complete Studio Journey

### Step 1: Let Nova create the governed project

The normal pipeline path starts with the `kubeclaw.prism-design` stage.
It verifies that the architecture artifact belongs to the same run, is JSON,
matches its digest, and is no larger than 256 KiB.
It then dispatches `prism.design-request.v1` to Prism.

Control stores the external project identity and the exact architecture artifact,
digest, revision, and content. A newer architecture supersedes an older active
request. A conflicting transition stops before a new round starts.

The first dispatch returns `waiting` and starts a durable agent job.
Nova independently creates a durable wait for `prism.approval.resolved`.

Do not create a second Nova run because directions are still pending.
The active request and job have durable identities.

### Step 2: Open Studio and choose the project

Find the private Studio address:

```bash
kubectl get ingress prism-studio -n kubeclaw
```

Open its HTTPS Tailscale address from an authenticated device.
Studio exchanges the trusted ingress identity for:

- an HTTP-only `prism_session` cookie;
- a separate `prism_csrf` cookie;
- the CSRF value used for state-changing requests;
- a stable hashed Prism `userId`.

Studio shows projects after Control has accepted them.
An empty project list does not create a project and does not invoke the agent.
Wait for the submitted project or diagnose the Nova-to-Control dispatch.

The source includes a standalone project API for tests and direct clients, but
the current production Studio project chooser does not show a create-project form.
The governed Nova path is the supported operator journey.

> **Source evidence — session and chooser**
>
> [Control validates the signed session and the separate CSRF cookie and header](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L108-L123).
>
> [The session route returns the CSRF value and stable user identity](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L152-L172).
>
> [Studio starts the session, lists projects, and loads the selected document](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/app.tsx#L97-L149).

### Step 3: Wait for exactly three directions

The Prism agent must commit exactly three materially different and valid Design
Documents for one generation. Control checks:

- three entries exist;
- their keys are unique;
- each entry has a key, title, summary, valid document, and generation identity;
- the documents pass the material-diversity rule;
- the durable job fence still owns the result.

Studio polls the current round until the direction set is available.
It shows the direction title, summary, trade-offs, and approved-corpus references.

If a request is interrupted, reload the same Studio URL.
Studio retains the round identity in session storage and reconnects to that round.
Do not clear session storage until you have reconciled the request or recorded why
the durable request can be abandoned.

> **Source evidence — direction commit and reconnect**
>
> [Control validates and stores exactly three agent directions](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L243-L277).
>
> [Studio retains the idempotency key and generation ID and rejects a superseded pending round](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/design-round-client.ts#L3-L48).

### Step 4: Compare, select, and give feedback

Use these actions deliberately:

| Action | Canonical effect |
| --- | --- |
| **Choose** | Selects one direction and rejects the other directions in the active round. It also changes Studio to the selected document. |
| **Reject** | Rejects that direction. Reject all three only when none is a useful base. |
| **More like this** | Records an explicit positive preference event. It does not select the direction. |
| **Less like this** | Records an explicit negative preference event. It does not reject the direction. |
| **Keep this detail** | Records an explicit preservation preference. It does not lock a node in the document. |

Each direction mutation uses an idempotency key.
Studio keeps the same key while the outcome is uncertain.
Do not repeat an uncertain request with a newly invented key.

Personal learning is a separate policy choice.
The pipeline can use a configured personal subject only when the platform-owned
`control.pipelinePreferenceSubject` matches the real authenticated subject.
Project content cannot select another person's subject.

> **Source evidence — human direction authority**
>
> [Control accepts only the supported feedback actions and requires an idempotency key](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L346-L387).
>
> [Studio retains one key for each uncertain direction mutation](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/app.tsx#L277-L330).

### Step 5: Request another design round when needed

Request another round only after you have a current document and revision.
The request binds:

- the internal project ID;
- current document ID;
- expected revision;
- parent round ID;
- a new idempotency key;
- current architecture digest and revision;
- the current preference snapshot and recorded feedback.

This is not a retry of the first round.
It is a new child round with a new generation identity.
Retry an uncertain request with the retained key.

Control locks the project transaction and rejects a stale document, stale parent,
or changed architecture. Late results from a superseded round cannot become the
current direction set.

> **Source evidence — round creation**
>
> [Control checks current project, architecture, parent, document, revision, and idempotency before it admits another round](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L346-L365).
>
> [Studio preserves the pending request and tells the operator to reconnect with the same key](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/app.tsx#L332-L348).

### Step 6: Edit the selected revision

Studio provides two change paths.

#### Typed visual edits

The visual editor converts supported Puck changes into Prism operations:

- insert a node;
- remove a node;
- duplicate a subtree;
- move a node;
- set node properties;
- set responsive properties;
- apply an atomic operation batch.

Every operation carries `baseRevision`.
Control applies it only to the current revision and creates a new immutable
revision. A concurrent edit causes a revision conflict instead of silent overwrite.

#### Natural-language revisions

Enter a concrete instruction and select **Propose change**.
Studio stores one pending request with its base revision and idempotency key.
Control creates a durable Prism agent job in the same project session.
The agent must return a complete document with exactly the next revision number.

If Studio loses the response, use **Reconcile existing change**.
Do not change the text or create a second request while the first identity is pending.
An uncertain external agent launch becomes `needs_nova`; it is not automatically
replayed because the first launch can have produced an external effect.

> **Source evidence — revisions**
>
> [The domain applies typed operations only at the expected base revision and then increments once](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/domain/index.ts#L67-L113).
>
> [The repository commits a new revision with compare-and-swap on the previous revision ID](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/index.ts#L262-L330).
>
> [Studio retains and reconciles one natural-language revision request](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/agent-revision-client.ts#L3-L35).

### Step 7: Inspect or restore history

Open revision history before approval.
It shows revision identity and creation time.

Restore does not move the current pointer back to old mutable state.
It copies the selected old content into a new revision after the current revision.
This preserves the complete history and gives the restore a new current identity.

After a restore, repeat evaluation and preview checks.
All prior warning acceptance and approval state is stale for the new revision.

> **Source evidence — restore**
>
> [Control exposes history and a restore operation for one document](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L389-L421).
>
> [Restore creates a new revision and records the source revision ID](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/index.ts#L211-L260).

### Step 8: Test the preview

Switch to Preview mode and inspect each required combination:

1. Select each view.
2. Select each declared state.
3. Check compact, regular, and wide viewports.
4. Follow every declared user action.
5. Confirm the success state and each recovery path.
6. Check keyboard operation, focus, names, contrast, motion, and alternative text.
7. Confirm that all assets load.

The preview is isolated generated markup for design intent.
It uses synthetic document data and declared flow transitions.
It is not proof that the future application backend, authorization, or production
integration works.

The preview loader accepts only content-addressed assets from Control, limits the
total bytes, checks media types, and creates browser object URLs.
Publication later creates independent worker-rendered screenshots and ARIA snapshots.

> **Source evidence — preview boundary**
>
> [Studio builds the preview from the selected view, state, viewport, assets, components, and theme](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/preview.ts#L1-L31).
>
> [Studio resolves only declared flow transitions from preview messages](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/flows.ts#L1-L48).

### Step 9: Evaluate the exact current revision

Run the design evaluation before approval.
The worker checks document coverage, references, flows, responsive definitions,
accessibility metadata, content structure, and visual-quality policy.

Findings have three levels:

| Level | Required operator action |
| --- | --- |
| `blocking` | Correct the document. Approval is not possible. |
| `review` | Read the exact finding and explicitly accept it only when the remaining trade-off is valid. |
| `information` | Record or inspect it as useful context. It does not block approval. |

Finding IDs are derived from the finding content.
A document change can create a different finding set.
Therefore, warning acceptance belongs to the evaluated revision and must not be
copied blindly to a later revision.

> **Source evidence — quality gate**
>
> [The evaluator defines finding levels, gate families, stable IDs, and the final status rule](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/evaluation/index.ts#L4-L36).
>
> [The evaluator checks document, node, asset, responsive, and flow references](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/evaluation/index.ts#L37-L235).

### Step 10: Approve and publish

Before you select **Approve design**, confirm:

- the intended direction is selected;
- the displayed document revision is the revision you reviewed;
- Preview checks are complete;
- evaluation has no blocking findings;
- every accepted review finding has a recorded reason outside Prism when your
  operating policy requires one;
- the active Nova architecture has not changed.

Studio performs two separate writes.

First, it creates an approval bound to:

- internal project ID;
- current document revision ID;
- SHA-256 digest of the complete Design Document;
- authenticated approver;
- exact accepted warning IDs;
- active architecture digest.

Second, it asks Control to publish a baseline for that approval.
Control rejects publication if the approval, document revision, document digest,
architecture, selected direction, quality result, or warning set changed.

Publication renders each declared view, state, and viewport.
It requires a screenshot, an ARIA snapshot, and no rendered accessibility finding.
It then creates the Baseline Bundle and stores its bytes by content digest.

The Studio success message contains the `bundleDigest` and `approvalId`.
Record both. The current UI does not provide a browser download button for the
archive. In this workflow, **export** means immutable publication to Prism's
artifact store. Nova performs the governed handoff and imports the archive.

> **Source evidence — approval and publication**
>
> [Control binds approval to the current document, quality findings, warnings, and active architecture](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L521-L565).
>
> [Control rejects a stale approval or changed warning set before publication](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L567-L629).
>
> [Control renders complete preview evidence and stores the assembled content-addressed bundle](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L630-L797).
>
> [Studio calculates the document digest, creates the approval, publishes the baseline, and shows both identities](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/app.tsx#L350-L405).

### Step 11: Resume Nova with the approved identities

Use the normal Nova signal command and the wait identity from the operator request.
The resume payload must contain the values below:

```json
{
  "decision": "approved",
  "issuer": {
    "type": "operator",
    "id": "THE_CONFIGURED_ISSUER_ID"
  },
  "approvalId": "THE_STUDIO_APPROVAL_ID",
  "architectureDigest": "sha256:THE_ACTIVE_ARCHITECTURE_DIGEST",
  "bundleDigest": "sha256:THE_PUBLISHED_BUNDLE_DIGEST"
}
```

The complete resume signal also has the Nova-owned signal envelope fields:
`schemaVersion`, `signalId`, `idempotencyKey`, `waitId`, `signalType`, and
`issuedAt`. Use the wait and signal procedure in [Operate the Pipeline](operate.md);
do not construct an unvalidated journal record.

All identities must match:

- signal type is `prism.approval.resolved`;
- issuer type is `operator`;
- issuer ID equals the stage configuration;
- approval ID names the Studio approval;
- architecture digest equals the active architecture used for the design;
- bundle digest equals the Studio publication result;
- signal time is inside the wait lifetime;
- signal idempotency key has not been used for different content.

After resume, Nova dispatches the same Prism request with `approvalId`.
Control returns only a baseline that belongs to the active request and approval.
Nova then validates archive size, encoding, safe paths, manifest, checksum set,
project, document revision, required files, assets, previews, and bundle digest.
Only then does the stage store the imported artifact and pass.

Do not resume with a guessed digest.
Do not use the Design Document digest as the bundle digest.
Do not reuse an approval after a new architecture or document revision.

> **Source evidence — final handoff**
>
> [Control returns the approved artifact and archive only for a matching active baseline](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L226-L240).
>
> [Nova verifies the complete Baseline Bundle before it stores the handoff artifact](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/nova/plugins/prism-design/src/archive.ts#L6-L88).

## What Is in the Baseline Bundle

The current publication contains:

| Member | Purpose |
| --- | --- |
| `manifest.json` | Project, revision, format, file references, asset references, preview reference, and bundle digest metadata |
| `checksums.json` | Digest for each governed member |
| `design-document.json` | Exact approved structured document |
| `design-specification.md` | Architecture context, chosen direction, evidence, screens, flows, responsive and accessibility guidance, rules, and limits |
| `acceptance-criteria.json` | Required view/state and flow outcomes for implementation verification |
| `quality-report.json` | Evaluation result and accepted warning IDs |
| `assets/*` | Approved content-addressed binary assets |
| `previews/index.json` | Preview identities, targets, dimensions, renderer evidence, and digests |
| `previews/*.png` | Deterministic rendered preview captures |
| `previews/*.aria.txt` | Accessibility-tree snapshots for the matching captures |

The bundle is immutable because its digest covers its governed checksums.
An artifact ID proves stored bytes; it does not by itself prove that the bundle
was approved. The approval and active architecture binding supply that authority.

> **Contract evidence — archive format**
>
> [The archive assembler builds the manifest, checksum document, canonical JSON, and final bundle digest](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/src/baseline-archive.ts#L1-L92).

## Safe Recovery Procedures

### Studio page closed during a new round

1. Reopen the same project URL in the same browser session.
2. Let Studio read the retained round request.
3. Retry the same request identity when Studio offers that action.
4. Stop if Studio says the round was superseded.
5. Inspect the current Control round before you clear session storage.

Reason: a new idempotency key can create a second intended round. The retained
key distinguishes a retry from new product work.

### Studio page closed during a natural-language revision

1. Reopen the same document URL in the same browser session.
2. Select **Reconcile existing change**.
3. Keep the original instruction and key.
4. Stop on `needs_nova`, a changed job identity, or a returned revision other than
   exactly `baseRevision + 1`.

Reason: Control never treats an uncertain external OpenClaw launch as safe to replay.

### Revision conflict

1. Do not resubmit the old operation with a changed base revision.
2. Reload the current document and history.
3. Compare the other committed change with your intended change.
4. Create a new operation against the current revision only after that review.

Reason: changing only the revision number can apply an old intention to new content.

### Approval or publication rejected as stale

1. Reload the current document and active directions.
2. Confirm the active architecture request.
3. Run evaluation again.
4. Repeat all preview checks affected by the change.
5. Create a new approval for the new current revision.

Never modify the database approval row or baseline row.

### Worker not ready

1. Check `/health`, `/bootstrap`, and `/ready` separately.
2. Inspect native worker reconciliation diagnostics.
3. Verify the selected node, pool namespace, policy digest, engine content digest,
   cgroup v2 pool, ownership store, journal, and nonce database.
4. Keep admission closed until all retained ownership is reconciled.

Reason: a healthy process can still be unsafe to admit because a previous attempt
or process tree has unresolved ownership.

### Deployment failed during migration

1. Read the captured `bootstrap-database-roles` and `migrate` output from the deploy command.
2. Determine whether a migration committed before the workload rollback.
3. Keep the current database and runtime Secrets.
4. Use the database transition and recovery procedure before any credential change
   or destructive restore.
5. Do not assume Helm rollback changed the database back.

### Artifact or bundle verification failed

1. Keep the original artifact bytes and IDs.
2. Record the expected and actual digest and failing member.
3. Do not republish a different archive under the old approval.
4. Diagnose artifact-store durability, worker rendering, and bundle assembly.
5. Publish a new baseline only through a new valid current approval when content changes.

The artifact store verifies bytes on read and uses write, sync, hard-link, and
directory-sync steps before it acknowledges an object.

> **Source evidence — durable artifacts**
>
> [The artifact store verifies regular files and content digests on every read](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/artifacts.ts#L20-L29).
>
> [Artifact publication uses a private pending file, file sync, non-replacing link, and directory sync](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/artifacts.ts#L39-L67).

## Diagnosis Map

| Symptom | Most likely boundary | First evidence | Safe next action |
| --- | --- | --- | --- |
| Studio shows no projects | Nova dispatch or Control admission | Nova stage result; Control request log; `prism.project` and active `design_request` | Reconcile the original dispatch. Do not create a replacement project. |
| Project exists but has no directions | Prism agent job | `prism.agent_job` state, fence, result, and outcome; agent bridge log | Wait, reconcile, or escalate `needs_nova`. Do not replay an uncertain launch. |
| Studio says invalid session | Tailscale identity exchange or cookie forwarding | Studio proxy log; two `Set-Cookie` headers | Fix ingress/proxy handling. Do not weaken CSRF or session checks. |
| New round remains pending | Durable round or agent job | Browser-retained generation ID; current round ID; job state | Retry the same retained request identity. |
| Visual edit reports revision conflict | Concurrent document change | Current document and revision history | Reload, compare, and author a new operation. |
| Natural-language change remains pending | Agent job reconciliation | Retained job ID and `/v1/agent-jobs/{id}` receipt | Reconcile the same job. Escalate `needs_nova`. |
| Preview asset fails | Artifact reference, size, media type, or digest | Browser error and Control artifact read | Verify the bound artifact. Do not replace bytes behind an ID. |
| Evaluation is blocked | Design Document quality | Exact finding ID, gate, target, and message | Correct the current document and evaluate again. |
| Approval fails | Current revision, digest, ownership, or warning set | Control response and current document digest | Reload and review. Never patch the approval table. |
| Publication fails during capture | Worker render, browser, asset, or accessibility evidence | Worker result, full log artifact, target ID | Fix the document or worker boundary, then create a valid new publication attempt. |
| Nova rejects resume | Wait, issuer, architecture, approval, or bundle identity | Nova signal validation and Prism stage reason | Correct the signal through the normal authenticated path. |
| Nova rejects archive | Stored bytes or archive member contract | Exact `PRISM_ARCHIVE_*` error | Preserve evidence and diagnose. Do not bypass verification. |
| Worker returns 503 on `/ready` | Native reconciliation or nonce database | Readiness JSON and worker diagnostic event | Restore the dependency or reconcile ownership before admission. |

Control currently writes request failures to process logs.
Studio and ingestion write structured error records for unhandled request I/O.
The worker writes structured readiness, shutdown, and failure events.
The current Prism services do not expose a dedicated Prometheus metrics endpoint
or distributed trace interface. Kubernetes probes, structured logs, durable database
rows, attempt journals, and artifacts are the implemented evidence surfaces.
Do not claim metrics or trace coverage that is not present.

## Backup, Restore, and Removal

The canonical recovery group contains at least:

- PostgreSQL data;
- the artifact PVC;
- Prism runtime and database Secret values;
- external OpenClaw, bundle-reader, and optional product-authority credentials;
- native worker ownership and journal state required by the selected host policy.

Database rows and artifact bytes must match.
A database restore without its artifact generation can leave valid references to
missing bytes. An artifact restore without its database generation can leave bytes
that have no authoritative reference.

The chart schedules local backup and proof jobs, but local PVC backups are not an
independent off-host copy. Retention limits also do not create automatic expiry.
The operator must provide and verify the off-host copy and credential recovery set.

To remove only Prism workloads while retaining data and Secrets:

```bash
./scripts/deploy.sh teardown-prism
```

Use `teardown-all` only for a disposable environment and only after its destructive
confirmation. The artifact and backup PVCs have Helm keep policy, but namespace
deletion can still remove namespaced storage objects according to cluster policy.

## Local Development and Verification

Install the root and Prism spike dependencies with the maintained bootstrap:

```bash
npm run bootstrap:prism:tests
```

The script uses `npm ci`, includes development dependencies, disables package
scripts, and installs the four Prism spike packages.

Use the smallest check that proves your change, then run the repository gate.

| Change | Minimum focused check |
| --- | --- |
| Contract or Baseline Bundle | `npm run verify:prism:contracts` |
| Document operations or revision storage | `npm run verify:prism:domain` and `npm run verify:prism:storage` |
| Renderer or capture | `npm run verify:prism:renderer` and `npm run verify:prism:engine` |
| Studio client, proxy, or interaction | `npm run verify:prism:studio` |
| Corpus, retrieval, or embedding | `npm run verify:prism:corpus` |
| Quality or directions | `npm run verify:prism:quality` |
| Nova/Buster handoff adapter | `npm run verify:prism:pipeline` |
| Helm values or workload | `npm run verify:prism:helm` |
| Cross-component repository flow | `npm run verify:prism:e2e` |
| Complete local Prism package | `npm run verify:prism` |
| Deployment, images, runtime role, Nova stage, and docs | `npm run verify:prism:repository` |
| Native worker behavior | `npm run verify:prism:native-worker` in the required isolated native environment |
| Live installed services | `npm run verify:prism:services:live` |
| Full live cluster path | `npm run verify:prism:cluster:live` and `npm run verify:prism:nova-stage:live` |
| Production release evidence | `npm run verify:prism:production` |

Local tests do not prove a real cluster, Tailscale identity, SPIFFE workload,
native cgroup host, browser image, external model route, backup restore, or Nova
round trip. Live commands do not become successful evidence merely because their
scripts exist. Record the environment, selected commit and digests, command, time,
and retained output for each live acceptance.

> **Test evidence**
>
> [Root scripts keep focused, repository, native, and live Prism gates separate](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/package.json#L28-L41).
>
> [Deployment and production Prism checks remain separate from local package tests](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/package.json#L213-L226).
>
> [The bootstrap installs deterministic dependencies for the root and four spike packages](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/scripts/bootstrap-prism-tests.sh#L1-L8).

## Implemented, Environment-Dependent, and Not an Operator Surface

| Capability | Current status | What you can claim |
| --- | --- | --- |
| Project, request, round, direction, document, revision, approval, and baseline persistence | Implemented and covered by source-level tests | The contracts and database behavior work in the tested environment. |
| Studio chooser, visual editing, natural-language request reconciliation, preview, evaluation, approval, and publication request | Implemented and covered by build, unit, and browser tests | The maintained UI behavior works under its test setup. |
| Durable native worker operation and restart journal | Implemented; native proof needs a prepared Linux host and isolated database | Claim native operation only with retained native gate evidence. |
| PostgreSQL migration and pgvector retrieval | Implemented; native PostgreSQL proof needs configured test databases | Claim actual PostgreSQL behavior only when the native suite ran. |
| Tailscale Studio ingress and SPIFFE service trust | Charted and checked structurally; live proof is environment-specific | Claim live identity only after cluster tests. |
| Prism agent through OpenClaw and LiteLLM | Implemented deployment path; actual provider proof is live | Do not infer provider success from deterministic worker tests. |
| Corpus public-web acquisition | Acquisition code exists, but Control rejects `public-web` until a source policy is approved | Do not present public-web ingestion as an enabled operator feature. |
| Ingestion service | Implemented but disabled by default | Enable only with explicit resource sizing and source policy. |
| Browser archive download in Studio | Not implemented as a user action | Use the Nova governed handoff or an authorized artifact client. |
| Automatic Nova resume after Studio approval | Not implemented by design | Submit the separate authenticated signal. |
| `toBusterPlan` and `toForgeAssignments` handoff helpers | Implemented and tested as declarative conversion helpers; no maintained production caller is present | Do not claim that they apply Buster manifests, filesystem access, or module assignments. |
| Dedicated Prism metrics and distributed tracing endpoint | Not implemented | Use probes, logs, durable state, journals, and artifacts. |
| Horizontal Prism worker scaling | Not the current native deployment model | The current native worker is one Recreate replica bound to one host policy. |

The pipeline helper limit is important. The helpers return data structures only.
Their tests prove conversion and rejection rules, not an installed downstream
deployment.

> [The handoff helpers create a visual-plan fragment and read-only assignment declarations](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/pipeline-adapter/index.ts#L1-L57).

## Developer Routing

This page tells an operator how to use supported behavior.
Do not use it as the only design document for a code change.

| Intended change | Start with | Required boundary to preserve |
| --- | --- | --- |
| Control route or transaction | `skills/prism/server/control-server.ts` and `skills/prism/storage/index.ts` | Authentication, project lock, revision CAS, active architecture, idempotency, and durable result order |
| Prism agent behavior | `skills/prism/server/agent-job-runner.mjs` and `skills/prism/openclaw-plugin/` | One durable job, one fence, one project session, no uncertain automatic replay |
| Worker operation | `skills/prism/server/native-worker-execution.ts` and the Worker Core guide | Accepted v3 identity, native ownership, bounded I/O, drain, final counters, and sealed result |
| Studio interaction | `skills/prism/studio/app.tsx` and focused clients | Session and CSRF, current revision, retained idempotency identity, no local canonical state |
| Renderer or node catalog | `contracts/prism/v1/` and `skills/prism/renderer/` | Closed schema, safe escaping, deterministic output, accessibility, and old-document compatibility |
| Corpus or retrieval | `skills/prism/corpus/` and ingestion service | Rights eligibility before ranking, exact source evidence, bounded acquisition, and deterministic fusion |
| Storage or migration | `skills/prism/storage/` | Forward-compatible migration, transaction owner, grants, matched database/artifact recovery, and old workload compatibility |
| Pipeline handoff | `skills/nova/plugins/prism-design/` and `skills/prism/pipeline-adapter/` | Active architecture, operator approval, content digest, safe archive import, and read-only downstream assignment |

The full change procedure, extension contracts, and compatibility matrices belong
in the AP9.4 developer guide. Until that guide is complete, read the relevant
source, contract, migration, chart, and focused tests together. Do not derive a
new extension contract from an old architecture proposal alone.

## Completion Checklist

A Prism operator journey is complete only when all statements below are true:

- the selected release and code bundle match one reviewed source commit;
- Prism service and agent releases are ready;
- the native worker reports ready after ownership reconciliation;
- Control stored the intended active architecture digest and revision;
- the agent committed exactly three current directions;
- a human selected one direction and reviewed the exact current revision;
- all required views, states, flows, and viewports were previewed;
- the evaluation has no blocking findings;
- each remaining review finding was explicitly accepted;
- Studio returned an approval ID and Baseline Bundle digest;
- the Nova resume signal used the original wait, authorized issuer, active
  architecture digest, approval ID, and bundle digest;
- Nova verified and stored the immutable Baseline Bundle;
- retained evidence identifies the commit, release digests, run, project,
  architecture, round, document revision, approval, bundle, and final Nova artifact.

If one item is unknown, state that limit.
Do not convert missing evidence into a successful claim.

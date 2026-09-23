# Host, OpenClaw, and Prism Configuration

Status: current configuration map with explicit consumer boundaries
Audience: platform operator, Prism operator, host administrator
Owner: platform operations and Prism
Evidence: charts/kubeclaw/files/config/swarm.config.json; tests/verification/e2e/support/platform-config.ts; charts/prism/values.yaml; charts/prism/values.schema.json; skills/prism/server/control-config.ts; skills/prism/server/worker-config.ts; skills/prism/config/native-worker.ts
Applies to: current shipped chart configuration and Prism service loaders
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`

## Configuration families

There is no one “KubeClaw config.” Select the family by consumer.

| Source | Consumer | Authority |
| --- | --- | --- |
| `pipeline-platform.v2` JSON passed to Nova | Plugin runtime and Nova Core | Package trust, providers, capability grants, adapters, observers, state root, and decision issuers. This is the pipeline runtime authority. |
| KubeClaw Helm values and rendered OpenClaw configuration | Kubernetes chart, gateway, host plugins, agent runtime | Deployment images, pods, volumes, service accounts, gateway, OpenClaw agents, and Secret references. |
| `swarm.config.json` | Current real-run verification support and shipped classic-pipeline configuration path | Compact selection of one test/runtime profile. It is not accepted by the `pipeline-platform.v2` loader and grants no plugin capability. |
| Prism Helm values | Prism chart | Images, replicas, native host binding, storage, trust mode, product decisions, and deployment resources. |
| Prism process environment | Individual Prism service loaders | Rendered service URLs, credentials, timeouts, ingress limits, native limits, and exact trust identities. |
| Root-owned native pool policy | Prism native supervisor | Actual aggregate cgroup capacity and host identity. An environment variable only points to it. |

For Helm and Secret key details, use [Helm values](helm-values.md),
[Environment variables](environment-variables.md), and [Secrets](secrets.md).
This page explains which layer owns the effective value and records the fields
that runtime loaders consume.

## Compact `swarm.config.json`

The chart ships this compact shape:

```json
{
  "profile": "standard",
  "features": {
    "observability": true,
    "buster": true,
    "discord_alerts": true
  },
  "tuning": {
    "safety_margins": "high",
    "retention": "high",
    "alerts": "rich",
    "logs": "verbose",
    "checks": "strict",
    "determinism": "strict"
  },
  "overrides": {}
}
```

The shipped expander is currently part of real-run verification support. It is
not the production plugin-platform loader. Code that calls this expander
accepts the following compact fields:

| Field | Rule |
| --- | --- |
| `_doc` | Optional documentation string; it has no runtime authority. |
| `profile` | Must be `standard`; no other profile is registered. |
| `features` | Required exact object: all three keys `observability`, `buster`, and `discord_alerts` must be `true`; no extra keys. These are profile assertions, not independent switches. |
| `tuning` | Required exact object: `safety_margins`, `retention`, `alerts`, `logs`, `checks`, and `determinism` must have the shipped values shown above. |
| `overrides` | Optional object; default `{}`. Every leaf path must already exist in the expanded profile. Objects merge recursively; scalar and array leaves replace. |
| `discord_webhook_url` | Optional string copied to the expanded config. Keep it out of checked-in files; chart rendering obtains it from a Secret. |
| `run_id` | Optional run-scoped identity copied to the expanded config. |
| `project`, `repo_root`, `paths` | Runtime-derived fields accepted and copied by the expander. Do not set them in the chart's static source. |

Any compact authority field (`profile`, `features`, `tuning`, or `overrides`)
selects compact handling. Unknown compact keys fail. Override paths cannot add
new effective keys. The expander substitutes `${repo_root}` placeholders after
overrides and fails if the required non-empty context is absent.

The expanded standard profile contains classic pipeline timing, lock, Git,
gateway, Buster, telemetry, agent-observability, lint, agent-dispatch, and host
plugin settings. These values are a shipped verification/runtime baseline, not
defaults for `pipeline-platform.v2`. Do not copy `providers`, `grants`, or
storage authority from it by inference.

## OpenClaw and Codex boundary

Helm renders OpenClaw gateway configuration and managed agent entries. The
gateway configuration controls the host process, authentication, model route,
ACP backend, channel, and plugin allowlist. Pipeline stage fields such as
`agent` and `agentRole` select a target already configured by the runtime
dispatch adapter; they do not edit OpenClaw configuration or grant host plugin
permissions.

Codex/ACP and subagent selection can appear in an expanded swarm profile or a
runtime-dispatch target. The effective transport still comes from the consumer
that loads that configuration. A model name is routing data, not proof that
credentials, network access, or provider capacity exist.

## Prism Helm roots

The Prism values schema requires these roots: `images`, `imagePullSecrets`,
`control`, `studio`, `worker`, `postgresql`, `secrets`, and `artifactStorage`.
The checked values also define `ingestion`, `backup`, `tailscale`, and
`workerTrust`.

Important recursive boundaries are:

| Path | Constraint and consequence |
| --- | --- |
| `images.{control,studio,worker,ingestion}` | Closed `{repository,digest,pullPolicy}`. Repository is non-empty; digest is lowercase `sha256:`; pull policy is `IfNotPresent` or `Never`. Digest changes executable identity and rolls workloads. |
| `control.productDecisions` | Explicit enable flag, operators, token lifetime, issuer/origin/revision, signing Secret name/key, controller URL/namespace/release, CA Secret name/key, and audience. When enabled, operators are non-empty and HTTPS/Kubernetes-name constraints apply. |
| `control.pipelinePreferenceSubject` | Empty disables pipeline personal preference; a non-empty value must name an already authorized Prism subject. |
| `worker.replicas` | Exact `1`; the current native ownership model does not support horizontal worker replicas. |
| `worker.native` | Required closed `{nodeName,namespace,policyDigest,closeTimeoutMs}`. Node/namespace are non-empty after host preparation; digest is 64 lowercase hexadecimal characters; timeout is 1–2,147,483,647. |
| `worker.shutdownTimeoutMs` | Integer 1–2,147,483,647. |
| `worker.terminationGracePeriodSeconds` | Integer 1–2,147,483. Keep it longer than the worker's bounded shutdown path. |
| `ingestion` | `enabled`, non-negative `replicas`, and `quarantineTtlMs` from 60,000 to 86,400,000. Enabling it requires explicit CPU/memory requests and limits. |
| `postgresql` | Deployment/storage choice and existing credential Secret. Database storage and artifacts are independent retained data. |
| `secrets.runtime`, `secrets.database` | Names of existing Secrets consumed by templates. Values are references, never inline credential defaults. |
| `artifactStorage` | Persistent size and optional storage class. It does not configure database retention. |
| `workerTrust.spiffe` | Selects SPIFFE/mTLS proxying and exact trust-domain/service-account identities. When disabled, shared Secret paths are required instead. |

Use Helm schema validation and a rendered-manifest inspection for the exhaustive
deployment surface. Runtime loaders below remain the authority for process
defaults and conditional requirements.

## Prism Control process

| Environment variable | Required/default | Consumer meaning |
| --- | --- | --- |
| `PRISM_PIPELINE_PREFERENCE_SUBJECT` | Optional | Existing subject authorized at startup; absence disables pipeline preference binding. |
| `PRISM_SESSION_SECRET`, `PRISM_INGRESS_SECRET`, `PRISM_INGESTION_SECRET` | Required non-empty | Session signing, trusted ingress, and ingestion authentication. |
| `WORKER_TRUST_SPIFFE_ENABLED` | Exact string `true` enables SPIFFE; all other values select shared-secret mode | Chooses worker trust mechanism. |
| `PRISM_TRUSTED_NOVA_SPIFFE_ID`, `PRISM_TRUSTED_WORKER_SPIFFE_ID`, `PRISM_CONTROL_SPIFFE_ID`, `PRISM_TRUSTED_AGENT_SPIFFE_ID` | All required non-empty in SPIFFE mode | Exact peer identities. |
| `PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID` | Optional, default empty | Additional test-runner peer when explicitly configured. |
| `PRISM_DISPATCH_SECRET`, `PRISM_WORKER_SECRET` | Required in shared-secret mode; ignored as authority in SPIFFE mode | Dispatch and worker authentication. |
| `ARTIFACT_ROOT` | Default `/var/lib/prism/artifacts` | Durable artifact path. |
| `PRISM_WORKER_URL` | Default `http://prism-worker:8080` | Worker endpoint. |
| `PRISM_INGESTION_URL` | Default `http://prism-ingestion:8080` | Ingestion endpoint. |
| `PRISM_CONTROL_INTERNAL_URL` | Default `http://prism-control:8080` | Internal callback endpoint. |
| `PRISM_STUDIO_PUBLIC_URL` | Default `https://prism-studio` | Public Studio origin used in responses. |
| `DATABASE_URL` | No loader default | PostgreSQL connection used by the listener. Chart supplies a runtime-role URL. |
| `PORT` | Numeric conversion, default 8080 | Listener port. Deployment should keep it in 1–65,535 even where this loader does not repeat the range check. |
| `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` | Positive timer-safe integer, default 67,108,864 | Maximum native response body retained by Control. |
| `PRISM_NATIVE_DISPATCH_TIMEOUT_MS` | Positive timer-safe integer, default 900,000 | Control-to-worker request deadline. |

Product-decision configuration is disabled unless
`PRISM_PRODUCT_DECISIONS_ENABLED=true`. When enabled, the loader requires
`PRISM_PRODUCT_ORIGIN`, `PRISM_PRODUCT_CONTROLLER_URL`,
`PRISM_PRODUCT_OPERATORS` (non-empty unique JSON string array),
`PRISM_PRODUCT_PRIVATE_KEY_FILE` (dedicated Ed25519 key),
`PRISM_PRODUCT_ISSUER`, `PRISM_PRODUCT_CONTROLLER_CA_FILE`, and
`PRISM_PRODUCT_CONTROLLER_TOKEN_FILE`. Both URLs must be credential-free HTTPS
origins with `/` as the path.

## Prism Worker and native supervisor

The worker process consumes:

| Variable | Default or requirement |
| --- | --- |
| `PRISM_WORKER_SECRET` | Required outside SPIFFE mode. |
| `PRISM_TRUSTED_CONTROL_SPIFFE_ID` | Required in SPIFFE mode. |
| `DATABASE_URL` | Required outside SPIFFE mode; chart supplies it in both modes. |
| `PRISM_CONTROL_INTERNAL_URL` | `http://prism-control:8080`. |
| `PORT` | `8080`. |
| `PRISM_WORKER_MAXIMUM_ACTIVE_REQUESTS` | `16`, integer 1–2,147,483,647. |
| `PRISM_WORKER_MAXIMUM_PROBE_REQUESTS` | `4`, same range. |
| `PRISM_WORKER_MAXIMUM_CONNECTIONS` | `128`, same range. |
| `PRISM_NATIVE_MAXIMUM_INPUT_BYTES` | `16,777,216`, same range; native host mode requires it explicitly. |
| `PRISM_WORKER_REQUEST_BODY_TIMEOUT_MS` | `120,000`, same range. |
| `PRISM_WORKER_SHUTDOWN_TIMEOUT_MS` | `120,000`, same range. |

The native supervisor additionally requires normalized absolute
`PRISM_NATIVE_POOL_POLICY_FILE` and `PRISM_NATIVE_LAUNCHER` paths; an exact
production `PRISM_ENGINE_CONTENT_DIGEST`; and the host-created pool policy. Its
numeric settings are positive integers:

| Variable | Default |
| --- | --- |
| `PRISM_NATIVE_CPU_TIME_MS` | 60,000 |
| `PRISM_NATIVE_MEMORY_BYTES` | 8,589,934,592 |
| `PRISM_NATIVE_TASKS` | 2,048 |
| `PRISM_NATIVE_UID`, `PRISM_NATIVE_GID` | 1,000 each |
| `PRISM_NATIVE_MAXIMUM_OWNERSHIP_RECORDS` | 65,536 |
| `PRISM_NATIVE_MAXIMUM_OWNERSHIP_BYTES` | 67,108,864 |
| `PRISM_NATIVE_MAXIMUM_OUTPUT_BYTES` | 33,554,432 |
| `PRISM_NATIVE_MAXIMUM_RESULT_BYTES` | 67,108,864 |
| `PRISM_NATIVE_MAXIMUM_JOURNAL_BYTES` | 68,719,476,736 |
| `PRISM_NATIVE_POLL_INTERVAL_MS` | 20 |
| `PRISM_NATIVE_DRAIN_TIMEOUT_MS` | 10,000 |
| `PRISM_NATIVE_CLOSE_TIMEOUT_MS` | 105,000 |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` |

The native child receives `KUBECLAW_NATIVE_SCOPE`, input limit, Control URL,
trust mode, and artifact authentication from the supervisor. These are
derived/admission values, not operator alternatives to the pool policy.

## Studio, ingestion, and database bootstrap

Studio accepts `PORT` (default 8080, range 1–65,535),
`PRISM_CONTROL_TIMEOUT_MS` (default 30,000, positive timer-safe integer),
`STUDIO_ROOT` (default packaged `dist-studio`), `PRISM_CONTROL_URL` (default
`http://prism-control:8080`), and `PRISM_INGRESS_SECRET` (default empty in
standalone code; production chart supplies it).

Ingestion requires `PRISM_INGESTION_SECRET`, uses `PRISM_QUARANTINE_ROOT`
default `/quarantine`, clamps integer `PRISM_QUARANTINE_TTL_MS` to
60,000–86,400,000 with default 3,600,000, and uses `PORT` default 8080. A value
outside the TTL range is clamped rather than rejected; a non-integer is
rejected. This TTL applies to quarantined acquisition content only.

Database bootstrap requires `ADMIN_DATABASE_URL`, `PRISM_MIGRATOR_PASSWORD`,
`PRISM_RUNTIME_PASSWORD`, and `PRISM_READONLY_PASSWORD`. Its fixed retry policy
is 60 attempts, 2,000 ms apart, with a 5,000 ms connection timeout. Ordinary
service startup does not rotate these credentials.

## Precedence and operational impact

Helm values render Kubernetes environment, volume, Secret, and workload
identity. The process reads the rendered environment once at startup; changing
a Secret or value does not mutate an already loaded snapshot. Roll the affected
workload after a configuration change. Native pool policy and node preparation
must complete before the Prism worker can become ready.

Environment values rendered directly by a chart take precedence only because
the process reads them; they do not override `pipeline-platform.v2`. Compact
swarm-profile overrides apply only inside a caller that invokes the expander.
See [Configuration precedence](configuration-precedence.md).

> **Source evidence — consumer separation**
>
> **Claim:** The compact swarm profile is expanded only by its explicit caller, while Prism captures separate process configuration and conditional trust requirements at startup.
>
> **Implementation:** [compact detection and expansion](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/e2e/support/platform-config.ts#L152-L199); [Control loader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/server/control-config.ts#L9-L64); [worker loader](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/server/worker-config.ts#L1-L38)
>
> **Contract or setting:** [shipped compact source](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/charts/kubeclaw/files/config/swarm.config.json#L1-L18); [result, deadline, identity, and resource settings](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/config/native-worker.ts#L4-L35)
>
> [Host admission settings](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/config/native-worker.ts#L38-L47); [supervisor paths and bounds](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/config/native-worker.ts#L50-L83)
>
> **Test evidence:** [Prism Control configuration tests](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/tests/control-server-config.test.mts#L1-L58)
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Checked values and rendered manifests do not prove live node capacity, external identity issuance, database health, or credential validity.

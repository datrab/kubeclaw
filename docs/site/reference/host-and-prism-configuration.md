# Host, OpenClaw, and Prism Configuration

Status: current configuration map with explicit consumer boundaries
Audience: platform operator, Prism operator, host administrator
Owner: platform operations and Prism
Evidence: charts/kubeclaw/files/config/swarm.config.json; tests/verification/e2e/support/platform-config.ts; charts/prism/values.yaml; charts/prism/values.schema.json; skills/prism/server/control-config.ts; skills/prism/server/worker-config.ts; skills/prism/config/native-worker.ts
Applies to: current shipped chart configuration and Prism service loaders
Last verified: 2026-10-09 at source revision `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`

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
This page explains which layer owns the effective value and how runtime
loaders admit it. Generated references own the field and default inventories.

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

Use the [generated environment inventory](environment-variables.md#variables)
for the complete variable contract and exact selected defaults. It identifies
each producer and runtime reader; chart-injected values must be changed through
their producer. This page explains the loader's conditional admission rules.

Control always requires non-empty session, ingress, and ingestion authentication
settings. Exact `WORKER_TRUST_SPIFFE_ENABLED=true` selects SPIFFE and requires
the Nova, worker, Control, and agent identities. The test-runner identity is a
separate optional peer. Other flag values select shared-secret mode, which
requires dispatch and worker secrets instead. A configured peer ID is an exact
allowlist value, not evidence that the peer has received a valid identity.

`PRISM_PIPELINE_PREFERENCE_SUBJECT` is optional. Absence disables pipeline
personal preference; a selected subject must already be authorized at startup.
The database URL is supplied by the chart's runtime-role Secret. Listener,
artifact-root, service URL, result-size, and dispatch-timeout settings apply to
Control only. A Studio or agent loopback URL must not replace a worker URL.

Product-decision configuration is disabled unless
`PRISM_PRODUCT_DECISIONS_ENABLED=true`. When enabled, the loader requires
`PRISM_PRODUCT_ORIGIN`, `PRISM_PRODUCT_CONTROLLER_URL`,
`PRISM_PRODUCT_OPERATORS` (non-empty unique JSON string array),
`PRISM_PRODUCT_PRIVATE_KEY_FILE` (dedicated Ed25519 key),
`PRISM_PRODUCT_ISSUER`, `PRISM_PRODUCT_CONTROLLER_CA_FILE`, and
`PRISM_PRODUCT_CONTROLLER_TOKEN_FILE`. Both URLs must be credential-free HTTPS
origins with `/` as the path.

## Prism Worker and native supervisor

The [generated environment inventory](environment-variables.md#variables)
records Worker and native-supervisor variables, defaults, and integer limits.
Worker ingress limits bound active requests, probe requests, connections, input
bytes, request-body time, and shutdown time. In SPIFFE mode the worker requires
the exact Control identity; outside that mode it requires the worker secret
and database URL. The chart supplies the database URL in both modes.

The supervisor additionally requires normalized absolute pool-policy and
launcher paths, a production engine content digest, and a host-created policy.
Its CPU, memory, process-count, UID/GID, ownership, journal, output, result,
poll, drain, and close settings bound a native attempt. Process environment
cannot enlarge aggregate capacity admitted by the root-owned host policy.

The native child receives `KUBECLAW_NATIVE_SCOPE`, input limit, Control URL,
trust mode, and artifact authentication from the supervisor. These are
derived/admission values, not operator alternatives to the pool policy.

## Studio, ingestion, and database bootstrap

Studio validates its listener port and Control request timeout. Its packaged
UI root, Control destination, and ingress authentication belong to the Studio
process. The standalone loader permits an empty ingress secret; production
must supply trusted ingress through the chart and prove the private access path.

Ingestion requires its own ingestion secret and temporary quarantine root.
A quarantine TTL outside the supported range is clamped; a non-integer is
rejected. This lifetime removes quarantined acquisition content, not published
corpus, approval, or artifact data. Use the generated environment rows for exact
bounds and defaults.

Database bootstrap requires the administrative database URL and separate
migrator, runtime, and read-only role passwords. Its retry and connection policy
comes from the bootstrap loader; ordinary service startup does not rotate
credentials. A new password must be coordinated with the database role and all
consumers, not applied as a Pod-only environment change.

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
> **Implementation:** [compact detection and expansion](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/tests/verification/e2e/support/platform-config.ts#L152-L199); [Control loader](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/server/control-config.ts#L9-L64); [worker loader](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/server/worker-config.ts#L1-L38)
>
> **Contract or setting:** [shipped compact source](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/charts/kubeclaw/files/config/swarm.config.json#L1-L18); [result, deadline, identity, and resource settings](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/config/native-worker.ts#L4-L35)
>
> [Host admission settings](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/config/native-worker.ts#L38-L47); [supervisor paths and bounds](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/config/native-worker.ts#L50-L83)
>
> **Test evidence:** [Prism Control configuration tests](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/prism/tests/control-server-config.test.mts#L1-L58)
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran `node --test skills/prism/tests/control-server-config.test.mts`: three tests passed, exit zero. Verification did not include a cluster or native-worker check.
>
> **Revision:** `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`
>
> **Limit:** Checked values and rendered manifests do not prove live node capacity, external identity issuance, database health, or credential validity.

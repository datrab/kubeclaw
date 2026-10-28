# Host, OpenClaw, and Prism Configuration

Status: current configuration map with explicit consumer boundaries
Audience: platform operator, Prism operator, host administrator
Owner: platform operations and Prism
Evidence: skills/nova/plugins/implementation-agent/src/stage.ts; skills/nova/plugins/buster-quality-gate/src/stage.ts; skills/common/plugins/runtime-dispatch/src/openclaw.ts; charts/kubeclaw/files/config/swarm.config.json; tests/verification/e2e/support/platform-config.ts; charts/prism/values.yaml; charts/prism/values.schema.json; skills/prism/server/control-config.ts; skills/prism/server/worker-config.ts; skills/prism/config/native-worker.ts; ops/pod/config.toml; ops/pod/supervisor.py; ops/pod/Dockerfile; ops/pod/verify.py; charts/ops-pod/templates/workload.yaml; charts/ops-pod/values.yaml
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
| Root-owned native pool policy | Prism native supervisor | Aggregate resource capacity in a Linux [control group (cgroup)](glossary.md#cgroup) and host identity. An environment variable only points to it. |

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
| `_doc` | Ignored input metadata; the expander neither copies the supplied value nor validates its type. The standard profile's own documentation remains. It has no runtime authority. |
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

ACP means [Agent Client Protocol](https://docs.openclaw.ai/tools/acp-agents).
OpenClaw uses an ACP backend plugin to run external coding tools in sessions.
The runtime-dispatch target [selects this path with `runtime: "acp"`](https://github.com/datrab/kubeclaw/blob/c8987b18b450bc27571d5037cb6ce3fb26e0cbd0/skills/common/plugins/runtime-dispatch/src/openclaw.ts#L230-L238).
See [OpenClaw session lifecycle](../understand/openclaw.md#session-lifecycle)
for polling, cancellation, and uncertain session recovery.

Helm renders OpenClaw gateway configuration and managed agent entries. The
gateway configuration controls the host process, authentication, model route,
ACP backend, channel, and plugin allowlist. The implementation and quality-gate
stages use stage configuration `agent` to select an already configured
`runtime.dispatch` target. Their stage `agentRole` field is not used for that
selection. The OpenClaw target's separate `agentRole` supplies a session-label
prefix, not the host-agent identity. The configured target's `agentId`, `runtime`,
and `model` select the actual spawn. Stage metadata does not override those
settings, edit OpenClaw configuration, or grant host-plugin permissions.

Source: [implementation dispatch and selected agent](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/skills/nova/plugins/implementation-agent/src/stage.ts#L32-L40),
[implementation configuration reader](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/skills/nova/plugins/implementation-agent/src/stage.ts#L82-L86),
[quality-gate agent reader](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/skills/nova/plugins/buster-quality-gate/src/stage.ts#L15-L20),
and [target label and spawn fields](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/skills/common/plugins/runtime-dispatch/src/openclaw.ts#L210-L239).

Codex/ACP and subagent selection can appear in an expanded swarm profile or a
runtime-dispatch target. The effective transport still comes from the consumer
that loads that configuration. A model name is routing data, not proof that
credentials, network access, or provider capacity exist.

### Native Codex Ops configuration

The separate `charts/ops-pod` workload runs a Codex container and an Ops MCP
sidecar. It is not an OpenClaw ACP session and does not inherit a dispatch
target's model or permissions. Both images require explicit immutable digests.
The home and workspace have separate persistent volume claims (PVCs); replacing
the image does not replace the saved home configuration or account identity.

The image carries `ops/pod/config.toml` at `/opt/codex/config.toml`. At startup,
the supervisor copies it to `$HOME/.codex/config.toml` only when that destination
does not exist, then sets the copied file's mode to `0600`. An existing file is
retained. The seed specifies `sandbox_mode = "danger-full-access"`,
`approval_policy = "on-request"`, and file-based CLI authentication storage.
These are seed settings, not a promise that an existing home file has those
values. The container, workload permissions and credential mounts are distinct
security boundaries; do not infer missing Kubernetes access from the sandbox
setting.

The supervisor always adds two `codex -c` settings when starting the app server:
`mcp_servers.kubeclaw_ops.url="http://127.0.0.1:8080/mcp"` and
`mcp_servers.kubeclaw_ops.bearer_token_env_var="KUBECLAW_MCP_TOKEN"`.
Those explicit startup arguments fix this MCP connection independently of
conflicting entries in the home file. Other Codex configuration sources and
settings remain Codex's own contract, not a new KubeClaw merge or capability
grant.

The `bearerSecret` value selects a Secret whose `token` key is mounted read-only
in both containers. The supervisor reads and trims that file into
`KUBECLAW_MCP_TOKEN`; fewer than 32 characters stop startup. It does not store the
token in the MCP URL. `githubSecret`, when selected, supplies a different
`GH_TOKEN` only to the Codex container. `rbac.execNamespaces` controls whether
that container receives the Kubernetes credential and kubeconfig mounts; an
empty list disables those mounts. The MCP sidecar has its own Kubernetes
credential mount. Inspect the rendered container and its specific mounts,
rather than treating the shared Pod as one credential scope.

The supervisor waits for successful `codex login status` before launching
`codex app-server --remote-control --listen unix://`. Its status distinguishes
waiting for login, starting, running and stopping. A running status records a
reachable local control socket, but still records `pairingVerified: false`.
It is a process observation, not a permanent liveness guarantee.
Neither that status nor the MCP health probe proves account pairing, relay
connectivity, pipeline health, or successful authenticated tool use.

For safe verification, record image digests and inspect the intended home-file
settings and forced startup arguments privately. Never publish the account
credential file, bearer file, raw environment or rendered literal credentials.
Stop if the retained home configuration is unexpected, a required credential
is unavailable, or the control socket is not reachable. The live helper
`ops/pod/verify.py` separately checks authenticated MCP calls and configured
Kubernetes read/exec authorization; it does not execute commands in target Pods
or verify pairing. Its source is not evidence that this live check has run.
The local supervisor tests cover sockets, bounded waits, process exit and
cleanup only; they do not log in or launch a Codex app server.

Source: [image assembly](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/Dockerfile#L73-L89),
[seed configuration](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/config.toml#L1-L10),
[home-file selection, credential and forced arguments](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/supervisor.py#L62-L100),
[status fields](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/supervisor.py#L21-L27),
[local status and shutdown](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/supervisor.py#L98-L125),
[container credential boundaries](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/charts/ops-pod/templates/workload.yaml#L49-L102),
[persistent volumes](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/charts/ops-pod/templates/workload.yaml#L134-L176),
and [live verification boundary](https://github.com/datrab/kubeclaw/blob/e9d79ec18e3df661a5e65d3a14b1ef500c3d3a76/ops/pod/verify.py#L1-L36).

## Prism Helm roots

SPIFFE identifies workloads, and SPIRE issues their credentials. Mutual TLS
(mTLS) authenticates both ends of a protected connection with certificates.
See [workload credentials](glossary.md#svid) for the identity delivery path.

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
Its CPU, memory, process-count, Linux user and group IDs (UID/GID), ownership, journal, output, result,
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

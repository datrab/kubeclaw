# Operate Prism: From Architecture to Approved Handoff

Status: local deploy-script verification passed; absent runtime release selection blocks deployment; no live journey result
Audience: Prism operator, designer, incident responder, platform maintainer
Owner: Prism maintainers
Evidence: skills/prism; skills/nova/plugins/prism-design; charts/prism; scripts/deploy.sh
Evidence revision: `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`
Applies to: the current Prism Control, Studio, agent, native worker, ingestion service, and Nova Prism stage
Last verified: 2026-10-09; local deploy-script, Control configuration, and interruption checks passed; no browser recovery or live journey result is available

## Purpose

This guide gives an operator one complete Prism journey.
It starts when Nova submits an architecture.
It ends when Nova imports the exact Baseline Bundle that a human approved.

## Canonical Prism and Studio Procedure
<!-- operator-task: prism-studio -->

This page is the sole authority for `prism-studio`. It has two phases.

For [deployment and health](#deploy-prism), start with an existing cluster that
passed install preflight, an exact selected Prism service/agent release,
prepared Secrets, SPIRE/CSI and native-worker dependencies, sufficient
database/artifact/backup capacity, and the required private-access configuration.
A Nova approval wait is not a deployment prerequisite. Run deployment commands
from `<repository-root>` on the administration machine.

For [the Studio journey](#the-complete-studio-journey), first complete deployment
and the selected service health checks. Verify the named human's private access.
Then use the original Nova run to submit its admitted architecture. Nova creates
its approval wait after dispatch. Before a human changes or approves the design,
verify that original request and wait; stop if dispatch or wait creation is
missing or uncertain. Run Studio actions through that human's private browser
session. Release receipts, Prism Control state, immutable artifact bytes,
Studio approval, Nova wait state, and Nova audit are the authorities.

> Nova [dispatches the original architecture before it creates the approval wait](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/stage.ts#L21-L34).

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole Prism task. Every raw `kubectl`, Helm, or
`scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`, `NAMESPACE`, and `PRISM_NAMESPACE`. The binding procedure validates
and freezes the independently supplied application and Prism namespace names.
Use `bound_kubectl`, `bound_helm`, and `bound_deploy` from that shell. The observed
resources, rendered namespaces, and mutated releases must all name the same
`PRISM_NAMESPACE`; each shown `<context>` must equal `EXPECTED_CONTEXT`. Run
`assert_cluster_binding` immediately before each command block. Stop on any
mismatch and follow the binding section's recovery; never fall back to the
default kubeconfig.

Before cluster mutation, run:

```bash
assert_cluster_binding
npm run verify:prism:deploy-script
node scripts/updates/materialize-release.mjs --family=runtime --check
bound_deploy render prism
```

The three verification/render commands must exit zero after the binding
assertion succeeds. At the recorded revision, `verify:prism:deploy-script`
passed its workflow, deploy-command contract, and Bash syntax checks.
`materialize-release.mjs --family=runtime --check` stops because
`releases/runtime-images.json` is absent. This checkout therefore has no selected
runtime release to deploy. Retain that error and stop before deployment.
Local script verification does not prove an installed Prism service.

After the release owner supplies a selected runtime release, repeat every
preflight and render check. Complete [Before You Start](#before-you-start),
[Deploy Prism](#deploy-prism), [The Complete Studio Journey](#the-complete-studio-journey),
and [Completion Checklist](#completion-checklist) in order.
Stop on an unknown identity/digest, failed readiness level, superseded
architecture, uncertain agent job, revision conflict, blocking evaluation,
stale approval, bundle verification failure, mismatched/expired wait, or
incomplete cleanup. Do not create a replacement identity to clear a conflict.

Recovery uses [Safe Recovery Procedures](#safe-recovery-procedures) for the
same project and identities. Backup/restore uses the
[canonical recovery procedure](recovery.md#canonical-backup-and-restore-procedure),
upgrade uses the [canonical upgrade procedure](maintenance.md#canonical-upgrade-and-rollback-procedure),
and removal uses the [canonical decommission procedure](maintenance.md#canonical-decommission-procedure).
Retain release/configuration digests, commands and outputs, readiness, run and
wait IDs, project/architecture/round/document/revision/approval/bundle IDs,
preview/evaluation evidence, resume signal digest, final audit, recovery and
cleanup. Never retain session cookies, tokens, passwords, or private keys.

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
> Studio attempts approval first and immutable publication second. Approval alone does not publish a bundle or resume Nova.
> A separate operator-created Nova signal resumes the run. Its issuer is
> caller-supplied and unsigned; CLI access is the effective authority. Nova then asks Prism for
> the approved bundle and verifies all content before it accepts the handoff.
>
> [The Prism stage creates the wait, publishes the operator request, and validates the later approval signal](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/stage.ts#L8-L34).

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
> [Control authenticates and validates the Nova dispatch](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L174-L213).
>
> It then [stores the request and starts a design round or returns the approved baseline](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L214-L240).
>
> [The agent bridge claims only durable jobs and records the bounded OpenClaw outcome](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/agent-job-runner.mjs#L16-L46).
>
> [The native worker host uses a deterministic provider; production model work stays in the managed Prism agent](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/native-worker-host.ts#L12-L33).

## Before You Start

You need all of the following items:

1. A reviewed runtime release selection with Prism image digests.
2. A Kubernetes cluster with the required Prism namespace and image-pull Secret.
3. PostgreSQL storage and artifact storage with sufficient capacity.
4. The native worker host policy and its generated Prism values.
5. SPIFFE CSI support when the selected deployment enables worker trust.
6. The Tailscale access configuration when Tailscale exposure is enabled. Verify actual private Studio access after deployment.
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
> [The deploy command requires both materialized values files and validates all four Prism image digests](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1593-L1616).
>
> [The chart defaults leave the four image digests empty](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/values.yaml#L1-L7).

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
> [The deploy script captures private overlays and fixes the base files to materialized release values](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L100-L103).
>
> [Service release values, private overlay, fixed trust and Secret overrides are applied in that order](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1725-L1744).

### Main Helm values

The [generated recursive value reference](../reference/helm-values.md#recursive-value-reference)
is the canonical inventory for defaults, types, constraints, consumers, and
precedence. Open its `charts/prism/values.yaml` section for services and
`my-values/prism-agent-values.yaml` for the agent overlay. Values in the
materialized release override these chart and development-overlay defaults.
Do not maintain a separate default list in a private runbook.

Apply these task rules to the selected values:

| Decision | Required operator proof and consequence |
| --- | --- |
| Service and agent images | Keep each repository with its receipt-selected immutable digest. An empty digest blocks deploy. A mutable tag does not establish release identity. |
| Native host binding | Use generated `worker.native` values. The node, pool namespace, and policy digest must match the prepared host policy; Pod resources do not replace native per-attempt limits. |
| Control and worker replicas | Keep each at exactly one. Control owns one ReadWriteOnce artifact claim; the worker owns one native pool. The chart rejects other counts. Studio replicas do not add canonical state or approval authority. |
| Worker shutdown | Keep `worker.native.closeTimeoutMs` inside `worker.shutdownTimeoutMs`, and keep the full shutdown inside `worker.terminationGracePeriodSeconds`. Too little time can leave ownership uncertain. |
| PostgreSQL | Keep chart-owned PostgreSQL enabled for this maintained deploy, smoke, migration, and backup procedure. Chart rendering without PostgreSQL does not provide an external-database workflow. |
| Database, artifacts, and backup | Size the independent claims from measured growth and restore time. Local backup and byte ceilings do not provide off-host recovery or automatic expiry. |
| Ingestion | Enable only with approved source policy and explicit positive CPU/memory requests and limits. Quarantine expiry does not delete published corpus or bundle data. |
| Private Studio access | Bind the selected Tailscale hostname and operator namespace to the approved private-access record. Prove authorized and unauthorized access separately. |
| SPIFFE trust | Configure the trust domain, namespaces, service accounts, CSI socket, and proxy images as one policy. An incomplete identity set blocks startup. |
| Personal preference | Select only an existing authenticated Prism subject in `control.pipelinePreferenceSubject`. Empty disables personal preference binding for pipeline rounds. |
| Product decisions | Enable only with the separate operator, issuer, key, controller, CA, audience, and revision policy. This authority is distinct from design approval. |

The schema closes the top-level object and selected security-sensitive groups,
but some nested objects remain open. An unknown nested key can pass schema
validation while no template reads it. Compare the selected values with the
generated inventory's receiving source and the rendered manifests. Reject an
unconsumed override; schema acceptance alone does not prove an effect.

> **Source evidence — deployment constraints**
>
> The [workload template rejects Control and worker replica counts other than one](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/templates/workloads.yaml#L1-L8).
> The [schema requires its core groups and closes images](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/values.schema.json#L59-L108), but [leaves some nested resources open](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/values.schema.json#L510-L531).
> [Selected defaults include storage, backup, exposure, and trust](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/prism/values.yaml#L44-L92).

### Runtime settings and defaults

The [generated environment reference](../reference/environment-variables.md#variables)
is the canonical process-variable inventory. Each row identifies its reader,
producer, default or empty-value rule, constraints, and precedence. Use
[Host, OpenClaw, and Prism configuration](../reference/host-and-prism-configuration.md#prism-control-process)
for the conditional loader boundaries.

Treat the rendered environment as a startup snapshot. Change its Helm, Secret,
or host-policy producer, then roll the affected service and repeat readiness.
Do not set a chart-injected variable directly to bypass the selected release.
Control and Studio URLs connect different request boundaries; do not substitute
one service's loopback proxy URL for another service's destination.

Native paths, scope, engine digest, pool policy, and trust have no permissive
production identity fallback. A native host setting cannot enlarge the
root-managed pool policy. Missing or invalid admission values stop startup.

> **Source evidence — runtime configuration**
>
> Control [validates its preference and trust boundary](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-config.ts#L9-L38) and [captures one startup configuration](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-config.ts#L40-L72).
> Studio [validates its port and Control timeout](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/studio-config.ts#L4-L17).
> Worker [validates ingress and shutdown bounds](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/worker-config.ts#L1-L38).
> Native configuration [admits resource and engine identity](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/config/native-worker.ts#L4-L35) and [host scope and authentication](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/config/native-worker.ts#L38-L47). It also validates [supervisor paths and journal bounds](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/config/native-worker.ts#L50-L83).

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
> [Control rejects an incomplete SPIFFE trust policy and otherwise requires the fallback secrets](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-config.ts#L16-L55).
>
> [Product authority is disabled unless explicitly selected and then requires HTTPS, an operator allowlist, and a dedicated Ed25519 key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/product-decisions.ts#L20-L43).

### Deploy-command settings

Use the [generated environment reference](../reference/environment-variables.md#variables)
for each deploy setting's default, type, empty-value behavior, precedence, and
receiving source. The task decisions below explain what to select and verify.

| Operator task | Configuration and required proof |
| --- | --- |
| Bind the deployment target | Use the frozen `PRISM_NAMESPACE` from cluster binding and record `PRISM_RELEASE`. Both releases and their Secrets must use that approved namespace. |
| Set bounded rollout budgets | Select `PRISM_HELM_TIMEOUT` and `PRISM_ROLLOUT_TIMEOUT` against the release's migration and readiness requirements. A timeout does not reverse a committed database migration. |
| Add private configuration | Set `PRISM_VALUES_FILE` and `PRISM_AGENT_VALUES_FILE` before invocation. They add overlays after materialized release values; they cannot replace selected release truth. |
| Select service image repositories | Keep `PRISM_CONTROL_IMAGE_REPOSITORY`, `PRISM_STUDIO_IMAGE_REPOSITORY`, `PRISM_WORKER_IMAGE_REPOSITORY`, and `PRISM_INGESTION_IMAGE_REPOSITORY` paired with their intended immutable digests. |
| Select service image digests | Verify `PRISM_CONTROL_IMAGE_DIGEST`, `PRISM_STUDIO_IMAGE_DIGEST`, `PRISM_WORKER_IMAGE_DIGEST`, and `PRISM_INGESTION_IMAGE_DIGEST` against the release receipt. Empty overrides use the selected values file; malformed selected digests stop deployment. |
| Bind the agent code bundle | Verify `PRISM_CODE_BUNDLE_ARCHIVE_URL`, `PRISM_CODE_BUNDLE_EXPECTED_COMMIT`, and `PRISM_CODE_BUNDLE_CONTRACT_VERSION` against the runtime receipt. A reachable archive alone does not prove the required source identity. |
| Grant private bundle access | `PRISM_CODE_BUNDLE_AUTH_SECRET` and `PRISM_CODE_BUNDLE_AUTH_SECRET_KEY` select a credential reference. Provision its value through the Secret owner; exclude it from evidence. |
| Bind image, runtime, and database credentials | Record `PRISM_IMAGE_PULL_SECRET_NAME`, `PRISM_RUNTIME_SECRET_NAME`, and `PRISM_DATABASE_SECRET_NAME`. Confirm their required keys at the bound namespace without printing values. |
| Admit the native host | Select `NATIVE_WORKER_NODE_POLICY_FILE` through the host owner. Its policy must match the rendered node, native namespace, and policy digest. |
| Plan an authorized live exercise | `PRISM_E2E_USER` selects the approved Tailscale caller. `PRISM_E2E_USE_LEASE` controls temporary namespace leasing; `PRISM_E2E_RUN_FAILURES` controls additional failure exercises. Run these only in the declared isolated acceptance environment. |

The deploy script creates `PRISM_VALUES_OVERLAY` and
`PRISM_AGENT_VALUES_OVERLAY` internally to preserve private overlay paths.
Do not supply them as operator alternatives. The live-test Job receives
`PRISM_CONTROL_URL`, `PRISM_AGENT_URL`, `PRISM_E2E_IMAGE_REFERENCES`, and
`PRISM_E2E_INGRESS_SECRET` from the deploy script. These are derived Job inputs,
not direct operator authority. Use their generated reference rows to inspect
the producer and destination.

Record non-secret overrides with deployment evidence. They can change the render
without changing committed values. Retain Secret names and key names, never their
values. Repeat the render after changing any override.

### Prism agent values

The [generated recursive value reference](../reference/helm-values.md#recursive-value-reference)
contains the full `my-values/prism-agent-values.yaml` overlay and common
`charts/kubeclaw/values.yaml` contract. The overlay is a development input;
production uses the selected agent image and version-matched code bundle.

Inspect the effective agent configuration for these task boundaries:

- `agentRole` must select Prism, and `agent.project` must preserve the intended
  project/session namespace. Model names route requests; they do not prove provider capacity.
- `auth`, `litellm`, and optional `discord` refer to their dedicated Secret keys.
  Verify the caller allowlists against the private authority record. Do not
  include their values in deployment evidence.
- `codeBundle` must match the runtime receipt commit and contract. The bundle
  supplies runtime contracts even when repository synchronization is enabled.
- The Prism bridge uses its own named listener, bounded invocation, private
  temporary space, and restricted security context. Its `/health` and `/ready`
  probes do not prove a completed model request.
- `workerTrust.spiffe` must match the platform identity policy and sidecar
  loopback Control destination. The common chart's generic bridge is a different surface.
- The workspace installs Prism role and tool instructions. Those instructions
  guide the agent; server-side admission still owns permission and validity.
- Dependency probes disabled by the Prism overlay do not remove the explicit
  PostgreSQL, Control, worker, or LiteLLM functional checks in this procedure.

The common chart contains other capabilities for other roles. They are outside
this Prism overlay and do not become Prism features merely because the shared
chart supports them.

> **Source evidence — agent configuration**
>
> The common chart defines [role, image, bundle, and registry value families](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/kubeclaw/values.yaml#L16-L63).
>
> It defines [worker-trust values](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/kubeclaw/values.yaml#L132-L145).
>
> It also defines [auth, LiteLLM, Stitch, and Discord values](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/kubeclaw/values.yaml#L147-L201) and [model and Git values](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/charts/kubeclaw/values.yaml#L203-L220).
>
> The shipped overlay fixes [the role, image, code bundle, authentication, and model endpoint](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/my-values/prism-agent-values.yaml#L1-L40).
>
> It fixes [the agent, service, trust, and bridge selection](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/my-values/prism-agent-values.yaml#L45-L85) and [workspace and dependency probes](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/my-values/prism-agent-values.yaml#L87-L103).
>
> Private authority identities are deliberately excluded from these links.
>
> The deploy command [resolves and verifies the selected Prism bundle](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1688-L1724).
>
> It then [applies the private overlay before binding the bundle and LiteLLM endpoint](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1725-L1748).

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
> [The Prism stage configuration schema is closed and requires all four fields](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/schemas/config.schema.json#L1-L1).

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
The historical reason for this choice is unknown. A current technical inference
is that keeping existing credentials stable avoids an uncoordinated password
change during a rollout. Such a change can stop old Pods before new Pods are
ready. The cost is that rotation remains a separate, coordinated owner task.
Use [Credential Rotation](maintenance.md#credential-rotation) for that boundary.
Reconsider automatic replacement only after a coordinated rotation protocol is
implemented and validated.

Never store provider tokens in `prism-runtime` or inject them into Control,
Studio, worker, or ingestion. The Prism OpenClaw agent is the only production
component that owns the managed model route.

> **Source evidence — Secret creation**
>
> [The deployment command creates missing values, verifies every required key, and does not print secret values](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1639-L1681).

## Deploy Prism

### 1. Render before you change the cluster

Run the repository's release materialization check first.
Then render the selected Prism releases with the deployment script.

```bash
assert_cluster_binding
node scripts/updates/materialize-release.mjs --family=runtime --check
bound_deploy render prism
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
assert_cluster_binding
bound_deploy setup
bound_deploy secrets
```

The Prism command also verifies and creates its dedicated missing Secrets.
Confirm that `gatewayToken-prism` exists before deployment.

### 3. Deploy

```bash
assert_cluster_binding
bound_deploy prism
```

The maintained command currently requires chart-owned PostgreSQL
(`postgresql.enabled: true`). Although the chart can omit PostgreSQL resources,
`deploy.sh prism` waits for `statefulset/prism-postgresql`, and `prism-smoke`
enters it. `prism-status` only lists the resources that exist; it does not make
external PostgreSQL a supported deployment mode. External PostgreSQL needs
deployment, migration, backup, and smoke support before it is supported.

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
> The deploy command [resolves and verifies the selected bundle](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1684-L1724).
>
> It [assembles overrides and renders both roles](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1725-L1748).
>
> It then [runs host and trust preflight, Secret checks, and the Prism Helm install](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1750-L1781).
>
> Finally, it [installs the agent and waits for every workload](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1782-L1797).
>
> [The maintained deploy waits for the chart-owned PostgreSQL StatefulSet, and smoke enters that StatefulSet](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/deploy.sh#L1793-L1811).
>
> [Migrations take one advisory lock and commit each ordered migration name in one transaction](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L21-L75).

### 4. Verify status and smoke behavior

```bash
assert_cluster_binding
bound_deploy prism-status
bound_deploy prism-smoke
```

Also inspect the expected workloads:

```bash
assert_cluster_binding
prism_namespace="$PRISM_NAMESPACE"
bound_kubectl get deploy agent-prism prism-control prism-worker prism-studio -n "$prism_namespace"
bound_kubectl get statefulset prism-postgresql -n "$prism_namespace"
bound_kubectl get jobs,cronjobs,pvc,svc,ingress -n "$prism_namespace"
bound_kubectl exec -n "$prism_namespace" deployment/agent-prism -c kubeclaw -- openclaw gateway status
```

If the worker is not ready, do not bypass the readiness probe.
Interpret each health result at its own boundary:

| Signal | What it proves | What still needs a separate check |
| --- | --- | --- |
| Worker Pod readiness: `GET /bootstrap` | Native ownership reconciliation is complete. | Nonce-table access, service authentication, and a functional worker attempt. |
| Worker `GET /ready`, HMAC mode | Native ownership is ready and the worker can query its PostgreSQL nonce table. | Successful authenticated attempt execution. |
| Worker `GET /ready`, SPIFFE mode | Native ownership is ready; this route does not query the nonce database. | SPIFFE authentication and successful attempt execution. |
| Worker `GET /health` | The HTTP process can answer. | Native ownership and dependency readiness. |
| Control `GET /ready` and PostgreSQL `pg_isready` | Control can execute `SELECT 1`; PostgreSQL is accepting connections. | Worker nonce-table access and the complete Studio journey. |

The chart uses worker `/bootstrap` for Pod readiness so that the post-install
migration can create the nonce table after the Pod becomes ready. The smoke
command separately calls worker `/ready`. The chart default has
`workerTrust.spiffe.enabled: false`; determine the actual mode from the selected
values and render. The absent runtime release selection establishes no deployed
mode. Use the canonical [Worker endpoints](../understand/prism-runtime.md#worker-endpoints)
explanation for these boundaries. Keep admission closed on failed native
reconciliation or, in HMAC mode, failed nonce-table access.

> **Source evidence — worker and dependency health**
>
> **Claim:** Worker Pod readiness and worker dependency readiness are different checks.
>
> **Implementation:** The worker [checks native readiness and conditionally checks the nonce database](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/skills/prism/server/worker-service.ts#L72-L86); its [health and bootstrap routes have separate meanings](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/skills/prism/server/worker-service.ts#L95-L105). Control [checks PostgreSQL with `SELECT 1`](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/skills/prism/server/control-server.ts#L143-L147). The smoke command [calls both service readiness routes and `pg_isready`](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/scripts/deploy.sh#L1802-L1811).
>
> **Contract or setting:** The chart [selects worker `/bootstrap` and liveness `/health`](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/charts/prism/templates/workloads.yaml#L157-L162) and [defaults SPIFFE to disabled](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/charts/prism/values.yaml#L75-L84). The nonce check [queries the exact nonce table](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/skills/prism/server/worker-readiness.ts#L8-L10).
>
> **Test evidence:** The [Helm fixture checks worker bootstrap readiness and health liveness](https://github.com/datrab/kubeclaw/blob/7c85236b9a1992466ceb33b64f657062be57b4dd/skills/prism/tests/worker-readiness-chart.test.mts#L6-L15). No executed result for this fixture is recorded here.
>
> **Revision:** `7c85236b9a1992466ceb33b64f657062be57b4dd`
>
> **Limit:** Probe definitions do not establish a rendered selected release, live dependency health, authenticated worker attempt, or completed Studio journey.

## The Complete Studio Journey

The following status map applies to every step below at the recorded revision.
“Implemented” means that the linked product code provides the operation; it does
not mean that this deployment exercised it. The absent runtime release selection
stops this checkout before deployment and the live journey. Verification did
not include any live Studio-to-Nova step.

| Step | Implemented operation and expected evidence | Verification boundary |
| --- | --- | --- |
| 1 | Nova dispatches architecture; Control records the active request and agent job; Nova stores its approval wait. | Source inspected; live dispatch unavailable until deployment gates pass. |
| 2 | Studio obtains a trusted session and lists Control projects. | Source inspected; private ingress and actual caller identity unverified. |
| 3 | The agent commits exactly three current directions; Studio reconnects to the same round. | Source inspected; external OpenClaw/LiteLLM completion unverified. |
| 4 | Authenticated direction selection and feedback use retained idempotency keys. | Source inspected; browser interaction unexecuted. |
| 5 | A new child round binds current document, architecture, parent, and request identity. | Source inspected; live round and concurrency behavior unexecuted. |
| 6 | Typed edits create revisions; natural-language edits create durable jobs. | Source inspected; browser editing and provider reconciliation unexecuted. |
| 7 | History restore creates a new current revision. | Isolated embedded database/HTTP checks completed; installed database and browser restore unexecuted. |
| 8 | Studio previews views, states, flows, assets, and viewport choices. | Source inspected; browser and asset delivery unexecuted. |
| 9 | Worker evaluation produces findings for the exact document revision. | Source inspected; native worker execution unexecuted. |
| 10 | A human approves the current revision; Control renders and publishes an immutable Baseline Bundle. | Source inspected; publication, browser capture, and separate human approval unexecuted. |
| 11 | An authorized CLI caller submits the original wait's signal; Nova verifies and imports the approved bundle. | Source inspected; restricted signal submission and final Nova import unexecuted. |

### Interruption and retry boundaries

A lost response leaves an **uncertain result**: the request can have committed
before Studio received its reply. A retry repeats the original request identity
and content. A new key, event, approval, revision, or architecture represents
different work; it does not reconcile the original result.

**Idempotency** means that the same accepted identity and content produce no
second canonical change. **Reconciliation** checks the original request's durable
result before another action. These properties differ between operations.
A server replay contract does not establish a usable Studio recovery control.

Perform one state-changing action at a time. Wait for its result before another
edit, direction action, round, restore, approval, or signal. Keep the original
project URL, actor, architecture, document revision, action, time, and non-secret
request evidence. Include a returned key, event, job, approval, or bundle identity
when available. Do not retain cookies, CSRF values, tokens, or private keys.

| Operation | Retained identity and result | Response loss, reload, and retry boundary |
| --- | --- | --- |
| Submit Nova architecture | Nova derives dispatch identity from the original run and architecture digest. Control binds the request and round. | Use the original run's recovery path. A newer architecture supersedes work; it is not a retry. Stop for an uncertain external outcome. |
| Renew Studio session | Control returns new session/CSRF cookies and the same user hash for the same trusted identity. | Renew access through the trusted ingress. Preserve the original user and project. Session renewal does not reconcile product writes. |
| Request a child round | Studio stores the exact request/key and returned generation in tab session storage. Control checks the recorded start digest. | Retry only the stored request. Reload can reconnect while that storage survives. Missing storage, changed identity, or supersession requires a stop. |
| Select or reject a direction | Control commits the decision and preference receipt together. Studio keeps its key in component memory. | Same user/key/body permits server replay. Studio errors hide controls; reload loses the key. Stop for maintainer reconciliation after an uncertain result. |
| Record direction feedback | The same key reuses one preference receipt; a fresh key records another event. | Do not repeat an uncertain click. The current UI cannot recover a lost key or retrieve its exact decision receipt. |
| Apply a typed edit | The request carries its base revision. The committed history stores the operation; Studio has no pending operation key. | Reload current content and history. An identical old request can fail with revision conflict after its first commit. Author a new edit only after reconciliation. |
| Propose a natural-language edit | The helper stores the original instruction, base revision, key, and returned job ID. Control stores one matching job. | The helper supports same-request reconciliation. Current Studio errors and pending-request reloads hide its button; stop at this UI limit. Lost storage also requires a stop. |
| Undo or restore history | Each successful restore stores a new revision with its source revision ID. The UI sends no idempotency key. | Never repeat blindly. The same restore can create another revision. Compare current/history receipts; stop if the original result remains uncertain. |
| Forget a learned preference | Control deduplicates one exact wire event. Studio creates a new event ID and timestamp per click. | A fresh click can append another retraction event. Maintainers must reconcile the original target and event before another attempt. |
| Evaluate a design | Studio derives a worker key from embedded document identity and revision. Control binds the exact input and durable worker receipt. | Recheck the same unchanged revision only. Reload clears warning acceptance. Conflicting input, unresolved native ownership, or changed revision requires a stop or fresh evaluation. |
| Create human approval | Control inserts one approval per project/design digest. Studio retains its returned ID only inside the approval function. | Lost response or later publication failure can hide the original ID. Repeating Approve attempts another insert and can fail on duplicate digest. Stop. |
| Publish baseline | Control reuses a committed baseline for the same project/document/approval. Capture identities also contain that approval ID. | Studio Approve restarts approval; it does not replay this baseline request. Missing ID or uncertain capture requires maintainer reconciliation. |
| Resume Nova | The signal file retains the original wait, signal ID, key, issuer, approval, architecture, and bundle. | Audit the original run before retry. Resolved/expired waits and terminal runs can reject another CLI call. Never replace identities to force acceptance. |

Tab session storage is conditional evidence, not a backup.
A same-tab reload can retain it. A closed tab, new tab, cleared storage, changed
browser, or changed user can lose access to the original request.
Reopening a URL does not prove that its pending identity survived.
The direction keys and approval function's local variables have shorter lifetimes.

When Studio shows **Prism cannot open**, it hides the action controls.
An in-memory key or helper retry function does not make a retry button available.
Use [Safe Recovery Procedures](#safe-recovery-procedures) for the affected action.
If no supported operator path can identify the original result, stop for Prism
maintainers. Retain evidence and keep later approval, publication, and resume closed.

> **Source evidence — client lifetime and result identity**
>
> **Claim:** Operation-specific retention and server guards do not provide universal browser replay.
>
> **Implementation:** Studio [stores pending revision state during startup](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L124-L131) and [replaces controls with its failure screen](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L491-L499).
> Its [direction keys remain in component memory](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L277-L283).
> The round helper [stores and reuses the original request](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/design-round-client.ts#L8-L23).
> The revision helper [retains its request and validates the returned job/result](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/agent-revision-client.ts#L6-L33).
>
> **Contract:** Control [rejects different worker input under a retained key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/native-operation-store.ts#L28-L45).
>
> **Test evidence:** The [round HTTP fixture preserves one request across response loss](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/tests/design-round-client.test.mts#L9-L37).
> The [revision HTTP/database fixture preserves the original job and reports NeedsNova](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/tests/agent-revision-client.test.mts#L16-L44).
> The [decision fixtures distinguish exact replay from new feedback](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/tests/control-decisions.test.mts#L33-L67).
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran five selected client/decision/round/domain-storage suites: all 17 tests passed, exit zero.
> These checks use isolated HTTP, storage substitutes, and embedded PGlite. They do not exercise Studio browser controls or production dependencies.
>
> **Revision:** `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`
>
> **Limit:** Source and isolated client/database checks do not prove browser recovery, native execution, or a live journey.

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
After a lost dispatch response, retain the original run and architecture reference.
Use [run recovery](operate.md#canonical-run-control-procedure) to inspect that run's
wait, dispatch effects, and receipts. Do not invoke a new run or change the
architecture merely to obtain another response. An unresolved agent outcome
requires Prism maintainers; repeated dispatch does not authorize another external launch.

> Nova [derives the dispatch key from the run, architecture digest, and approval phase](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/stage.ts#L20-L25).
> Control [validates architecture transitions and starts the bound round](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L214-L230).
> The round store [replays an exact recorded start and rejects conflicting content](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/design-generations.ts#L25-L44).

### Step 2: Open Studio and choose the project

Find the private Studio address:

```bash
assert_cluster_binding
prism_namespace="$PRISM_NAMESPACE"
bound_kubectl get ingress prism-studio -n "$prism_namespace"
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
> [Control validates the signed session and the separate CSRF cookie and header](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L108-L123).
>
> [The session route returns the CSRF value and stable user identity](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L152-L172).
>
> [Studio starts the session, lists projects, and loads the selected document](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L97-L149).

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

For the initial Nova dispatch, reloading Studio observes Control's current round.
Studio does not retain Nova's dispatch request in browser storage.
For a child round requested in Studio, the round helper stores its exact request.
A same-tab reload reconnects only while that stored request and original user survive.
Follow [Child round interrupted](#child-round-interrupted) when its result is uncertain.
Do not clear storage or create a replacement request to hide the uncertainty.

> **Source evidence — direction commit and reconnect**
>
> [Control validates and stores exactly three agent directions](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L243-L277).
>
> [Studio retains the idempotency key and generation ID and rejects a superseded pending round](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/design-round-client.ts#L3-L48).

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
Control binds replay to the same authenticated user, key, direction, and body.
Studio keeps a pending key only in component memory; a reload or tab closure
loses it. A failed action sets the failure screen and hides the buttons.
Keeping the tab open therefore preserves evidence but does not expose a retry action.

After an uncertain direction action, stop further direction actions and feedback.
Retain the project, round, direction, action, time, and non-secret request evidence.
Prism maintainers must reconcile the decision and preference receipt before work resumes.
A selected direction alone cannot prove whether Control stored separate feedback.
A fresh feedback key can create another event. An already selected or rejected
direction can reject a new decision rather than return the original receipt.

The current UI has no supported recovery action for an uncertain or lost-key decision.
Do not reconstruct a key or modify preference rows.
A supported recovery path must retain keys across reload, keep reconciliation
controls available after errors, and prove same-request replay without duplicate events.

Personal learning is a separate policy choice.
The pipeline can use a configured personal subject only when the platform-owned
`control.pipelinePreferenceSubject` matches the real authenticated subject.
Project content cannot select another person's subject.

> **Source evidence — human direction authority**
>
> [Control accepts only the supported feedback actions and requires an idempotency key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L346-L387).
>
> [Studio retains pending direction keys only in component memory](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L277-L330).
> [Control derives event identity from the user and supplied key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/direction-decisions.ts#L43-L61).
> [The isolated decision test proves deduplication with the same key and another event with a fresh key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/tests/control-decisions.test.mts#L54-L63).

### Step 5: Request another design round when needed

Studio offers **Request new design round** after all three directions are rejected.
Confirm each rejection before requesting that new round.
The pending-round button instead retries the stored request.
A selected direction has no replacement-round button in the current UI.
If it needs replacement, stop for Prism maintainers; do not fabricate rejections
or call a guessed route to create another round.

A new child round requires the current document and revision.
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
Retry an uncertain child request only through its retained request and key.
See [Child round interrupted](#child-round-interrupted) for storage and supersession limits.

Control locks the project transaction and rejects a stale document, stale parent,
or changed architecture. Late results from a superseded round cannot become the
current direction set. An admitted successor can still wait behind an unresolved
predecessor job. Stop for maintainer reconciliation when Control reports that blocked
session; a new key does not release the predecessor.

> **Source evidence — round creation**
>
> [Control checks current project, architecture, parent, document, revision, and idempotency before it admits another round](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L346-L365).
>
> [Studio preserves the pending request and tells the operator to reconnect with the same key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L332-L348).

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
The UI stores no durable typed-operation key or pending receipt.
An identical request after its first commit fails against the old base revision;
it does not return that committed result.

After response loss, follow [Typed edit or restore interrupted](#typed-edit-or-restore-interrupted).
Reload and compare current content and history before another edit.
Changing only `baseRevision` converts an uncertain retry into a new operation.
Do not use that change to clear a conflict.

#### Natural-language revisions

Enter a concrete instruction and select **Propose change**.
Studio stores one pending request with its base revision and idempotency key.
Control creates a durable Prism agent job in the same project session.
The agent must return a complete document with exactly the next revision number.

The client helper can resubmit the same stored request and poll its original job.
It clears that request only after a completed result has exactly `baseRevision + 1`.
Do not change its instruction, key, or job identity while the result is uncertain.

The current UI does not expose recovery after an error or reload.
An error hides the controls. Loading a retained revision request also sets that
failure screen, so **Reconcile existing change** is unavailable on that path.
Follow [Natural-language revision interrupted](#natural-language-revision-interrupted).
An uncertain external launch becomes `needs_nova`; creating another request does
not authorize replay or release a blocked project session.

> **Source evidence — revisions**
>
> [The domain applies typed operations only at the expected base revision and then increments once](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/domain/index.ts#L67-L113).
>
> The repository [applies an operation and advances the current revision with compare-and-swap](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L262-L293).
>
> Whole-document replacement [checks the expected revision and uses the same compare-and-swap boundary](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L294-L330).
>
> [Studio retains and reconciles one natural-language revision request](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/agent-revision-client.ts#L3-L34).

### Step 7: Inspect or restore history

Open **Revision history** before approval.
Studio shows revision numbers and the **Undo** or **Restore** controls. It does
not display the exact revision ID or creation time. Control's history response
contains the exact revision ID, actor, creation time, and stored operation.
For an uncertain write, follow [Typed edit or restore interrupted](#typed-edit-or-restore-interrupted).
A displayed revision number alone does not identify which request committed.

> Studio [renders revision numbers and restore controls](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L808-L823).
> Control [returns the history records](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L392-L398), and the repository [includes exact receipt fields](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L211-L239).

Restore does not move the current pointer back to old mutable state.
It copies the selected old content into a new revision after the current revision.
This preserves the complete history and gives the restore a new current identity.

After a restore, repeat evaluation and preview checks.
All prior warning acceptance and approval state is stale for the new revision.
Undo and Restore use the same restore endpoint and send no idempotency key.
Repeating the same source revision can create another current revision.
After response loss, stop restore actions and follow
[Typed edit or restore interrupted](#typed-edit-or-restore-interrupted).

> **Source evidence — restore**
>
> [Control exposes history and a restore operation for one document](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L389-L421).
>
> [Restore creates a new revision and records the source revision ID](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L211-L260).

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
total bytes, checks media types, and encodes the asset bytes in `data:` URLs.
Publication later creates independent worker-rendered screenshots and ARIA snapshots.

> **Source evidence — preview boundary**
>
> [Studio builds the preview from the selected view, state, viewport, assets, components, and theme](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/preview.ts#L1-L31).
>
> [The asset loader encodes bounded bytes as base64 `data:` URLs](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/preview-assets.ts#L35-L43).
>
> [Studio resolves only declared flow transitions from preview messages](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/flows.ts#L1-L47).

### Step 9: Evaluate the exact current revision

Run the design evaluation before approval.
The worker checks document coverage, references, flows, responsive definitions,
accessibility metadata, and content structure. The finding contract reserves a
`visual-quality` gate, but the current evaluator does not emit that finding.

Findings have three levels:

| Level | Required operator action |
| --- | --- |
| `blocking` | Correct the document. Approval is not possible. |
| `review` | Read the exact finding and explicitly accept it only when the remaining trade-off is valid. |
| `information` | Record or inspect it as useful context. It does not block approval. |

The contract supports `information`, but the current deterministic evaluator
does not emit that level either. Browser capture performs separate interactive
label and contrast checks during publication.

Finding IDs are derived from the finding content.
A document change can create a different finding set.
Therefore, warning acceptance belongs to the evaluated revision and must not be
copied blindly to a later revision.

Wait for evaluation to finish before editing or approving.
Studio uses `studio-evaluate-<embedded-document-id>-<revision>` for the worker request.
Its embedded document ID comes from Design Document metadata; it is not the
Control URL's internal document UUID. Reuse requires the same exact input.
A conflicting key or unresolved worker attempt requires Prism maintainers.
Do not supply a fresh key to evade that condition.

A response loss does not create a document revision, but it can leave a durable
worker attempt. Reload clears the displayed report and warning acceptance.
Recheck only the unchanged revision when readiness and original attempt ownership
remain known. If an edit committed while evaluation ran, discard that report
and evaluate the newly loaded revision before accepting warnings.

> Studio [binds evaluation to the loaded revision and derives its worker key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L406-L442).
> Control [loads the requested immutable revision](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L425-L453).
> Native operation storage [preserves the original attempt and rejects input conflicts](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/native-operation-store.ts#L28-L45).
> It [stores the bound result before completion](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/native-operation-store.ts#L49-L68).

> **Source evidence — quality gate**
>
> [The evaluator defines finding levels, gate families, stable IDs, and the final status rule](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L4-L36).
>
> The evaluator checks [document structure and node references](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L37-L96).
>
> It checks [asset references and alternative text](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L97-L131) and [state and responsive references](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L132-L160).
>
> It also checks [flow endpoints and transition coverage](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L162-L197).
>
> Finally, it derives [transition validity, recovery coverage, and the final status](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/evaluation/index.ts#L198-L235).

### Step 10: Approve and publish

Before you select **Approve**, confirm:

- the intended direction is selected;
- the displayed document revision is the revision you reviewed;
- Preview checks are complete;
- evaluation has no blocking findings;
- every accepted review finding has a recorded reason outside Prism when your
  operating policy requires one;
- the active Nova architecture has not changed.

Select **Approve** once and wait for its final result.
Do not edit, restore, request another round, or click approval again while it runs.
Studio performs two separate writes; they are not one atomic transaction.

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

Approval response loss, capture failure, or lost publication response can leave
an approval committed without a visible success message.
Studio keeps `approvalBody.id` only inside that invocation and displays it after
baseline success. It persists no approval/publication request for reload.
Repeating **Approve** starts another approval insert instead of replaying baseline
publication with the original ID. The project/design-digest uniqueness rule can
reject it with `approval_project_id_design_digest_key` while retaining the original approval.
Do not change content or create a new identity merely to escape that rejection.

Control can return a saved baseline for the same project, document, and approval ID.
That return identifies the original publication; it does not approve changed content
or renew its active architecture authority. Before first commit, capture and worker
ownership can still need reconciliation. Concurrent baseline requests do not provide
a supported browser retry procedure.

After any uncertain approval/publication result, follow
[Approval or publication interrupted](#approval-or-publication-interrupted).
A render error does not roll back the earlier approval.
Do not submit a Nova signal until the original approval and exact bundle are verified.

> **Source evidence — approval and publication**
>
> [Control binds approval to the current document, quality findings, warnings, and active architecture](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L521-L565).
>
> Control [rejects a baseline with a mismatched project, document, approval, or revision](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L567-L607).
>
> It then [rejects stale digests, blocked quality, changed warnings, or a missing active direction](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L608-L629).
>
> Control [assembles the specification and acceptance criteria](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L630-L662).
>
> It [collects bounded content-addressed assets](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L663-L692).
>
> It then [renders and validates every preview and its accessibility evidence](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L693-L752).
>
> Finally, it [stores the content-addressed bundle and baseline record](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L753-L797).
>
> The schema [allows one approval per project/design digest](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/migrations/001_prism.sql#L67-L70).
> Control [returns an existing baseline only for the same project/document/approval](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L567-L590).
> The schema [also restricts each project/bundle-key/revision publication](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/migrations/001_prism.sql#L29-L34).
>
> [Studio calculates the document digest, creates the approval, publishes the baseline, and shows both identities](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L350-L405).

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
`issuedAt`. Use the [canonical run-control procedure](operate.md#canonical-run-control-procedure);
do not construct an unvalidated journal record.

The issuer is not authenticated by a signal signature. It is caller-supplied
and compared with the active wait. Restrict signal-file creation and CLI access;
do not describe issuer matching as proof of the human's identity.

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

If the signal command loses its response, follow
[Nova resume response lost](#nova-resume-response-lost).
An unchanged signal file is necessary for an exact retry, but it does not
make a resolved wait accept another CLI invocation.

> **Source evidence — final handoff**
>
> [Control returns the approved artifact and archive only for a matching active baseline](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L226-L240).
>
> Nova validates [archive objects, paths, encoding, manifests, file sets, and digests](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/archive.ts#L6-L52).
>
> It checks [required members, document identity, previews, and the response artifact identity](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/plugins/prism-design/src/archive.ts#L54-L88) before storage.

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
> The archive contract defines [profiles, safe paths, and canonical checksum encoding](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/contracts/prism/v1/src/baseline-archive.ts#L1-L54).
>
> Its assembler [validates members, builds metadata, and returns the bundle digest and bytes](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/contracts/prism/v1/src/baseline-archive.ts#L56-L92).

## Safe Recovery Procedures

### Stop or abandon the journey

Before deployment starts, stop when a gate fails and retain the selected inputs
and exact error. No release mutation is authorized by a failed preflight.

During design work, stop new edits, new rounds, approval, publication, and Nova
signals. Record the project, architecture, round, document revision, request
key, job state, Nova run, and wait. Reconcile any pending job through its original
identity before deciding whether work can continue. Closing Studio or stopping
the agent bridge does not undo an accepted request or cancel Nova's wait.
The bridge marks its external gateway outcome as potentially unresolved on shutdown.

The current Studio exposes no whole-journey cancellation or project-deletion
procedure. The Nova operator CLI also exposes no cancel command. Preserve the
original identities and use the [run-control stop boundary](operate.md#canonical-run-control-procedure)
for containment and wait expiry. An expired or blocked run is not a completed
handoff. Do not delete database rows, reuse an abandoned approval, or invent a
replacement key to make the record look terminal. A supported abort path requires
an owned cancellation contract, durable receipt, and cleanup proof before it can
be added to this procedure.

For task cleanup, retain the evidence list from the canonical procedure, then
remove only temporary local files whose ownership and retention decision are
known. Keep cookies, access tokens, and private keys out of that evidence.
Prism has no automatic purge of project history, approvals, or bundles. Retire
workloads, data, and access only through [decommission](maintenance.md#canonical-decommission-procedure),
after matched backup and retention decisions. Closing the browser is not token
revocation or data removal.

> **Source evidence — stopped work remains durable**
>
> The bridge [aborts local admission on shutdown and preserves external-outcome uncertainty](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/agent-job-runner.mjs#L23-L46).
> Control [returns the original durable agent-job status](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L280-L281).
> Nova's [operator CLI command set](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/core/cli.ts#L21-L45) has no cancel command. Live abort and retirement have no verified outcome for this procedure.


### Child round interrupted

Use this path for a Studio-requested child round, with the original authenticated
user and exact project URL. It does not recover Nova's initial dispatch.
Keep the same tab while its pending session-storage record survives.

1. Retain the original request, key, document revision, parent round, and returned generation ID.
2. Select **Retry the same design round** only if Studio offers it.
3. Confirm that the request and returned generation identities remain unchanged.
4. Wait for exactly three directions in that generation.
5. Confirm the loaded document belongs to those directions before another mutation.

A same-tab reload can read and resubmit the stored request.
It does not authorize a new request if storage disappeared.
Stop on invalid storage, missing identity, changed user, changed generation,
supersession, stale parent, or `NeedsNova`. Do not clear the record to enable new work.
The Prism maintainers must reconcile the original round and agent job.
A superseded result cannot become current merely because its request can replay.

A supported lost-storage recovery path must locate the original request by
verified user/project identity and restore its exact receipt without a second round.
A supported selected-direction replacement must provide an explicit action with
source revision, parent, architecture, and predecessor-lifecycle checks.
Neither recovery path is an implemented Studio action at this revision.

> Studio [exposes a new round only for three rejected directions or a retained pending request](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L608-L632).
> The helper [rejects supersession and clears only a matching completed request](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/design-round-client.ts#L34-L48).
> Admission [refuses unresolved external outcomes and blocked sessions](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/agent-admission.ts#L16-L23).

### Natural-language revision interrupted

The helper retains one request and can reconcile its original job.
The current Studio error screen prevents that operator action after response loss
or loading a retained pending revision. Do not interpret the helper's tests as
proof of usable browser recovery.

1. Stop new revisions, rounds, approval, publication, and Nova signals.
2. Preserve the original instruction, base revision, key, and returned job ID when available.
3. Retain the original document URL, user, time, and sanitized error.
4. Ask Prism maintainers to reconcile that exact job and its committed revision.
5. Keep work stopped until the original result and current revision are known.

Control's `GET /v1/agent-jobs/{id}` exposes the durable receipt to an authenticated
client. `NeedsNova` identifies an unresolved external outcome or blocked session.
It does not permit a new launch. A missing or invalid stored request also
requires maintainer reconciliation; do not reconstruct it from the latest document.

No supported generic operator command currently recovers this browser path.
A supported repair must preserve the original request, expose reconciliation after
reload/error, verify the same job and exactly next revision, and avoid uncertain
external replay. It needs dropped-response, reload, changed-identity, supersession,
and completed-result checks before this boundary can be removed.

> The helper [reuses the original instruction/key and reconciles the same job](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/agent-revision-client.ts#L12-L34).
> Studio [sets failure when it loads that pending request](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L124-L126).
> The [failure screen hides controls](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L491-L499).
> Control [returns an authenticated job receipt](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L280-L281).

### Typed edit or restore interrupted

Use the original project/document URL and authenticated user.
Stop further edits and restore actions. A transport error does not prove rollback.

1. Retain the original base revision or restore source revision ID.
2. Retain the actor, action, request time, body when available, and sanitized error.
3. Reload the current document through the same trusted session.
4. Open **Revision history** and compare the resulting revision with the intended change.
5. Ask Prism maintainers to reconcile the original receipt if the result remains ambiguous.

Control's current-document and history reads expose committed content and revision
records. History also includes actor, creation time, and stored operation.
A restore operation records `sourceRevisionId`; Studio's history list does not
show all those receipt fields. Maintainers must correlate the exact source, actor,
time, parent/current revision, and intended content before they authorize more work.
The latest revision number alone does not prove which request committed.

An identical typed request can reject against its old base after the first commit.
Do not change its base revision to make a retry pass.
An identical restore can commit another revision even when its source is unchanged.
Do not press **Undo** or **Restore** again to test whether the first attempt worked.

There is no automated receipt recovery for these Studio actions.
If reconciliation cannot distinguish their original outcome, preserve evidence and stop.
A supported restore retry needs a persisted request key, source/base binding, exact
result lookup, and one committed revision after duplicate clicks or response loss.
Typed-edit recovery needs the same persisted request/result distinction without
silently rebasing the original intention.

> Studio [sends typed edits without a pending receipt key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L161-L183).
> It [sends restore without an idempotency key](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L232-L248).
> Control [exposes current content, history, restore, and typed writes](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L390-L423).
> History [returns actor/time/operation receipts](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L211-L236).
> Restore [copies the source into another new revision on each successful call](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/index.ts#L237-L260).

### Revision conflict

1. Stop edits until the original request's outcome is known.
2. Reload the current document and history.
3. Compare committed changes with the original operation and intention.
4. Author a new operation only after resolving that uncertainty.

A conflict can mean another edit won, or that your first request committed before
its reply disappeared. The conflict alone does not distinguish those cases.
A new base revision creates a new operation against different content.

### Preference retraction interrupted

**What Prism learned** reads preference evidence.
**Forget** writes a retraction event; it does not erase earlier evidence.
Studio creates a new event identity and timestamp on each click and stores no
pending retraction request.

After response loss, stop preference mutations and retain the original target,
actor, time, and request/event identity when available. Ask Prism maintainers to
correlate the event and its retraction in the authenticated preference history.
Do not infer a missing commit from a hidden or unavailable button.
A new click can append a second event for the same target.

The server supports an exact replay of one wire event, including its original
ID, content, owner, and time. Current Studio does not expose that retained replay.
If the original outcome remains unknown, stop before another preference action.
A supported recovery path must persist that exact event and expose its receipt
across errors and reload, with no duplicate retraction evidence.

> Studio [creates a fresh retraction event for each click](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L250-L275).
> Control [writes events and returns authenticated preference history](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L894-L915).
> Preference storage [replays only the exact recorded wire event and owner](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/control/preferences.ts#L18-L28).

### Approval or publication interrupted

Use this path for response loss, page closure, duplicate-digest rejection,
render failure after approval, or an uncertain baseline result.
A rejected repeat does not remove the original approval.

1. Stop approval, publication, editing, restore, new rounds, and Nova signals.
2. Retain the project, document revision/digest, architecture, approver, time, and sanitized error.
3. Retain the original approval ID, publication body, and bundle receipt when available.
4. Ask Prism maintainers to reconcile the original approval and any baseline/worker receipts.
5. Keep the journey stopped until those exact identities and outcomes are verified.

The owner must distinguish approval not committed, approval committed without
baseline, baseline capture still uncertain, and baseline committed with a lost reply.
Use retained request evidence, Control logs, canonical approval/baseline records,
worker attempt receipts, and artifact verification. Correlate project, document
revision/digest, approver/time, architecture, original approval ID, and bundle identity.
Do not repair by deleting approval rows, changing digests, or editing content to
obtain a different uniqueness key.

Studio has no approval-status lookup or persisted publication retry action.
Without the original approval identity, repeating **Approve** cannot recover its receipt.
With that identity, Control can reuse an already committed baseline through the
same project/document/approval request. This is a server capability, not an
implemented Studio recovery procedure. Missing or uncertain capture still requires
owner reconciliation; a same-ID retry does not authorize unsafe native replay.

This page provides no generic owner restore command for approval/publication.
If the original result cannot be verified through an owned procedure, preserve
its evidence and keep execution stopped. A supported recovery path must persist
approval intent/result before publication, expose authenticated result lookup, and
reconcile the original baseline identity after reload or failure.
It must prove lost approval response, post-approval capture failure, lost baseline
response, duplicate click, concurrent request, changed content, and superseded architecture
without a second approval or conflicting publication.

> Studio [keeps the approval ID locally and displays it only after publication succeeds](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/studio/app.tsx#L371-L403).
> Control [inserts approval before returning its ID](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L540-L565).
> Baseline [replay checks the original project/document/approval](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L567-L590).
> Capture [uses approval-bound identities](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L693-L715).
> The bundle [enters artifact storage before the baseline row and reply](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/server/control-server.ts#L776-L797).
>
> **Check status:** On 2026-10-09, an isolated original-Control HTTP check used migrated embedded PGlite and Node.js `v24.21.0`.
> Approval committed with HTTP 201 before the relay dropped its reply. An identical approval repeat returned HTTP 422 and retained one original row.
> An injected render-admission failure retained that approval and left no baseline; no worker dispatch occurred.
> A SQL-seeded baseline receipt returned HTTP 200 with `reused: true` for the original approval request.
> This proves receipt lookup only; it does not prove baseline rendering, artifact publication, browser recovery, or live approval.
> The isolated check passed, exit zero, against the recorded source revision.

### Approval or publication rejected as stale

Reconcile any earlier uncertain approval/publication before this path.
A stale rejection does not prove that no prior approval or baseline exists.

1. Reload the current document and active directions.
2. Confirm the active architecture request.
3. Run evaluation again after the loaded revision becomes stable.
4. Repeat all preview checks affected by the genuine change.
5. Approve the new reviewed revision only after Prism maintainers resolve the earlier outcome.

Do not create a content change merely to clear a duplicate-digest error.
Use [Approval or publication interrupted](#approval-or-publication-interrupted) for that error.
Never modify approval or baseline rows to renew their authority.

### Nova resume response lost

Keep the original run, wait, signal file, signal ID/key, issuer, approval,
architecture digest, and bundle digest. Do not create another run or decision.

1. Stop additional signal submissions.
2. Use the canonical run-control audit for the original run.
3. Check its durable wait, signal, resolution, dispatch, imported artifact, and final state.
4. Verify the imported artifact matches the original approved bundle before claiming completion.
5. Keep execution stopped if the audit cannot establish the signal's outcome.

If the original wait remains active, use only the unchanged signal and canonical
run-control procedure after checking expiry and recorded signal content.
A resolved wait can reject with `WAIT_UNKNOWN_OR_STALE`; a terminal run can
reject with `WAIT_RUN_TERMINAL`. Those errors do not authorize a replacement signal.
An identical signal journal entry prevents another recording, but it does not
make the CLI return a saved run result after the wait disappears.
Prism maintainers own this interruption boundary. The Nova operator performs the
run audit and restricted signal submission.

> Nova [checks terminal status and the active wait before recording the signal](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/core/execution/engine-run.ts#L84-L108).
> It [deduplicates exact signal content and refuses another signal for that wait](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/nova/core/execution/engine-run.ts#L109-L122).

### Worker not ready

1. Check `/health`, `/bootstrap`, and `/ready` separately.
2. Inspect native worker reconciliation diagnostics.
3. Verify the selected node, pool namespace, policy digest, engine content digest,
   cgroup v2 pool, ownership store, and journal. In HMAC mode, also verify nonce
   database access and migration state through worker `/ready`.
4. Keep admission closed until all retained ownership is reconciled.

Reason: a healthy process can still be unsafe to admit because a previous attempt
or process tree has unresolved ownership. Pod readiness uses `/bootstrap`; only
HMAC-mode `/ready` also checks nonce-table access. Follow the [health signal
boundaries](#4-verify-status-and-smoke-behavior) before interpreting a successful probe.

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
> [The artifact store verifies regular files and content digests on every read](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/artifacts.ts#L20-L29).
>
> [Artifact publication uses a private pending file, file sync, non-replacing link, and directory sync](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/storage/artifacts.ts#L39-L67).

## Diagnosis Map

| Symptom | Most likely boundary | First evidence | Safe next action |
| --- | --- | --- | --- |
| Studio shows no projects | Nova dispatch or Control admission | Nova stage result; Control request log; `prism.project` and active `design_request` | Reconcile the original dispatch. Do not create a replacement project. |
| Project exists but has no directions | Prism agent job | `prism.agent_job` state, fence, result, and outcome; agent bridge log | Wait, reconcile, or escalate `needs_nova`. Do not replay an uncertain launch. |
| Studio says invalid session | Tailscale identity exchange or cookie forwarding | Studio proxy log; two `Set-Cookie` headers | Fix ingress/proxy handling. Do not weaken CSRF or session checks. |
| New round remains pending | Retained request, current round, or blocked agent session | Stored request/key, generation ID and durable job state | Retry only the retained request when Studio offers it; stop on missing storage or unresolved predecessor. |
| Visual edit reports revision conflict | Concurrent document change | Current document and revision history | Reload, compare, and author a new operation. |
| Natural-language change remains pending or reload hides controls | Stored request, agent job, or Studio failure screen | Original key/instruction/base and `/v1/agent-jobs/{id}` receipt | Stop for Prism maintainer reconciliation. The helper contract does not provide recovery controls on the failure screen. |
| Restore or Undo reply disappears | Non-idempotent restore and history | Source revision ID, actor/time, current revision and stored operation | Do not repeat. Reconcile history through the original document and stop on ambiguity. |
| Direction or preference action has an uncertain result | Client key lifetime and preference receipt | Original actor/action/key/event, current direction and durable preference evidence | Stop mutations. Reconcile the exact receipt; a new identity can create another event. |
| Evaluation reply disappears | Pinned revision and native attempt | Embedded document identity, revision, worker key/receipt and readiness | Recheck unchanged input only after ownership is known; stop on conflicting input or uncertain worker state. |
| Preview asset fails | Artifact reference, size, media type, or digest | Browser error and Control artifact read | Verify the bound artifact. Do not replace bytes behind an ID. |
| Evaluation is blocked | Design Document quality | Exact finding ID, gate, target, and message | Correct the current document and evaluate again. |
| Approval fails or its reply disappears | Approval insert, uniqueness, revision, digest, or architecture | Original request, current digest, approval constraint/error and canonical receipt | Stop. Reconcile the original approval before any repeat; use the interruption procedure. |
| Publication fails or its reply disappears | Original approval, worker capture, artifact write, or baseline commit | Original approval ID, worker receipt, full log artifact, target ID and baseline record | Stop. Reconcile approval/publication separately; another Approve click cannot replay the original baseline request. |
| Nova rejects resume | Wait, issuer, architecture, approval, or bundle identity | Nova signal validation and Prism stage reason | Correct the unsigned signal through the restricted Nova CLI. Issuer matching does not authenticate its caller. |
| Nova rejects archive | Stored bytes or archive member contract | Exact `PRISM_ARCHIVE_*` error | Preserve evidence and diagnose. Do not bypass verification. |
| Worker returns 503 on `/bootstrap` or `/ready` | Native reconciliation; HMAC-mode `/ready` can also fail on nonce-table access | Exact endpoint, selected authentication mode, readiness JSON error, and worker diagnostic event | Reconcile ownership or restore the HMAC nonce dependency before admission; a successful Pod probe does not prove nonce access. |

Control currently writes request failures to process logs.
Studio and ingestion write structured error records for unhandled request I/O.
The worker writes structured readiness, shutdown, and failure events.
The current Prism services do not expose a dedicated Prometheus metrics endpoint
or distributed trace interface. Kubernetes probes, structured logs, durable database
rows, attempt journals, and artifacts are the implemented evidence surfaces.
Do not claim metrics or trace coverage that is not present.

## Backup, Restore, and Removal

Use the [canonical backup and restore procedure](recovery.md#prism-restore) for
the matched database-and-artifact group and its same-server-only proof boundary.
Use the [canonical decommission procedure](maintenance.md#canonical-decommission-procedure)
for workload, data, access, credential, and external-resource removal. This
section defines no second backup, restore, retention, or teardown procedure.

## Local Development and Verification

Prepare these tools before you treat a local result as complete:

| Tool | Why Prism needs it |
| --- | --- |
| Node.js 24 and npm | This is the repository CI runtime for the Prism gates. |
| Bash | The dependency bootstrap and several verification scripts use Bash. |
| Helm | Chart lint, render, and Worker readiness tests call the local Helm binary. |
| OpenSSL | Provider-cancellation and product-controller tests create temporary local certificates. |
| Compatible Chromium binaries | Studio and the mobile-editor and preview-isolation spikes use Playwright. |

First complete the canonical
[Locked Dependency Installation](quickstart.md#locked-dependency-installation).
Use a disposable checkout in which the workspace owner permits replacement of
all five dependency trees: root `node_modules` plus `node_modules` under
`puck-adapter`, `mobile-editor`, `preview-isolation`, and `postgres-retrieval`.
Set `PRISM_BOOTSTRAP_EVIDENCE_DIR` to the access-restricted evidence directory
created by that procedure. Then install the root and Prism spike dependencies
with the maintained bootstrap:

```bash
sha256sum package-lock.json spikes/prism/*/package-lock.json \
  > "$PRISM_BOOTSTRAP_EVIDENCE_DIR/prism-lockfiles-before.sha256"
set +e
npm run bootstrap:prism:tests \
  > "$PRISM_BOOTSTRAP_EVIDENCE_DIR/prism-bootstrap.stdout.txt" \
  2> "$PRISM_BOOTSTRAP_EVIDENCE_DIR/prism-bootstrap.stderr.txt"
prism_bootstrap_status=$?
set -e
printf '%s\n' "$prism_bootstrap_status" \
  > "$PRISM_BOOTSTRAP_EVIDENCE_DIR/prism-bootstrap.exit-status.txt"
test "$prism_bootstrap_status" -eq 0
sha256sum -c "$PRISM_BOOTSTRAP_EVIDENCE_DIR/prism-lockfiles-before.sha256"
test -d node_modules
for package in puck-adapter mobile-editor preview-isolation postgres-retrieval; do
  test -d "spikes/prism/$package/node_modules"
done
```

The script uses `npm ci`, includes development dependencies, disables package
scripts, and installs the four Prism spike packages. Because it uses
`--ignore-scripts`, it does not install browser binaries. It also does not
install Helm, OpenSSL, or operating-system browser libraries.
Retain the five lockfile digests, sanitized bootstrap output, exit status, and
directory observations. Apply the canonical checkout-owner cleanup to all five
installed trees; never delete a path whose ownership or disposability is
unproven.
The checksum check uses `-c`, which is supported by both GNU and BusyBox
`sha256sum`. Keep the same repository working directory so that the recorded
relative lockfile paths resolve correctly.

After the bootstrap, install Chromium through each package's local Playwright
version if the machine does not already have the matching cached browser:

```bash
(cd skills/prism && npx --no-install playwright install chromium)
(cd spikes/prism/mobile-editor && npx --no-install playwright install chromium)
(cd spikes/prism/preview-isolation && npx --no-install playwright install chromium)
```

Playwright can still report missing system libraries after it downloads the
browser. Install those libraries with the package method approved for the host;
do not turn a missing browser or system binary into a skipped pass.

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
> [The bootstrap installs deterministic dependencies for the root and four spike packages](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/scripts/bootstrap-prism-tests.sh#L1-L8).
>
> The [local Prism command definitions](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/package.json#L25-L41) and [repository and live gates](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/package.json#L265-L292) define the invocations above.
> With implementation bytes matching this revision, Node.js `v24.21.0` ran `node --test skills/prism/tests/control-server-config.test.mts` on 2026-10-09: three tests passed, exit zero. The command `npm run verify:prism:deploy-script` also passed, exit zero. It checked workflow YAML, the deploy-command contract, and Bash syntax. The runtime materialization check stopped at the absent `releases/runtime-images.json`. The other full gate commands in the table have no result for this page. Separate interruption fixtures above report their narrower local results. No successful deployment or Studio-to-Nova journey is established by these results.

## Implemented, Environment-Dependent, and Not an Operator Surface

| Capability | Current status | What you can claim |
| --- | --- | --- |
| Project, request, round, direction, document, revision, approval, and baseline persistence | Implemented and covered by source-level tests | The contracts and database behavior work in the tested environment. |
| Studio chooser, visual editing, preview, evaluation, approval, and publication request | Implemented; interruption recovery varies by action | Claim only the source/fixture/browser behavior actually checked. Error screens and lost identities can block recovery. |
| Natural-language client-helper reconciliation | Implemented and checked in isolated HTTP/database fixtures; current error/reload UI blocks its control | Helper replay does not prove browser recovery or a live provider result. |
| Durable native worker operation and restart journal | Implemented; native proof needs a prepared Linux host and isolated database | Claim native operation only with retained native gate evidence. |
| PostgreSQL migration and pgvector retrieval | Implemented; native PostgreSQL proof needs configured test databases | Claim actual PostgreSQL behavior only when the native suite ran. |
| Tailscale Studio ingress and SPIFFE service trust | Charted and checked structurally; live proof is environment-specific | Claim live identity only after cluster tests. |
| Prism agent through OpenClaw and LiteLLM | Implemented deployment path; actual provider proof is live | Do not infer provider success from deterministic worker tests. |
| Corpus public-web acquisition | Acquisition code exists, but Control rejects `public-web` until a source policy is approved | Do not present public-web ingestion as an enabled operator feature. |
| Ingestion service | Implemented but disabled by default | Enable only with explicit resource sizing and source policy. |
| Browser archive download in Studio | Not implemented as a user action | Use the Nova governed handoff or an authorized artifact client. |
| Automatic Nova resume after Studio approval | Not implemented by design | Submit the separate unsigned signal through the restricted Nova CLI path. |
| `toBusterPlan` and `toForgeAssignments` handoff helpers | Implemented and tested as declarative conversion helpers; no maintained production caller is present | Do not claim that they apply Buster manifests, filesystem access, or module assignments. |
| Dedicated Prism metrics and distributed tracing endpoint | Not implemented | Use probes, logs, durable state, journals, and artifacts. |
| Horizontal Prism worker scaling | Not the current native deployment model | The current native worker is one Recreate replica bound to one host policy. |

The pipeline helper limit is important. The helpers return data structures only.
Their tests prove conversion and rejection rules, not an installed downstream
deployment.

> [The handoff helpers create a visual-plan fragment and read-only assignment declarations](https://github.com/datrab/kubeclaw/blob/082db288f7bc5e686e47306d60cf4db7d8ba8cfc/skills/prism/pipeline-adapter/index.ts#L1-L57).

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

This operator page ends at supported use and recovery. For implementation
changes, the canonical route is [Extend Prism safely](../extend/platform/prism.md).
Use that guide with the relevant source, contract, migration, chart, and
focused tests. Do not derive a new extension contract from an old architecture
proposal or from this operator procedure alone.

## Completion Checklist

A Prism operator journey is complete only when all statements below are true:

- the selected release and code bundle match one reviewed source commit;
- Prism service and agent releases are ready;
- the native worker reports ready after ownership reconciliation; in HMAC mode,
  worker `/ready` also confirms nonce-table access;
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

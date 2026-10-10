# Operate Prism: From Architecture to Approved Handoff

Status: local deploy-script verification passed; fixed spike browser path blocks complete local checks; absent runtime release selection blocks deployment; no live journey result
Audience: Prism operator, designer, incident responder, platform maintainer
Owner: Prism maintainers
Evidence: skills/prism; skills/nova/plugins/prism-design; charts/prism; scripts/deploy.sh
Evidence revision: `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
Applies to: the current Prism Control, Studio, agent, native worker, ingestion service, and Nova Prism stage
Historical executed checks: 2026-10-09 against `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`; local deploy-script, Control configuration, and interruption checks passed; no browser recovery or live journey result is available. Source links were checked at the evidence revision; this does not change the execution revision.

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
and the selected service health checks. Before submitting design work, verify
[SPIFFE agent admission](#spiffe-agent-admission) on Control and the agent path,
including the exact trusted agent identity. SPIFFE identifies workloads; Control
also checks which identity may claim jobs and commit designs. A healthy HMAC
worker does not enable this journey. Verify the named human's private access.
Then use the original Nova run to submit its admitted architecture. Nova creates
its approval wait after dispatch. Before a human changes or approves the design,
verify that original request and wait; stop if dispatch or wait creation is
missing or uncertain. Run Studio actions through that human's private browser
session. Release receipts, Prism Control state, immutable artifact bytes,
Studio approval, Nova wait state, and Nova audit are the authorities.

> Nova [dispatches the original architecture before it creates the approval wait](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/src/stage.ts#L21-L34).

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
> [The Prism stage creates the wait, publishes the operator request, and validates the later approval signal](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/src/stage.ts#L8-L34).

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
> [Control authenticates and validates the Nova dispatch](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L174-L213).
>
> It then [stores the request and starts a design round or returns the approved baseline](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L214-L240).
>
> [The agent bridge claims only durable jobs and records the bounded OpenClaw outcome](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/agent-job-runner.mjs#L16-L46).
>
> [The native worker host uses a deterministic provider; production model work stays in the managed Prism agent](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/native-worker-host.ts#L12-L33).

## Before You Start

You need all of the following items:

1. A reviewed runtime release selection with Prism image digests.
2. A Kubernetes cluster with the required Prism namespace and image-pull Secret.
3. PostgreSQL storage and artifact storage with sufficient capacity.
4. The native worker host policy and its generated Prism values.
5. A registered SPIFFE CSI driver (`csi.spiffe.io`). The maintained Prism deploy command requires it for every deployment: the [unconditional guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1757-L1760) calls the [driver-registration check](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L974-L981). Registration alone does not prove the [socket delivery or workload identity](worker-trust.md#preconditions).
6. The Tailscale access configuration when Tailscale exposure is enabled. Verify actual private Studio access after deployment.
7. `gatewayToken-prism` in `openclaw-shared-secrets`.
8. A valid Prism code bundle URL and a commit that matches the selected runtime receipt.
9. The authorized operator issuer ID used by the Nova Prism stage.
10. SPIFFE-enabled Control and a matched agent trust path with the exact identity
    that Control permits. Complete [SPIFFE agent admission](#spiffe-agent-admission)
    before Nova dispatch, a child round, or a natural-language revision.

Stop if an identity, digest, Secret, or native host binding is unknown.
Do not replace an unknown value with a new value during an active run.
That action can make a durable request impossible to reconcile.

### SPIFFE agent admission

The governed journey requires SPIFFE mode on Control and the matched agent
connection. The bridge must claim a durable job before it starts external work.
Control requires the same trusted Prism Agent identity for job claim, job status,
job finish, direction commit, and natural-language revision commit. CSI driver
registration is a separate deployment prerequisite; it does not enable this
application trust mode or grant agent permission.

Before submitting design work, the release and workload-trust owners must verify:

1. The selected service values and rendered Control environment enable SPIFFE:
   `workerTrust.spiffe.enabled: true` produces `WORKER_TRUST_SPIFFE_ENABLED=true`.
2. Control's `PRISM_TRUSTED_AGENT_SPIFFE_ID` equals the agent's issued workload
   identity. The service chart constructs it as
   `spiffe://<trust-domain>/ns/<agent-namespace>/sa/<agent-service-account>` from
   the selected `workerTrust.spiffe` values. Each placeholder is that selected
   value, not a new identity chosen during diagnosis.
3. The selected agent release enables its SPIFFE path, receives its credential
   and Workload API socket, and reaches Control through the matched trust proxy.
   Follow [Worker Trust](worker-trust.md#canonical-worker-trust-procedure).
4. An authorized isolated agent exercise proves job claim, direction commit,
   and natural-language revision commit permission for that exact identity.
   Keep this evidence separate from health probes and from the production
   request's result.

The service chart defaults SPIFFE to `false`; the development agent overlay
enables it. Those inputs alone do not establish a matched selected release.
If this prerequisite is absent or unverified, stop before design submission.
The blocked step is the agent's job claim or result commit, even if Control can
store a request and a HMAC worker can pass health checks. The release and trust
owners must supply a matched configuration and prove the permissions above
before the journey opens. This page provides no generic command to repair trust.

If work was already admitted, preserve its original run, architecture, request,
round, instruction/base revision, key, and job/fence identities. Stop new work
and follow [Agent work blocked by trust](#agent-work-blocked-by-trust).
Do not replay an uncertain launch or switch trust mode to clear an active
worker error.

> **Source evidence — mandatory agent trust**
>
> **Claim:** Internal agent jobs and design/revision commits require SPIFFE and
> the exact configured agent identity; the bridge claims before external work.
>
> **Implementation:** [`handleAgentJobs` trust guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/agent-job-routes.ts#L8-L10) ·
> [direction-commit guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L243-L245) ·
> [revision-commit guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L263-L265) ·
> [`AgentJobRunner.runOne` claim](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/agent-job-runner.mjs#L27-L30).
>
> **Contract or setting:** [Control's startup trust policy](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-config.ts#L22-L38) ·
> [rendered mode and exact agent identity](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L127-L138) ·
> [service trust defaults](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.yaml#L75-L84) ·
> [agent-overlay enablement](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/my-values/prism-agent-values.yaml#L59-L60).
>
> **Test evidence:** No running-deployment agent claim or commit result is
> established here. The required permission exercise remains unexecuted.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** Source guards and selected configuration do not prove credential
> delivery, proxy access, permission in a running deployment, or model completion.

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
> [The deploy command requires both materialized values files and validates all four Prism image digests](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1593-L1616).
>
> [The chart defaults leave the four image digests empty](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.yaml#L1-L7).

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
> [The deploy script captures private overlays and fixes the base files to materialized release values](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L100-L103).
>
> [Service release values, private overlay, fixed trust and Secret overrides are applied in that order](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1725-L1744).

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
| SPIFFE trust | The governed agent journey requires SPIFFE-enabled Control and the exact trusted agent identity. Configure the trust domain, namespaces, service accounts, CSI socket, and proxy images as one policy; complete [agent admission](#spiffe-agent-admission) before submission. An incomplete identity set blocks startup. |
| Personal preference | Select only an existing authenticated Prism subject in `control.pipelinePreferenceSubject`. Empty disables personal preference binding for pipeline rounds. |
| Product decisions | Enable only with the separate operator, issuer, key, controller, CA, audience, and revision policy. This authority is distinct from design approval. |

The schema closes the top-level object and selected security-sensitive groups,
but some nested objects remain open. An unknown nested key can pass schema
validation while no template reads it. Compare the selected values with the
generated inventory's receiving source and the rendered manifests. Reject an
unconsumed override; schema acceptance alone does not prove an effect.

> **Source evidence — deployment constraints**
>
> The [workload template rejects Control and worker replica counts other than one](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L1-L8).
> The [schema requires its core groups and closes images](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L59-L108), but [leaves some nested resources open](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L510-L531).
> [Selected defaults include storage, backup, exposure, and trust](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.yaml#L44-L92).

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
> Control [validates its preference and trust boundary](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-config.ts#L9-L38) and [captures one startup configuration](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-config.ts#L40-L72).
> Studio [validates its port and Control timeout](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/studio-config.ts#L4-L17).
> Worker [validates ingress and shutdown bounds](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-config.ts#L1-L38).
> Native configuration [admits resource and engine identity](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/config/native-worker.ts#L4-L35) and [host scope and authentication](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/config/native-worker.ts#L38-L47). It also validates [supervisor paths and journal bounds](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/config/native-worker.ts#L50-L83).

The following settings are required when their feature is active. They have no
safe implied identity. Control's SPIFFE trust and the matched agent path are
mandatory for this governed journey. HMAC worker inspection remains a separate
supported health boundary; it does not make agent work available.

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
> [Control rejects an incomplete SPIFFE trust policy and otherwise requires the fallback secrets](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-config.ts#L16-L55).
>
> [Product authority is disabled unless explicitly selected and then requires HTTPS, an operator allowlist, and a dedicated Ed25519 key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/product-decisions.ts#L20-L43).

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
- `workerTrust.spiffe.enabled` must be `true` for this agent journey. Its identity
  must equal Control's `PRISM_TRUSTED_AGENT_SPIFFE_ID` under the selected policy.
  The remaining `workerTrust.spiffe` settings must match that policy and sidecar
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
> The common chart defines [role, image, bundle, and registry value families](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L16-L63).
>
> It defines [worker-trust values](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L132-L145).
>
> It also defines [auth, LiteLLM, Stitch, and Discord values](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L147-L201) and [model and Git values](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L203-L220).
>
> The shipped overlay fixes [the role, image, code bundle, authentication, and model endpoint](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/my-values/prism-agent-values.yaml#L1-L40).
>
> It fixes [the agent, service, trust, and bridge selection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/my-values/prism-agent-values.yaml#L45-L85) and [workspace and dependency probes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/my-values/prism-agent-values.yaml#L87-L103).
>
> Private authority identities are deliberately excluded from these links.
>
> The deploy command [resolves and verifies the selected Prism bundle](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1688-L1724).
>
> It then [applies the private overlay before binding the bundle and LiteLLM endpoint](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1725-L1748).

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
> [The Prism stage configuration schema is closed and requires all four fields](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/schemas/config.schema.json#L1-L1).

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
> [The deployment command creates missing values, verifies every required key, and does not print secret values](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1639-L1681).

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
- SPIFFE enabled on Control and the agent, exact matching agent identity, and
  the required Envoy sidecars for this journey;
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
> The deploy command [resolves and verifies the selected bundle](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1684-L1724).
>
> It [assembles overrides and renders both roles](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1725-L1748).
>
> It then [runs host and trust preflight, Secret checks, and the Prism Helm install](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1750-L1781).
>
> Finally, it [installs the agent and waits for every workload](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1782-L1797).
>
> [The maintained deploy waits for the chart-owned PostgreSQL StatefulSet, and smoke enters that StatefulSet](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1793-L1811).
>
> [Migrations take one advisory lock and commit each ordered migration name in one transaction](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L21-L75).

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
In **HMAC** mode, a shared secret authenticates each internal message and protects
its content from changes. A **nonce** is a one-use request value; PostgreSQL
retains its digest to reject replay. HMAC alone does not prevent replay or grant
application permission. See [HMAC and nonce](../reference/glossary.md#hmac-and-nonce).
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

Passing HMAC worker health does not open the governed design journey. Agent
claim and direction/revision commits require the separate
[SPIFFE agent admission](#spiffe-agent-admission) checks. Keep design submission
closed until those checks succeed.

> **Source evidence — worker and dependency health**
>
> **Claim:** Worker Pod readiness and worker dependency readiness are different checks.
>
> **Implementation:** The worker [checks native readiness and conditionally checks the nonce database](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-service.ts#L72-L86); its [health and bootstrap routes have separate meanings](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-service.ts#L95-L105). Control [checks PostgreSQL with `SELECT 1`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L143-L147). The smoke command [calls both service readiness routes and `pg_isready`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/deploy.sh#L1802-L1811).
>
> **Contract or setting:** The chart [selects worker `/bootstrap` and liveness `/health`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L157-L162) and [defaults SPIFFE to disabled](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.yaml#L75-L84). The nonce check [queries the exact nonce table](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L8-L10).
>
> **Test evidence:** The [Helm fixture checks worker bootstrap readiness and health liveness](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/worker-readiness-chart.test.mts#L6-L15). No executed result for this fixture is recorded here.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
>
> **Limit:** Probe definitions do not establish a rendered selected release, live dependency health, authenticated worker attempt, or completed Studio journey.

## The Complete Studio Journey

The following status map applies to every step below at the recorded revision.
“Implemented” means that the linked product code provides the operation; it does
not mean that this deployment exercised it. The absent runtime release selection
stops this checkout before deployment and the live journey. Verification did
not include any live Studio-to-Nova step. Agent work additionally remains
unavailable until the selected release meets [SPIFFE agent admission](#spiffe-agent-admission);
service health alone does not remove that boundary.

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
when available. **CSRF** means cross-site request forgery: another site tries to
make the browser submit an unwanted change. Prism's separate CSRF token must
match its browser cookie and request header for a session write. It does not
replace session authentication or permission checks. See
[CSRF](../reference/glossary.md#csrf). Do not retain cookies, CSRF values, tokens,
or private keys.

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
> **Implementation:** Studio [stores pending revision state during startup](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L124-L131) and [replaces controls with its failure screen](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L491-L499).
> Its [direction keys remain in component memory](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L277-L283).
> The round helper [stores and reuses the original request](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/design-round-client.ts#L8-L23).
> The revision helper [retains its request and validates the returned job/result](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/agent-revision-client.ts#L6-L33).
>
> **Contract:** Control [rejects different worker input under a retained key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/native-operation-store.ts#L28-L45).
>
> **Test evidence:** The [round HTTP fixture preserves one request across response loss](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/design-round-client.test.mts#L9-L37).
> The [revision HTTP/database fixture preserves the original job and reports NeedsNova](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/agent-revision-client.test.mts#L16-L44).
> The [decision fixtures distinguish exact replay from new feedback](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/control-decisions.test.mts#L33-L67).
>
> **Check status:** On 2026-10-09, against `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`, Node.js `v24.21.0` ran five selected client/decision/round/domain-storage suites: all 17 tests passed, exit zero.
> These checks use isolated HTTP, storage substitutes, and embedded PGlite. They do not exercise Studio browser controls or production dependencies.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
>
> **Limit:** Source and isolated client/database checks do not prove browser recovery, native execution, or a live journey.

### Step 1: Let Nova create the governed project

Before dispatch, require the matched Control/agent SPIFFE configuration and
trusted agent permission from [SPIFFE agent admission](#spiffe-agent-admission).
Stop before submission if that evidence is absent. Control can store a request
in HMAC mode while the agent cannot claim or commit its work.

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

> Nova [derives the dispatch key from the run, architecture digest, and approval phase](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/src/stage.ts#L20-L25).
> Control [validates architecture transitions and starts the bound round](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L214-L230).
> The round store [replays an exact recorded start and rejects conflicting content](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/design-generations.ts#L25-L44).

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
> [Control validates the signed session and the separate CSRF cookie and header](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L108-L123).
>
> [The session route returns the CSRF value and stable user identity](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L152-L172).
>
> [Studio starts the session, lists projects, and loads the selected document](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L97-L149).

### Step 3: Wait for exactly three directions

The agent must use the SPIFFE identity permitted by Control to claim and commit
this job. If directions remain pending, check
[Agent work blocked by trust](#agent-work-blocked-by-trust) before treating the
delay as a model/provider problem. Do not dispatch another request to test it.

The Prism agent must commit exactly three materially different and valid Design
Documents for one generation. A **job fence** is the durable identity of the
current job claim. The returned fence must still match the stored claim before
Control can commit its result; an old claimant cannot commit a later claim's
work. See [Job fence](../reference/glossary.md#job-fence). Control checks:

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
> [Control validates and stores exactly three agent directions](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L243-L277).
>
> [Studio retains the idempotency key and generation ID and rejects a superseded pending round](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/design-round-client.ts#L3-L48).

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
> [Control accepts only the supported feedback actions and requires an idempotency key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L346-L387).
>
> [Studio retains pending direction keys only in component memory](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L277-L330).
> [Control derives event identity from the user and supplied key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/direction-decisions.ts#L43-L61).
> [The isolated decision test proves deduplication with the same key and another event with a fresh key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/control-decisions.test.mts#L54-L63).

### Step 5: Request another design round when needed

Require the same [SPIFFE agent admission](#spiffe-agent-admission) evidence
before requesting another round. A prior health result or direction set does
not prove that the current agent path remains authorized.

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
> [Control checks current project, architecture, parent, document, revision, and idempotency before it admits another round](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L346-L365).
>
> [Studio preserves the pending request and tells the operator to reconnect with the same key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L332-L348).

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

Before selecting **Propose change**, verify [SPIFFE agent admission](#spiffe-agent-admission)
for Control and the current agent identity. A stored revision job cannot progress
through HMAC-only Control. On a trust rejection, stop and preserve the original
request through [Agent work blocked by trust](#agent-work-blocked-by-trust).

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
> [The domain applies typed operations only at the expected base revision and then increments once](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/domain/index.ts#L67-L113).
>
> The repository [applies an operation and advances the current revision with compare-and-swap](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L262-L293).
>
> Whole-document replacement [checks the expected revision and uses the same compare-and-swap boundary](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L294-L330).
>
> [Studio retains and reconciles one natural-language revision request](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/agent-revision-client.ts#L3-L34).

### Step 7: Inspect or restore history

Open **Revision history** before approval.
Studio shows revision numbers and the **Undo** or **Restore** controls. It does
not display the exact revision ID or creation time. Control's history response
contains the exact revision ID, actor, creation time, and stored operation.
For an uncertain write, follow [Typed edit or restore interrupted](#typed-edit-or-restore-interrupted).
A displayed revision number alone does not identify which request committed.

> Studio [renders revision numbers and restore controls](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L808-L823).
> Control [returns the history records](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L392-L398), and the repository [includes exact receipt fields](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L211-L239).

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
> [Control exposes history and a restore operation for one document](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L389-L421).
>
> [Restore creates a new revision and records the source revision ID](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L211-L260).

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
An **ARIA snapshot** records the rendered view's accessibility tree: the roles,
names, and states exposed to assistive software. It differs from a screenshot,
which records visible pixels. ARIA means Accessible Rich Internet Applications.
The snapshot is retained evidence, not proof that all accessibility checks pass.
See [ARIA snapshot](../reference/glossary.md#aria-snapshot).

> **Source evidence — preview boundary**
>
> [Studio builds the preview from the selected view, state, viewport, assets, components, and theme](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/preview.ts#L1-L31).
>
> [The asset loader encodes bounded bytes as base64 `data:` URLs](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/preview-assets.ts#L35-L43).
>
> [Studio resolves only declared flow transitions from preview messages](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/flows.ts#L1-L47).

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

> Studio [binds evaluation to the loaded revision and derives its worker key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L406-L442).
> Control [loads the requested immutable revision](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L425-L453).
> Native operation storage [preserves the original attempt and rejects input conflicts](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/native-operation-store.ts#L28-L45).
> It [stores the bound result before completion](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/native-operation-store.ts#L49-L68).

> **Source evidence — quality gate**
>
> [The evaluator defines finding levels, gate families, stable IDs, and the final status rule](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L4-L36).
>
> The evaluator checks [document structure and node references](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L37-L96).
>
> It checks [asset references and alternative text](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L97-L131) and [state and responsive references](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L132-L160).
>
> It also checks [flow endpoints and transition coverage](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L162-L197).
>
> Finally, it derives [transition validity, recovery coverage, and the final status](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/evaluation/index.ts#L198-L235).

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
> [Control binds approval to the current document, quality findings, warnings, and active architecture](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L521-L565).
>
> Control [rejects a baseline with a mismatched project, document, approval, or revision](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L567-L607).
>
> It then [rejects stale digests, blocked quality, changed warnings, or a missing active direction](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L608-L629).
>
> Control [assembles the specification and acceptance criteria](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L630-L662).
>
> It [collects bounded content-addressed assets](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L663-L692).
>
> It then [renders and validates every preview and its accessibility evidence](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L693-L752).
>
> Finally, it [stores the content-addressed bundle and baseline record](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L753-L797).
>
> The schema [allows one approval per project/design digest](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/migrations/001_prism.sql#L67-L70).
> Control [returns an existing baseline only for the same project/document/approval](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L567-L590).
> The schema [also restricts each project/bundle-key/revision publication](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/migrations/001_prism.sql#L29-L34).
>
> [Studio calculates the document digest, creates the approval, publishes the baseline, and shows both identities](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L350-L405).

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
> [Control returns the approved artifact and archive only for a matching active baseline](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L226-L240).
>
> Nova validates [archive objects, paths, encoding, manifests, file sets, and digests](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/src/archive.ts#L6-L52).
>
> It checks [required members, document identity, previews, and the response artifact identity](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/plugins/prism-design/src/archive.ts#L54-L88) before storage.

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
> The archive contract defines [profiles, safe paths, and canonical checksum encoding](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/contracts/prism/v1/src/baseline-archive.ts#L1-L54).
>
> Its assembler [validates members, builds metadata, and returns the bundle digest and bytes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/contracts/prism/v1/src/baseline-archive.ts#L56-L92).

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
> The bridge [aborts local admission on shutdown and preserves external-outcome uncertainty](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/agent-job-runner.mjs#L23-L46).
> Control [returns the original durable agent-job status](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L280-L281).
> Nova's [operator CLI command set](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/core/cli.ts#L21-L45) has no cancel command. Live abort and retirement have no verified outcome for this procedure.


### Agent work blocked by trust

Use this path when initial directions, a child round, or a natural-language
revision remain pending and Control or the bridge records either exact error:

- `Prism agent jobs require SPIFFE trust`: Control rejects the internal job
  route family before the agent can claim, read, or finish a job.
- `Prism agent tools require SPIFFE worker trust`: Control rejects direction
  or natural-language revision commits before it reads their submitted body.

An identity rejection with SPIFFE already enabled is a different case: the
verified peer must equal Control's configured trusted agent identity. Retain
the exact sanitized rejection. A pending job alone does not establish either
trust failure; correlate it with the selected mode, identity, and error.

1. Stop new dispatches, rounds, revisions, approval, publication, and Nova signals.
2. Preserve the original run/wait, architecture, project/round, request/key,
   instruction/base revision, job/fence, state, time, and sanitized error.
3. Ask the release and workload-trust owners to compare the selected service
   and agent configuration with [SPIFFE agent admission](#spiffe-agent-admission).
4. Ask Prism maintainers to reconcile the original durable job and any external
   outcome before they permit more work.

The blocked step is agent claim or result commit. HMAC worker `/ready`, Control
`SELECT 1`, and CSI registration cannot prove that step is available. The
release/trust owners must supply a matched SPIFFE configuration and separately
prove claim and commit permission for the exact agent identity. Prism
maintainers must also establish the original job/result and current revision
before the admitted journey can continue. Keep those permission and result
records with the original identities. Do not create replacement keys/jobs,
replay uncertain external work, or switch trust mode to clear an active worker
error. This page supplies no generic trust-repair or job-replay command.

> The [job-route guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/agent-job-routes.ts#L8-L10),
> [direction guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L243-L245), and
> [revision guard](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L263-L265)
> require mode and exact peer permission. [Agent admission](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/agent-admission.ts#L16-L23)
> separately refuses unresolved external work; trust repair does not resolve it.

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

> Studio [exposes a new round only for three rejected directions or a retained pending request](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L608-L632).
> The helper [rejects supersession and clears only a matching completed request](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/design-round-client.ts#L34-L48).
> Admission [refuses unresolved external outcomes and blocked sessions](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/agent-admission.ts#L16-L23).

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

> The helper [reuses the original instruction/key and reconciles the same job](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/agent-revision-client.ts#L12-L34).
> Studio [sets failure when it loads that pending request](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L124-L126).
> The [failure screen hides controls](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L491-L499).
> Control [returns an authenticated job receipt](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L280-L281).

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

> Studio [sends typed edits without a pending receipt key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L161-L183).
> It [sends restore without an idempotency key](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L232-L248).
> Control [exposes current content, history, restore, and typed writes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L390-L423).
> History [returns actor/time/operation receipts](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L211-L236).
> Restore [copies the source into another new revision on each successful call](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/index.ts#L237-L260).

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

> Studio [creates a fresh retraction event for each click](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L250-L275).
> Control [writes events and returns authenticated preference history](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L894-L915).
> Preference storage [replays only the exact recorded wire event and owner](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/preferences.ts#L18-L28).

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

> Studio [keeps the approval ID locally and displays it only after publication succeeds](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/app.tsx#L371-L403).
> Control [inserts approval before returning its ID](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L540-L565).
> Baseline [replay checks the original project/document/approval](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L567-L590).
> Capture [uses approval-bound identities](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L693-L715).
> The bundle [enters artifact storage before the baseline row and reply](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-server.ts#L776-L797).
>
> **Check status:** On 2026-10-09, an isolated original-Control HTTP check used migrated embedded PGlite and Node.js `v24.21.0`.
> Approval committed with HTTP 201 before the relay dropped its reply. An identical approval repeat returned HTTP 422 and retained one original row.
> An injected render-admission failure retained that approval and left no baseline; no worker dispatch occurred.
> A SQL-seeded baseline receipt returned HTTP 200 with `reused: true` for the original approval request.
> This proves receipt lookup only; it does not prove baseline rendering, artifact publication, browser recovery, or live approval.
> The isolated check passed, exit zero, against `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`. The linked source bytes match the evidence revision; no new execution is implied.

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

Use this path also after any rejected resume. A rejection alone does not prove
that the original submission failed to commit.
Keep the original run, wait, signal file, signal ID/key, issuer, approval,
architecture digest, and bundle digest. Do not create another run or decision.

1. Stop additional signal submissions.
2. Use the canonical run-control audit for the original run.
3. Check its durable wait, signal, resolution, dispatch, imported artifact, and final state.
4. Verify the imported artifact matches the original approved bundle before claiming completion.
5. Keep execution stopped if the audit cannot establish the signal's outcome.

Read the exact rejection against that audit. Malformed envelope or payload input
is a different case from a missing, expired, resolved, or invalidated wait.
An issuer/type/digest mismatch requires a stop under canonical run control;
it does not authorize changing the original identities. Only the Nova operator,
after the audit proves the original wait is active, unexpired, and has no
conflicting recorded signal, can decide whether the canonical contract permits
submission. This page provides no general instruction to correct or replace
a rejected signal.

If the original wait remains active, use only the unchanged signal and canonical
run-control procedure after checking expiry and recorded signal content.
A resolved wait can reject with `WAIT_UNKNOWN_OR_STALE`; a terminal run can
reject with `WAIT_RUN_TERMINAL`. Those errors do not authorize a replacement signal.
An identical signal journal entry prevents another recording, but it does not
make the CLI return a saved run result after the wait disappears.
Prism maintainers own this interruption boundary. The Nova operator performs the
run audit and restricted signal submission.

> Nova [checks terminal status and the active wait before recording the signal](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/core/execution/engine-run.ts#L84-L108).
> It [deduplicates exact signal content and refuses another signal for that wait](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/nova/core/execution/engine-run.ts#L109-L122).

### Worker not ready

Use this read-only diagnosis after a selected deployment fails worker health or
smoke checks. Stop new evaluations and publication. Keep the original attempt
identities and keep admission closed. These commands read health and logs; they
do not submit an attempt, change a workload, or repair retained ownership.

Run from `<repository-root>` on the administration machine, in the original
[bound cluster shell](install.md#bind-cluster-authority). Use the evidence revision
and the selected image receipt recorded for this task. Follow
[Supported Versions](install.md#supported-versions): this page adds no Kubernetes
compatibility range. The administration machine needs Bash, Node.js 24, and the
recorded `kubectl` version. The maintained worker image contains Node.js 24 and
listens on port `8080`. The selected chart names its application container
`worker`. Stop if the selected deployment uses another contract.

Required namespace permissions are `get` deployments and Pods, `list` Pods,
`create` on `pods/exec`, and `get` on `pods/log`. Exec permission allows the short
diagnostic process; it does not authorize changing files or database state. No
Secret read, environment dump, host shell, or cluster-admin permission is needed.
If the container cannot start, retain its status and available logs and stop for
the owners below; there is no running HTTP endpoint to inspect.

#### 1. Select and record one worker

Replace `<hmac-or-spiffe>` with `hmac` or `spiffe` from the approved selected
values and render, not from the chart default. The code checks only the non-secret
trust-mode flag in the Pod specification and compares it with that selection.
Retain the selected release/configuration digests separately with this evidence.
The evidence directory below is a new private local directory. It is outside
workload storage; record its printed path for retention.

```bash
assert_cluster_binding
test "$(bound_kubectl auth can-i get deployments.apps -n "$PRISM_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i get pods -n "$PRISM_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i list pods -n "$PRISM_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i create pods/exec -n "$PRISM_NAMESPACE")" = yes
test "$(bound_kubectl auth can-i get pods/log -n "$PRISM_NAMESPACE")" = yes
prism_worker_mode='<hmac-or-spiffe>'
case "$prism_worker_mode" in hmac|spiffe) ;; *) exit 1 ;; esac
prism_worker_pod="$(bound_kubectl get pods -n "$PRISM_NAMESPACE" -l app=prism-worker \
  -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}')"
test -n "$prism_worker_pod"
case "$prism_worker_pod" in *$'\n'*) printf 'STOP: more than one worker Pod\n' >&2; exit 1 ;; esac
prism_worker_uid="$(bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" -o jsonpath='{.metadata.uid}')"
test -n "$prism_worker_uid"
prism_worker_flag="$(bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
  -o jsonpath='{.spec.containers[?(@.name=="worker")].env[?(@.name=="WORKER_TRUST_SPIFFE_ENABLED")].value}')"
case "$prism_worker_flag" in true) prism_observed_mode=spiffe ;; ''|false) prism_observed_mode=hmac ;; *) exit 1 ;; esac
test "$prism_worker_mode" = "$prism_observed_mode"
umask 077
prism_worker_evidence="$(mktemp -d "${TMPDIR:-/tmp}/prism-worker-diagnosis.XXXXXX")"
printf '%s\n' "$prism_worker_evidence"
printf 'context=%s\nnamespace=%s\npod=%s\nuid=%s\nmode=%s\n' \
  "$EXPECTED_CONTEXT" "$PRISM_NAMESPACE" "$prism_worker_pod" "$prism_worker_uid" \
  "$prism_worker_mode" > "$prism_worker_evidence/binding.txt"
bound_kubectl get deployment prism-worker -n "$PRISM_NAMESPACE" \
  -o custom-columns='NAME:.metadata.name,REPLICAS:.spec.replicas,NODE:.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[*].matchFields[*].values[*],POLICY:.spec.template.metadata.annotations.kubeclaw\.dev/native-worker-policy,IMAGE:.spec.template.spec.containers[?(@.name=="worker")].image' \
  > "$prism_worker_evidence/deployment.txt"
bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,NODE:.spec.nodeName,PHASE:.status.phase,IMAGE:.spec.containers[?(@.name=="worker")].image,IMAGE_ID:.status.containerStatuses[?(@.name=="worker")].imageID,READY:.status.containerStatuses[?(@.name=="worker")].ready,RESTARTS:.status.containerStatuses[?(@.name=="worker")].restartCount,WAIT_REASON:.status.containerStatuses[?(@.name=="worker")].state.waiting.reason,EXIT_REASON:.status.containerStatuses[?(@.name=="worker")].lastState.terminated.reason' \
  > "$prism_worker_evidence/pod-before.txt"
```

Every permission check must return `yes`. No Pod, multiple Pods, unknown mode,
or a mode mismatch is a stop. Compare `deployment.txt` and `pod-before.txt` with
the retained release: exactly one worker, the selected node, namespace, native
policy digest, and worker image digest must match. An image tag alone is
insufficient. Do not select another Pod merely to obtain a passing probe.

#### 2. Query all three endpoints on that Pod

The function below checks the Pod UID before each call. It runs three sequential
loopback GET requests inside container `worker`. Each request has a five-second
deadline and a 4 KiB response limit. The Kubernetes API request timeout is
30 seconds. It sends no authentication header, because these health routes do
not authenticate attempts. It opens no port-forward and creates no cluster resource.

```bash
assert_cluster_binding
prism_worker_probes() {
  local phase="$1" probe_status
  case "$phase" in before|after) ;; *) return 1 ;; esac
  assert_cluster_binding || return 1
  test "$(bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
    -o jsonpath='{.metadata.uid}')" = "$prism_worker_uid" || return 1
  if bound_kubectl --request-timeout=30s exec -n "$PRISM_NAMESPACE" \
    "$prism_worker_pod" -c worker -- node -e '
const errors = new Set(["PRISM_NATIVE_RECONCILIATION_REQUIRED", "PRISM_NONCE_DATABASE_UNAVAILABLE",
  "PRISM_WORKER_STOPPING", "PRISM_WORKER_CAPACITY_EXCEEDED"]);
(async () => {
  for (const [endpoint, expected] of [["health", "alive"], ["bootstrap", "initialized"], ["ready", "ready"]]) {
    let httpStatus = null;
    try {
      const response = await fetch(`http://127.0.0.1:8080/${endpoint}`, {
        signal: AbortSignal.timeout(5000), redirect: "error"
      });
      httpStatus = response.status;
      let text = "", size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 4096) throw new Error("response limit");
        text += Buffer.from(chunk).toString("utf8");
      }
      const body = JSON.parse(text);
      const safe = {};
      if (["alive", "initialized", "ready", "not-ready"].includes(body.status)) safe.status = body.status;
      if (errors.has(body.error)) safe.error = body.error;
      const valid = Object.keys(body).every(key => key === "status" || key === "error")
        && safe.status && (body.error === undefined || safe.error);
      console.log(JSON.stringify({endpoint: `/${endpoint}`, httpStatus, body: safe, sanitized: !valid}));
      if (!valid || httpStatus !== 200 || safe.status !== expected || body.error !== undefined) process.exitCode = 1;
    } catch {
      console.log(JSON.stringify({endpoint: `/${endpoint}`, httpStatus, observation: "REQUEST_OR_BODY_FAILED"}));
      process.exitCode = 1;
    }
  }
})().catch(() => { process.exitCode = 1; });
' > "$prism_worker_evidence/probes-$phase.jsonl" \
    2> "$prism_worker_evidence/probes-$phase.stderr.txt"; then
    probe_status=0
  else
    probe_status=$?
  fi
  printf '%s\n' "$probe_status" > "$prism_worker_evidence/probes-$phase.exit-status.txt"
  cat "$prism_worker_evidence/probes-$phase.jsonl"
  return "$probe_status"
}
if ! prism_worker_probes before; then
  printf 'STOP: worker probes failed; collect diagnosis only\n' >&2
fi
```

Expect three observations. A healthy worker returns `/health` HTTP `200` with
`{"status":"alive"}`, `/bootstrap` HTTP `200` with `{"status":"initialized"}`,
and `/ready` HTTP `200` with `{"status":"ready"}`. The saved probe exit status
is `0` only for that combination. A `503` is retained, not discarded by the
command. Nonzero exec status, missing observations, `sanitized: true`, or
`REQUEST_OR_BODY_FAILED` requires a stop. The last value can mean no listener,
timeout, or an unexpected body; it is not proof of a database or ownership cause.
Read the saved stderr and Pod status without dumping its environment or Secrets.

#### 3. Collect bounded worker diagnostics

Use the same Pod and application container. This command reads at most 200 lines
and 256 KiB from the last 15 minutes of the current container log. It retains
exact diagnostic phases, codes, and counters from recognized structured records.
The filter excludes arbitrary messages, connection strings, credentials, and
unrecognized fields. An unknown native failure message becomes `UNRECOGNIZED_CODE`;
do not print the raw message to discover its content.

```bash
assert_cluster_binding
test "$(bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
  -o jsonpath='{.metadata.uid}')" = "$prism_worker_uid"
prism_worker_log_filter() {
  node -e '
const readline = require("node:readline");
const phases = new Set(["admission", "connect", "query", "idle", "cancel"]);
const codes = new Set(["ADMISSION_LIMIT", "REQUEST_CANCELLED", "DEPENDENCY_DEADLINE", "PG_CONNECT_TIMEOUT", "PG_UNKNOWN",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);
const lines = readline.createInterface({input: process.stdin});
lines.on("line", line => {
  const split = line.indexOf(" ");
  const timestamp = line.slice(0, split);
  if (!/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(timestamp)) return;
  let event; try { event = JSON.parse(line.slice(split + 1)); } catch { return; }
  if (!event || typeof event !== "object" || Array.isArray(event)) return;
  if (event.event === "prism_nonce_dependency_failure" && phases.has(event.phase)
      && typeof event.code === "string"
      && (codes.has(event.code) || /^[0-9A-Z]{5}$/.test(event.code))) {
    const safe = {timestamp, event: event.event, phase: event.phase, code: event.code};
    for (const key of ["durationMs", "active", "open", "pending"]) {
      if (Number.isSafeInteger(event[key]) && event[key] >= 0) safe[key] = event[key];
    }
    console.log(JSON.stringify(safe));
  } else if (event.event === "prism_native_worker_failure") {
    const code = /^(PRISM_NATIVE_|PRISM_WORKER_|WORKER_NATIVE_)[A-Z0-9_]+$/.test(event.code) ? event.code : "UNRECOGNIZED_CODE";
    console.log(JSON.stringify({timestamp, event: event.event, code}));
  } else if (event.event === "prism_native_worker_shutdown" && event.state === "ownership_reconciled") {
    console.log(JSON.stringify({timestamp, event: event.event, state: event.state}));
  }
});
'
}
set -o pipefail
if bound_kubectl --request-timeout=30s logs -n "$PRISM_NAMESPACE" "$prism_worker_pod" \
  -c worker --timestamps --since=15m --tail=200 --limit-bytes=262144 \
  2> "$prism_worker_evidence/logs-current.stderr.txt" | prism_worker_log_filter \
  > "$prism_worker_evidence/logs-current.jsonl"; then
  printf '0\n' > "$prism_worker_evidence/logs-current.exit-status.txt"
else
  printf '%s\n' "$?" > "$prism_worker_evidence/logs-current.exit-status.txt"
fi
prism_worker_restarts="$(bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
  -o jsonpath='{.status.containerStatuses[?(@.name=="worker")].restartCount}')"
if test "${prism_worker_restarts:-0}" -gt 0; then
  if bound_kubectl --request-timeout=30s logs -n "$PRISM_NAMESPACE" "$prism_worker_pod" \
    -c worker --previous --timestamps --tail=200 --limit-bytes=262144 \
    2> "$prism_worker_evidence/logs-previous.stderr.txt" | prism_worker_log_filter \
    > "$prism_worker_evidence/logs-previous.jsonl"; then
    printf '0\n' > "$prism_worker_evidence/logs-previous.exit-status.txt"
  else
    printf '%s\n' "$?" > "$prism_worker_evidence/logs-previous.exit-status.txt"
  fi
fi
cat "$prism_worker_evidence/logs-current.jsonl"
bound_kubectl get pod "$prism_worker_pod" -n "$PRISM_NAMESPACE" \
  -o custom-columns='UID:.metadata.uid,RESTARTS:.status.containerStatuses[?(@.name=="worker")].restartCount' \
  > "$prism_worker_evidence/pod-after.txt"
```

A log command failure or an empty filtered file does not prove health. The
failure can precede the time window, fall outside the retained lines, or have
an unrecognized message. `--previous` reads only the prior container instance,
not all restart history. Retain the collection bounds and missing-evidence
condition. Do not restart or delete a Pod to manufacture another log window.
Compare `pod-before.txt` with `pod-after.txt`. A changed UID or restart count
means the observations cross different processes. Retain that fact and repeat
selection before using the results as one worker-health observation.

#### 4. Distinguish the boundary and stop at the repair owner

| Observation | Meaning and safe action |
| --- | --- |
| `/health` succeeds; `/bootstrap` and `/ready` return `503` with `PRISM_NATIVE_RECONCILIATION_REQUIRED` | HTTP is alive, but native admission is closed. Do not infer a particular damaged file from this shared error. Stop for Prism maintainers and the native-host owner. |
| No HTTP listener; `prism_native_worker_failure` contains a native code | Startup admission or ownership/journal recovery can have failed before HTTP starts. `WORKER_NATIVE_UNKNOWN_SCOPE`, `WORKER_NATIVE_OWNED_SCOPE_MISSING`, and `WORKER_NATIVE_SUPERVISOR_UNRESOLVED` identify different native failure classes. Retain the exact safe code; do not delete a scope or receipt. |
| Any route returns `503` with `PRISM_WORKER_STOPPING` or `PRISM_WORKER_CAPACITY_EXCEEDED` | The HTTP lifecycle rejected admission before the route handler. `STOPPING` covers shutdown or an unsafe unresolved result; `CAPACITY_EXCEEDED` covers the active-request limit. These are different from native-reconciliation or nonce-table errors. Stop for Prism maintainers; do not force a restart or bypass the limit. |
| `/bootstrap` succeeds; HMAC-mode `/ready` returns `503` with `PRISM_NONCE_DATABASE_UNAVAILABLE` | Native initialization passed; nonce-database access did not. Use the nonce event's phase/code below. Stop for the Prism database and credential owners. |
| `/ready` succeeds in SPIFFE mode | This route skips the nonce-database check. It does not prove the proxy, trusted Control identity, or an authenticated attempt. Follow [Worker Trust](worker-trust.md#canonical-worker-trust-procedure) for that separate boundary. |
| All three routes succeed | Only these three health boundaries passed. Preserve any prior failed or uncertain attempt; health does not reconcile its result. |

For `prism_nonce_dependency_failure`, read the retained counters as event-time
snapshots of this worker's private nonce database dependency:

| Field | Meaning and limit |
| --- | --- |
| `durationMs` | Nonnegative, rounded elapsed milliseconds since this dependency operation began. For `idle`, the timer starts when the idle error is handled; this is not the connection's age. |
| `active` | Admitted nonce dependency operations when the event is created. A failing admitted operation is still counted until its final decrement. The admission limit is four; an admission rejection does not increment this count. |
| `open` | The database pool's `totalCount`: all its clients, including idle and checked-out clients. It is not a count of native scopes or Prism jobs. |
| `pending` | The pool's `waitingCount`: requests waiting to acquire a database client. It is not a count of design jobs or native attempts. |

An isolated nonzero counter does not prove a leak, a request still running now,
or current health. Compare the event's phase and timestamp, the bounded log
window, and repeated endpoint results. An absent counter is missing evidence,
not zero. The [diagnostic fields](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L12-L19),
[snapshot producer and idle timer](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L41-L55), and
[admission and operation lifetime](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L59-L95)
define these values.

Interpret the phase before the code.
The five-character SQL meanings below come from PostgreSQL's
[error-code reference](https://www.postgresql.org/docs/17/errcodes-appendix.html).

| Phase/code | Distinguishing observation and owner action |
| --- | --- |
| `admission` / `ADMISSION_LIMIT` | Four dependency operations are already active. This is local dependency capacity rejection, not proof of missing credentials or migration. Keep work stopped; Prism maintainers must investigate load and unsettled requests. |
| `connect` / `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `PG_CONNECT_TIMEOUT`, or another retained network code | The database connection could not be acquired. The network/database owner checks the selected destination and service path without printing `DATABASE_URL`. A connection code alone does not prove a bad password. |
| `connect` / a five-character PostgreSQL code | PostgreSQL rejected connection setup. For example, `28P01` identifies password authentication failure. The database/credential owner must reconcile the existing runtime identity; do not rotate a Secret during this diagnosis. |
| `query` / a five-character PostgreSQL code | Connection acquisition passed, but SQL failed. `42P01` identifies an absent table; `42501` identifies insufficient permission; `57014` identifies cancelled SQL. Retain migration/role evidence with the exact code. The database owner distinguishes a migration, grant, or deadline failure. |
| `cancel` / `REQUEST_CANCELLED` or `DEPENDENCY_DEADLINE` | The request was aborted or its dependency deadline elapsed. Correlate time with `connect`/`query` events; cancellation alone does not prove missing schema or credentials. |
| `idle` / retained code | An idle pool connection failed. Compare the fresh `/ready` result; this old event alone does not prove that the new check failed. |
| Any phase / `PG_UNKNOWN`, or missing diagnostics | The safe observation cannot identify the underlying cause. Preserve that uncertainty and stop for the owner. Do not infer success or expose a connection string to obtain more detail. |

Native repair is not an executable operator surface on this page. The native-host
owner and Prism maintainers must reconcile the selected node/pool policy,
engine digest, cgroup v2 pool, ownership records, and attempt journal through an
owned recovery procedure. The blocked step is deciding the outcome of retained
processes and attempts and changing their state safely. Do not edit the policy,
ownership store, journal, or cgroup tree, start a second supervisor, move the
worker to another node, or bypass `/bootstrap`. Startup recovery in product code
does not supply a manual repair command. This boundary can be removed only when
an authenticated, bounded recovery procedure proves original identity/result
reconciliation and resource cleanup after the relevant native failure.

Nonce-database repair also stops at owner action. The current evidence is the
worker's actual read of `prism.worker_request_nonce`, not Control's `SELECT 1`
or `pg_isready`. Use [Deployment failed during migration](#deployment-failed-during-migration)
to preserve captured migration results, and [Credential Rotation](maintenance.md#credential-rotation)
for its separate authority. Neither link authorizes SQL/grant changes or supplies
a generic repair for this worker failure. The blocked step is safely restoring
the selected runtime identity's access to the migrated nonce table without
losing replay records. The database/credential owners must provide and validate
that exact repair, then prove `/ready` succeeds and replay remains rejected.
Do not erase nonce rows, change credentials, disable authentication, or switch
trust mode to clear the error.

#### 5. Repeat checks, retain evidence, and finish inspection

After the owner completes a separately authorized repair, repeat the same three
checks with `prism_worker_probes after`. The Pod UID check must still pass. If the
repair replaced the Pod, preserve the first evidence directory and repeat this
procedure from selection with a new directory and the new receipt. Never silently
retarget the existing function. Repeat the log collection and preserve its first
files before using the same output names. Stop on any remaining mismatch or failure.

Require all three expected `200` bodies and exit status `0`. Then repeat the
[selected status and smoke checks](#4-verify-status-and-smoke-behavior). These
results still do not prove an authenticated worker attempt. Resume evaluation
or publication only after the original uncertain attempt is reconciled and an
authorized functional check succeeds for its exact input. This diagnosis adds
no native attempt or live-success command.

Retain the source/release/configuration identities, cluster binding, mode, Pod
UID/node/image, restart observations, commands/time/bounds, all endpoint statuses
and sanitized bodies, exit statuses, safe diagnostic records, repair-owner
decision, and repeat results. No temporary cluster resource or port-forward was
created. The probe process submits only its three bounded requests and then
exits. An exec transport failure does not prove remote process completion;
retain that uncertainty for the platform owner before claiming inspection cleanup.
After copying the evidence to approved retained storage and verifying
the copy, remove only this procedure's printed temporary directory. For example,
`rm -r -- "$prism_worker_evidence"` is permitted only after that ownership and
retention check; it is not a workload or durable-state cleanup action.

> **Source evidence — executable worker inspection and repair boundary**
>
> **Claim:** Selected-Pod loopback health distinguishes process, native admission,
> and HMAC nonce dependency. Logs expose safe nonce phases/codes and event-time
> operation/pool counters; native startup can fail before HTTP admission. None
> of these surfaces repairs retained state or counts native/design jobs.
>
> **Implementation:** [`serveReadiness`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-service.ts#L72-L86) ·
> [`serveLocalHealth`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-service.ts#L95-L105) ·
> [HTTP lifecycle stopping response](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-lifecycle.ts#L14-L17) ·
> [HTTP lifecycle admission rejection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-lifecycle.ts#L43-L58) ·
> [`WorkerNonceDatabase` diagnostic fields and safe codes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L12-L29) ·
> [nonce pool capacity and diagnostic counters](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L41-L56) ·
> [connection, SQL, and cancellation reporting](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker-readiness.ts#L59-L95) ·
> [`runNativePrismWorker` startup and mode selection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker.ts#L11-L26) ·
> [native startup/failure events](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/worker.ts#L53-L60) ·
> [`nativePrismExecution` journal recovery](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/native-worker-execution.ts#L10-L26) ·
> [supervisor recovery and unresolved outcome](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/worker/core/worker/native-worker-ownership.ts#L179-L199) ·
> [native ownership recovery and its stop codes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/worker/core/worker/native-worker-ownership.ts#L244-L281).
>
> **Contract or setting:** The chart binds [one worker and policy](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L5-L9),
> [Pod label and policy annotation](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L24-L36),
> [node and container](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L55-L76),
> [port `8080`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L81-L88),
> [SPIFFE-mode flag](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L127-L138), and
> [native mounts and health probes](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L143-L162).
> The worker Service [selects that Pod's port `8080`](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/services.yaml#L20-L23).
> This inspection uses the Pod's own loopback; it does not prove the Service path.
> The worker image [selects the pinned Node.js 24 base](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/docker/Dockerfile.prism-worker#L1-L4).
>
> **Test evidence:** The [local connection-refusal fixture](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/worker-readiness.test.mts#L8-L21)
> checks the safe `connect`/`ECONNREFUSED` diagnostic; its [real-PostgreSQL fixture](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/tests/worker-readiness.test.mts#L22-L41)
> requires an isolated migrated database. No executed result for these fixtures
> or installed-cluster inspection is claimed in this procedure.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`.
>
> **Limit:** These commands have no live selected-cluster result here. They do not
> prove authenticated execution, native repair, database repair, Service reachability,
> SPIFFE permission, or a completed Studio journey.

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
> [The artifact store verifies regular files and content digests on every read](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/artifacts.ts#L20-L29).
>
> [Artifact publication uses a private pending file, file sync, non-replacing link, and directory sync](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/storage/artifacts.ts#L39-L67).

## Diagnosis Map

| Symptom | Most likely boundary | First evidence | Safe next action |
| --- | --- | --- | --- |
| Local spike verifier reports that the Chromium executable does not exist at the fixed `1228` path | Fixed `executablePath` in the mobile-editor and preview-isolation configs | Exact error path, config, locked Playwright version, installation output | Follow [the local browser stop](#stop-at-the-fixed-spike-browser-path). Stop the spike and aggregate gates; package-local reinstallation does not supply that path. |
| Studio shows no projects | Nova dispatch or Control admission | Nova stage result; Control request log; `prism.project` and active `design_request` | Reconcile the original dispatch. Do not create a replacement project. |
| Project exists but has no directions | Agent trust, durable job, or external outcome | Selected Control/agent SPIFFE mode and exact identity; `Prism agent jobs require SPIFFE trust` or `Prism agent tools require SPIFFE worker trust`; original job state/fence/result and sanitized bridge log | Follow [Agent work blocked by trust](#agent-work-blocked-by-trust) on a trust rejection. Stop for release/trust owners and Prism maintainers; healthy HMAC probes cannot enable agent work. Preserve original identities and never replay an uncertain launch. |
| Studio says invalid session | Tailscale identity exchange or cookie forwarding | Studio proxy log; two `Set-Cookie` headers | Fix ingress/proxy handling. Do not weaken CSRF or session checks. |
| New round remains pending | Agent trust, retained request, current round, or blocked agent session | Selected SPIFFE mode/identity and exact trust rejection; stored request/key, generation ID and durable job state | Stop on a [trust rejection](#agent-work-blocked-by-trust). Otherwise retry only the retained request when Studio offers it; stop on missing storage or unresolved predecessor. |
| Visual edit reports revision conflict | Another edit committed, or the original edit committed before its reply disappeared | Original operation/base/actor/time, current document, and revision history | Stop and reconcile the original outcome through [Revision conflict](#revision-conflict) and [Typed edit or restore interrupted](#typed-edit-or-restore-interrupted). Author a new operation only after that uncertainty is resolved. |
| Natural-language change remains pending or reload hides controls | Agent trust, stored request, agent job, or Studio failure screen | Selected SPIFFE mode/identity and exact trust rejection; original key/instruction/base and `/v1/agent-jobs/{id}` receipt | Follow [Agent work blocked by trust](#agent-work-blocked-by-trust) on a trust rejection; retain the original request. Stop for Prism maintainer reconciliation. The helper contract does not provide recovery controls on the failure screen. |
| Restore or Undo reply disappears | Non-idempotent restore and history | Source revision ID, actor/time, current revision and stored operation | Do not repeat. Reconcile history through the original document and stop on ambiguity. |
| Direction or preference action has an uncertain result | Client key lifetime and preference receipt | Original actor/action/key/event, current direction and durable preference evidence | Stop mutations. Reconcile the exact receipt; a new identity can create another event. |
| Evaluation reply disappears | Pinned revision and native attempt | Embedded document identity, revision, worker key/receipt and readiness | Recheck unchanged input only after ownership is known; stop on conflicting input or uncertain worker state. |
| Preview asset fails | Artifact reference, size, media type, or digest | Browser error and Control artifact read | Verify the bound artifact. Do not replace bytes behind an ID. |
| Evaluation is blocked | Design Document quality | Exact finding ID, gate, target, and message | Correct the current document and evaluate again. |
| Approval fails or its reply disappears | Approval insert, uniqueness, revision, digest, or architecture | Original request, current digest, approval constraint/error and canonical receipt | Stop. Reconcile the original approval before any repeat; use the interruption procedure. |
| Publication fails or its reply disappears | Original approval, worker capture, artifact write, or baseline commit | Original approval ID, worker receipt, full log artifact, target ID and baseline record | Stop. Reconcile approval/publication separately; another Approve click cannot replay the original baseline request. |
| Nova rejects resume | Original run/wait state, signal validation, or Prism handoff identity | Audit of the original run/wait and the exact rejection code; unchanged original signal | Stop submissions and follow [Nova resume response lost](#nova-resume-response-lost). Distinguish malformed or mismatched input for a verified active wait from expired/resolved waits and terminal runs before any permitted submission under [run control](operate.md#canonical-run-control-procedure). Never replace identities to force acceptance. Issuer matching does not authenticate its caller. |
| Nova rejects archive | Stored bytes or archive member contract | Exact `PRISM_ARCHIVE_*` error | Preserve evidence and diagnose. Do not bypass verification. |
| Worker returns 503 on `/bootstrap` or `/ready` | Native admission; HMAC-mode `/ready` can also fail on nonce-table access | Selected Pod/mode, all three HTTP statuses and sanitized JSON bodies, exact diagnostic phase/code | Follow [Worker not ready](#worker-not-ready) to collect bounded observations. Keep admission closed and stop for the named repair owner; a successful Pod probe does not prove nonce access. |

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
| Compatible Chromium binaries | Studio uses Playwright. The two browser spikes also require the fixed managed path described below; package-local installation does not satisfy it. |

Run local preparation and checks from `<repository-root>` in the disposable
checkout. They install dependencies and can create build and test output there;
they do not deploy Prism. The checkout owner must authorize replacement of its
dependency trees.

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

### Prepare package-local browsers

After the bootstrap, install Chromium through each package's local Playwright
version if the machine does not already have the matching cached browser:

```bash
(cd skills/prism && npx --no-install playwright install chromium)
(cd spikes/prism/mobile-editor && npx --no-install playwright install chromium)
(cd spikes/prism/preview-isolation && npx --no-install playwright install chromium)
```

Each successful command installs the browser selected by that package's locked
Playwright version. A browser build number identifies the browser artifact; it
is different from the Playwright package version.

| Consumer | Declared and locked Playwright version | Chromium and headless-shell build | Browser selection |
| --- | --- | --- | --- |
| `skills/prism` and root workspace | `1.62.1` | `1234` | Studio uses the managed path if it exists; otherwise Playwright selects its package-local browser. |
| `spikes/prism/mobile-editor` | `1.55.0` | `1187` | The config always selects the fixed build `1228` path below. |
| `spikes/prism/preview-isolation` | `1.55.0` | `1187` | The config always selects the same fixed build `1228` path. |

The spike commands execute their own local `1.55.0` CLI after locked installation.
They do not execute the root `1.62.1` CLI. Neither version installs build `1228`.
A zero installation exit status therefore proves browser preparation for
consumers that use package-local selection, but cannot enable the two spikes.

Playwright can still report missing system libraries after it downloads a
browser. Install those libraries with the package method approved for the host.
That is a separate prerequisite from the fixed-path failure below. A missing
browser or system library is a failed prerequisite.

### Stop at the fixed spike browser path

The two spike configs unconditionally require this absolute executable path:

```text
/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell
```

Neither spike config has an environment override or a package-local cache
fallback. Changing `PLAYWRIGHT_BROWSERS_PATH` does not replace the configured
`executablePath`. If the fixed executable is absent, Playwright fails before
browser launch and reports that the executable does not exist at that path.
It does not reach the browser assertions. Installing build `1187` or `1234`
again cannot repair this failure.

Before either spike verifier or an aggregate gate, check the fixed path from
the repository root:

```bash
prism_spike_browser='/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'
if ! test -x "$prism_spike_browser"; then
  printf 'STOP: required Prism spike browser is absent or not executable: %s\n' "$prism_spike_browser" >&2
  exit 1
fi
```

On a host with only the package-local installations above, expect `STOP` and
exit status `1`. Retain the source commit, package/lock versions, browser
installation output, exact missing path, command, and exit status. Stop the
spike and aggregate verification path. Do not create a symlink to a different
build, copy another binary into that path, edit the config locally, skip the
browser tests, or report the gate as passed. An executable at the path alone
also does not prove its compatible version, provenance, or system dependencies.

This is a current local product limitation,
[fixed browser-path limitation](../status/open-issues.md#prism-spike-tests-require-an-unavailable-fixed-browser-path).
The Prism maintainers who own the spike configs must supply a supported repair.
This procedure supplies no validated immutable managed installation for build
`1228`. Keep the complete local gate unavailable until those maintainers either
remove the fixed requirement in favor of compatible package-local selection or
provide and validate an immutable managed browser installation and its host
prerequisites. These local failures are separate from live cluster acceptance.

`verify:prism:spikes` runs puck-adapter, mobile-editor, preview-isolation, and
postgres-retrieval in order with `&&`. A failure at mobile-editor stops that
command before preview-isolation and postgres-retrieval. `verify:prism` starts
with the spike command; its contract, domain, renderer, storage, Studio, engine,
corpus, quality, pipeline, Helm, and repository-flow checks do not run after
that failure. `verify:prism:repository` starts with `verify:prism`, so its runtime
role, image, deploy-script, Nova-stage, and remaining repository checks also do not run.
Run an available focused check directly to obtain its own result.

To remove this limitation, the maintainers must publish the supported browser
preparation and repeat it in a clean disposable checkout with unchanged
lockfiles. Both spike verifiers must launch the selected browser and pass all
tests. Then run both complete gates from that checkout's repository root:

```bash
npm run verify --prefix spikes/prism/mobile-editor
npm run verify --prefix spikes/prism/preview-isolation
npm run verify:prism
npm run verify:prism:repository
```

Require exit status `0` from each command and successful execution of every
required stage. Retain the source revision, host and library versions, exact
Playwright versions, browser build/path/provenance, lockfile digests, full
outputs, and exit statuses. A documentation correction alone does not meet
these product closure conditions. Remove only temporary downloads, dependency
trees, and test output owned by this disposable exercise; preserve its evidence.

> **Source evidence — local browser selection and aggregate failure**
>
> **Claim:** Package-local Chromium installation does not satisfy the two spike configs' fixed executable path.
>
> **Implementation:** The [mobile config selects the absolute path without a fallback](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/mobile-editor/playwright.config.mjs#L4-L9), as does the [preview config](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/preview-isolation/playwright.config.mjs#L4-L10). Studio instead [checks whether the managed path exists before selecting it](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/studio/playwright.config.mjs#L1-L7).
>
> **Contract or setting:** The [mobile declaration](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/mobile-editor/package.json#L18-L22) and [lock entry](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/mobile-editor/package-lock.json#L884-L895), and the [preview declaration](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/preview-isolation/package.json#L9-L11) and [lock entry](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/preview-isolation/package-lock.json#L12-L23), pin `1.55.0`. The [Prism declaration](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/package.json#L35-L48) and [root lock entry](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/package-lock.json#L2358-L2369) pin `1.62.1`. The [spike and local gates](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/package.json#L28-L41) and [repository gate](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/package.json#L277-L279) stop at the first failed command.
>
> **Test evidence:** The [mobile verifier](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/mobile-editor/package.json#L5-L9) runs typecheck before browser tests; the [preview verifier](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/spikes/prism/preview-isolation/package.json#L5-L7) runs browser tests directly. The configurations and package scripts define the required path and command order. On 2026-10-10, Node.js `v24.21.0` and npm `11.19.0` ran both direct spike verifiers in an isolated copy of this revision after offline locked dependency installation. The mobile typecheck passed, then all 12 mobile and all 3 preview browser tests failed before launch at the missing fixed path; both verifiers exited `1`. The installed spike CLIs and browser registries reported `1.55.0` and build `1187`; the root CLI and registry reported `1.62.1` and build `1234`. This check did not download browsers or rerun either aggregate. No successful spike or aggregate execution is established here.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
>
> **Limit:** Package installation, a downloaded browser, and an executable-path check do not prove browser compatibility, passing assertions, complete local gates, or any live journey.

### Select an available focused check

Use the smallest check that proves your change. Keep its result separate from
the unavailable complete gates. The table identifies the maintained commands;
it does not report a successful execution of each command.

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
| Complete local Prism package | `npm run verify:prism`; unavailable while the fixed spike browser prerequisite is unresolved |
| Deployment, images, runtime role, Nova stage, and docs | `npm run verify:prism:repository`; stops at the same local prerequisite |
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
> [The bootstrap installs deterministic dependencies for the root and four spike packages](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/scripts/bootstrap-prism-tests.sh#L1-L8).
>
> The [local Prism command definitions](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/package.json#L25-L41) and [repository and live gates](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/package.json#L265-L292) define the invocations above.
> Against `082db288f7bc5e686e47306d60cf4db7d8ba8cfc`, with linked implementation bytes unchanged at the evidence revision, Node.js `v24.21.0` ran `node --test skills/prism/tests/control-server-config.test.mts` on 2026-10-09: three tests passed, exit zero. The command `npm run verify:prism:deploy-script` also passed, exit zero. It checked workflow YAML, the deploy-command contract, and Bash syntax. The runtime materialization check stopped at the absent `releases/runtime-images.json`. The other full gate commands in the table have no result for this page. Separate interruption fixtures above report their narrower local results. No successful deployment or Studio-to-Nova journey is established by these results.

## Implemented, Environment-Dependent, and Not an Operator Surface

| Capability | Current status | What you can claim |
| --- | --- | --- |
| Project, request, round, direction, document, revision, approval, and baseline persistence | Implemented and covered by source-level tests | The contracts and database behavior work in the tested environment. |
| Complete local spike and aggregate verification | Unavailable with package-local browser preparation alone; two spike configs require the fixed managed build `1228` path | Keep the gate stopped until the supported preparation and both spike and aggregate reruns pass. |
| Studio chooser, visual editing, preview, evaluation, approval, and publication request | Implemented; interruption recovery varies by action | Claim only the source/fixture/browser behavior actually checked. Error screens and lost identities can block recovery. |
| Natural-language client-helper reconciliation | Implemented and checked in isolated HTTP/database fixtures; current error/reload UI blocks its control | Helper replay does not prove browser recovery or a live provider result. |
| Durable native worker operation and restart journal | Implemented; native proof needs a prepared Linux host and isolated database | Claim native operation only with retained native gate evidence. |
| PostgreSQL migration and pgvector retrieval | Implemented; native PostgreSQL proof needs configured test databases | Claim actual PostgreSQL behavior only when the native suite ran. |
| Tailscale Studio ingress and SPIFFE service trust | Charted and checked structurally; live proof is environment-specific | Claim live identity only after cluster tests. |
| Prism agent through OpenClaw and LiteLLM | Implemented path requires SPIFFE-enabled Control and the exact trusted agent identity; actual permission/provider proof is live | Stop before submission until [agent admission](#spiffe-agent-admission) is proved. Do not infer permission or provider success from healthy HMAC probes or deterministic worker tests. |
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

> [The handoff helpers create a visual-plan fragment and read-only assignment declarations](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/pipeline-adapter/index.ts#L1-L57).

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
- Control and the agent use the matched SPIFFE trust configuration, and the
  exact trusted agent identity has separate claim/commit permission evidence;
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

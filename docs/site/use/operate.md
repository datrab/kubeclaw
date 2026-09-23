# Configure and Operate

Status: source-backed command paths with explicit unauthenticated issuer and missing cancellation boundaries
Audience: product operator, pipeline operator, Prism operator
Owner: Nova Core and platform operations
Evidence: skills/nova/project/cli.ts; skills/nova/core/cli.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/engine-snapshots.ts; skills/nova/core/execution/engine-run.ts
Applies to: pipeline-platform.v2 and current Prism deployment
Last verified: 2026-09-21; schema validation passed and no live cluster result is available

## Objective

Configure one governed runtime, start work, inspect durable results, and continue supported waits.
This page also identifies controls that the current CLI does not provide.

## Canonical Start, Readiness, and Observation Procedure
<!-- operator-task: start-readiness-observe -->

This section is the sole authority for `start-readiness-observe`. Start with an
installed source-bound release, explicit `<context>` and `<namespace>`, selected
component list, independent administration, and no active change. Run cluster
commands from the administration machine. Kubernetes owns process and Service
state; `scripts/deploy.sh` and the health program embedded by the chart own
component checks; a completed application transaction owns functional proof.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole task. Every raw `kubectl`, Helm, or `scripts/deploy.sh`
command below must inherit its exported read-only `KUBECONFIG`; every shown
`<context>` must equal `EXPECTED_CONTEXT`. Run `assert_cluster_binding`
immediately before each command block. Stop on any mismatch and follow the
binding section's recovery; never fall back to the default kubeconfig.

Record source and release identities, context, namespace, time, and evidence
directory. Stop if the current context, selected images, or ownership differs
from the install record.

Observe the four levels in order:

1. **Process:**

   ```bash
   assert_cluster_binding
   kubectl --context "<context>" -n "<namespace>" rollout status deployment/agent-nova --timeout=300s
   kubectl --context "<context>" -n "<namespace>" rollout status deployment/agent-buster --timeout=300s
   kubectl --context "<context>" -n "<namespace>" get pods -o wide
   ```

   Expected observation: each selected Deployment completes rollout and every
   selected Pod is running without restart growth. Omit a role only when the
   install record says it is disabled.

2. **Service:**

   ```bash
   assert_cluster_binding
   kubectl --context "<context>" -n "<namespace>" get service agent-nova agent-buster
   kubectl --context "<context>" -n "<namespace>" get endpointslice \
     -l kubernetes.io/service-name=agent-nova
   kubectl --context "<context>" -n "<namespace>" get endpointslice \
     -l kubernetes.io/service-name=agent-buster
   ```

   Expected observation: each selected Service exists and has at least one
   ready endpoint. A Service without an endpoint is not ready.

3. **Dependency:**

   ```bash
   assert_cluster_binding
   export NAMESPACE="<namespace>"
   ./scripts/deploy.sh smoke-agent nova
   ./scripts/deploy.sh smoke-agent buster
   ```

   Expected observation: each command exits zero after rollout, Pod readiness,
   gateway, startup record, Redis-aware readiness, code bundle, skills, and
   runtime configuration checks. These checks do not prove a user transaction.

4. **Functional:** execute the registered non-production
   [deployment success exercise](workflows/buster-suite.md#deployment-success-exercise)
   with its exact project, provider, receipt, and cleanup checks. Expected
   observation: the project returns terminal `succeeded`, the audit agrees, and
   all external effects have terminal receipts. This is technical proof; use
   [Deliver a Demo](demo-delivery.md#canonical-demo-delivery-procedure) for a
   separate human decision.

At any failure, stop at the first failed level. Use
[symptom diagnosis](diagnose.md#canonical-symptom-diagnosis-procedure); do not
restart all roles to hide a dependency or functional failure. Recovery is the
narrow owning-layer repair followed by all four levels again. Cleanup belongs
to the functional exercise. Retain every command, output, exit status, selected
image ID, events, audit, receipts, cleanup result, and blocked step.

## Canonical Run Control Procedure
<!-- operator-task: run-control -->

This page is the sole authority for `run-control`. The supported start state is
a `pipeline-platform.v2` and project or explicit graph at the original source
and package snapshot, with writable durable storage and a reconciled prior
effect state. Run from `<repository-root>` on the administration machine. Nova's
CLI and durable journal are authoritative; process state and plugin logs are
diagnostic only.

Complete [Validate Before Starting](#validate-before-starting),
[Start a Project Run](#start-a-project-run), [Inspect a Run](#inspect-a-run),
[Approve or Resume a Wait](#approve-or-resume-a-wait), and, after interruption,
[Recover After Interruption](#recover-after-interruption). The
[Cancellation Boundary](#cancellation-boundary) is mandatory. Stop on an
unknown run, changed graph/package digest, unresolved effect, stale or expired
wait, issuer mismatch, or terminal run. Retain input digests, output, audit,
wait and signal bytes, effects and receipts, failure, retry decision, and final
state. Remove restricted temporary signal files after retaining their digest
and decision record.

## Before Each Operation

Run from `<repository-root>` unless a command states another location.
Set no implicit Kubernetes context.

Record these inputs:

- Full source commit.
- Platform configuration path and digest.
- Project or pipeline path and digest.
- Selected role and plugin package revisions.
- Operator identity for an approval or administrative decision.
- Durable storage root and its free capacity.

Do not start work while the project repository contains uncommitted changes.
The project command rejects a changed baseline or dirty worktree.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
This procedure applies to `pipeline-platform.v2` and the pipeline command at the recorded source revision.
Start a new governed run when a platform, project, graph, package, or state format is not compatible with that revision.

## Understand the Two Command Forms

KubeClaw accepts a project document or an explicit pipeline graph.

| Form | Use | Identity source |
| --- | --- | --- |
| `--project` | Normal project operation | Compiler derives the run and graph identity |
| `--pipeline` | Direct operation of an explicit graph | Operator supplies or accepts the run identity |

Both forms require `--platform`.
Do not mix their recovery syntax.

The command does not implement `--help`.
The runnable forms in this page are the interface reference.

> **Source evidence — command surface**
>
> **Claim:** The dispatcher selects the project form only when `--project` is present. Otherwise, it uses the explicit-graph Core CLI. The two forms support the commands shown on this page.
>
> **Implementation:** [The project dispatcher validates arguments and selects compile, start, recover, or signal](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/cli.ts#L19-L56). [The Core CLI supports start, recover, signal, and audit for explicit graphs](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/cli.ts#L16-L74).
>
> **Contract or setting:** [The npm `pipeline` script selects the dispatcher](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/package.json#L42-L42).
>
> **Test evidence:** [The project compiler test starts the real dispatcher and checks its compiled output](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-project-compiler.mts#L171-L185). The test passed on 2026-09-16.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Neither CLI defines a `--help` option or a separate cancel command.

## Configure the Platform

The operator owns the platform configuration.
Project content cannot add trusted packages, providers, adapters, or grants.

The configuration must declare these groups:

| Group | Operator decision | Verification question |
| --- | --- | --- |
| `installationRoots` | Package locations that the registry may discover | Do all paths exist at the selected revision? |
| `trustedBuiltinRoots` | Package roots allowed as built-ins | Does each path belong to the reviewed release? |
| `externalTrust` | Allowed external source digests and attestations | Does each external package match its approved digest? |
| `providers` | One selected provider for each capability | Does the provider registration exist and activate? |
| `grants` | Resource limits for each registration and capability | Does each grant allow only the intended resource? |
| `adapters` | Adapter configuration | Do referenced endpoints and stores exist? |
| `activeAdapters` | Adapters that start in this runtime | Does every required capability have one active provider? |
| `observers` | Observer configuration | Is required delivery reachable and bounded? |
| `storageRoot` | Durable run storage | Is it persistent, writable, private, and monitored? |
| issuer fields | Nova and administrative identities | Do resume signals use an authorized exact identity? |

Relative package and storage paths resolve from the platform file directory.
This prevents the shell working directory from changing their meaning.

> **Source evidence — platform authority**
>
> **Claim:** The operator-owned platform document selects trusted package roots, providers, grants, adapters, observers, durable storage, and decision issuers. Relative paths use the platform file directory.
>
> **Implementation:** The platform schema declares [its required fields, schema version, and installation roots](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L5-L33).
> It also declares [trust, providers, and grants](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L34-L68).
> It defines [adapter, observer, and storage authority](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L69-L95).
> [The loader validates the document and resolves paths from its directory](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69).
>
> **Contract or setting:** [`pipeline-platform.v2` is the required schema version](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L20-L21).
>
> **Test evidence:** [The platform test checks path resolution, immutability, validation, and rejection of project-controlled installation roots](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L55). The test passed on 2026-09-16.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Schema validation does not prove that a configured provider, adapter, observer, or storage service is reachable.

Keep credentials outside the JSON file.
Use adapter-supported secret references or the intended secret resolver.

## Validate Before Starting

Compile the project without running stages:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --compile "<new-pipeline.json>"
```

The output path must not exist.
The compiler refuses to overwrite it.

Expected output contains:

- `status` equal to `compiled`.
- One derived `runId`.
- `stageCount`.
- `definitionDigest`.
- `completionScope`.

Compilation validates runtime registrations and grants.
It does not call an external provider or prove deployment reachability.

Review the compiled graph for stage types, dependencies, limits, and selected repair paths.
Retain its digest with the run record.

## Start a Project Run

Starting condition:

- Project repository HEAD equals `baseRevision`.
- Project repository has no uncommitted file.
- Platform storage has enough monitored capacity.
- Required providers and adapters are reachable.
- No existing process owns the same intended run.

Start the run:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>"
```

Expected output is one JSON object.
It includes `runId`, `status`, `completionScope`, `acceptanceReadiness`, and stage states.

Exit code zero means the returned run status is `succeeded`.
It does not mean human acceptance or complete live acceptance.

For an explicit graph, use:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --pipeline "<pipeline.json>" \
  --run-id "<new-run-id>"
```

Use a new run identity.
Do not reuse a prior terminal run identity.

## Inspect a Run

Use the Core audit command for either command form:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --audit "<run-id>"
```

The command rebuilds its audit view from durable run state.
Retain the unmodified JSON output.

Then inspect the storage root without editing it:

```bash
find "<storage-root>/runs" -maxdepth 2 -type f -print
```

Version 2 run directories use a hash of the run ID.
Use the audit command to select the run safely.

Use [Request, State, and Recovery](../understand/request-state-recovery.md) to interpret states.
Do not infer a terminal state from one plugin log.

## Approve or Resume a Wait

The CLI uses a typed resume-signal file.
It does not provide a separate `approve` verb.

Before creating a signal, read the active wait from durable evidence.
Copy no identity from an earlier wait.

Read `waitId`, `signalType`,
`authorizedIssuer`, `expiresAt`, and the payload requirements from the active
`wait-request.v2` record. The signal must contain all eight fields in this
example:

```json
{
  "schemaVersion": "resume-signal.v2",
  "signalId": "signal:approval-2026-09-17T120000Z",
  "idempotencyKey": "approval:wait-7:decision-1",
  "waitId": "wait:7",
  "signalType": "approval.resolved",
  "issuer": {
    "type": "operator",
    "id": "operator:release"
  },
  "issuedAt": "2026-09-17T12:00:00.000Z",
  "payload": {
    "decision": "approved",
    "issuer": {
      "type": "operator",
      "id": "operator:release"
    },
    "reason": "Approved the exact source and report in wait:7."
  }
}
```

This example is valid for the shared envelope schema. Its payload is the
approval payload used by the approval path. Another wait type can require a
different payload. Never copy this payload without checking the active wait.

The `issuer` object is **unsigned and self-asserted by the caller**. Nova checks
that its type and ID equal the active wait's `authorizedIssuer`, but the signal
schema contains no signature and the CLI does not authenticate the human or an
external identity provider. Protect access to signal creation and the CLI as
the effective authority. Do not describe issuer matching as identity proof.

Apply these matching rules:

- Create a new `signalId` for one decision event. Nova uses it as the cause of
  the `wait.resolved` event.
- Create one `idempotencyKey` for the exact signal content. Reuse that key only
  to retry the same bytes. Signal storage treats an identical stored record as
  a no-op and rejects the same key with different content. A retry after wait
  resolution is stale and stops before this storage check.
- Copy `waitId` and `signalType` from the active wait.
- Copy the authorized issuer type and ID. This satisfies runtime matching only;
  it does not authenticate who created the file.
- Set `issuedAt` to a valid date-time at or after creation of the active wait.
- Build `payload` from that wait's request and plugin contract. Include the
  current source, decision, or repair digest when that contract requires it.

Nova validates the closed envelope schema before it changes state. It rejects
unknown fields, a stale or unknown wait, an expired wait, a mismatched type or
issuer, and a signal issued before wait creation. After Nova records one signal
for a wait, a different signal cannot resolve that wait again.

Use an operator-controlled file with restricted permissions.
Then resume a project run:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --signal "<resume-signal.json>"
```

For an explicit graph, add its run identity:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --pipeline "<pipeline.json>" \
  --run-id "<run-id>" \
  --signal "<resume-signal.json>"
```

Expected observation: the journal records one matching resolution.
The resumed stage receives a new attempt identity when execution continues.

Stop after an issuer mismatch, expired wait, digest mismatch, or stale signal.
Do not edit the journal or change the signal identity to force acceptance.

> **Source evidence — signal contract and replay rules**
>
> **Claim:** A resume signal uses a closed eight-field envelope. Nova compares its caller-supplied issuer with the active wait. An identical retry has no second effect, and a conflicting retry fails.
>
> **Implementation:** [Nova validates wait identity, signal type, issuer, expiry, and issue time](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L137-L144). [Nova makes identical retries idempotent and permits only one recorded signal for each wait](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-run.ts#L109-L122).
>
> **Contract or setting:** [The contract requires all eight envelope fields and rejects extra fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L777-L802).
>
> **Test evidence:** [The recovery test exercises accepted, repeated, stale, and expired signals](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/attempt-projection-recovery.test.mjs#L43-L76). The publication check also validates the example on this page against the canonical schema.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** The envelope has no signature. Its issuer is self-asserted by the
> caller, and repository checks do not authenticate the human or external
> identity provider.

## Recover After Interruption
<!-- operator-variant: run-control/recover-project -->
<!-- operator-variant: run-control/recover-explicit-graph -->
<!-- operator-variant: run-control/recovery-signal-required -->
<!-- operator-variant: run-control/recovery-terminal-run -->
<!-- operator-variant: run-control/recovery-cooldown-not-due -->
<!-- operator-variant: run-control/recovery-identity-mismatch -->
<!-- operator-variant: run-control/recovery-unresolved-effect -->
<!-- operator-variant: run-control/recovery-external-continuation -->

Recovery reopens durable state after a process interruption.
It does not approve a wait or resolve an uncertain external result.

Before recovery, run the audit command from [Inspect a Run](#inspect-a-run) and
retain its output. Confirm the original platform, graph or project, package
snapshot, run ID, storage root, and configuration. Reconcile every accepted
external effect that lacks a terminal receipt. Stop while any outcome remains
unknown.

Project form:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --recover "<run-id>"
```

Explicit graph form:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --pipeline "<pipeline.json>" \
  --recover "<run-id>"
```

Recovery must use the original graph and package snapshot.
Start a new run when governed configuration must change.

Expected observation: a permitted recovery writes one JSON result for the same
run ID. Exit code zero requires terminal status `succeeded`; retain a nonzero
result as a failed or blocked recovery, not as proof that restart completed.
Run the audit command again and compare both audits. The final audit must retain
the original graph and package identities, contain no unexplained duplicate
effect, and agree with the returned terminal state.

Use the exact failure before choosing the next action:

| Observation | Meaning | Safe action |
| --- | --- | --- |
| `RECOVERY_SIGNAL_REQUIRED:<wait-id>` | The run has an active wait; restart cannot invent its decision | Read the active wait and use [Approve or Resume a Wait](#approve-or-resume-a-wait) with one matching signal |
| `RECOVERY_RUN_TERMINAL` | The durable run already ended as succeeded, failed, blocked, or cancelled | Do not recover it; retain the audit and start a new governed run only for new work |
| `RECOVERY_COOLDOWN_NOT_DUE:<stage-id>:<time>` | A persisted retry time has not arrived | Do not bypass the clock; wait until the recorded time, then repeat the same recovery command |
| `RECOVERY_GRAPH_*`, `RECOVERY_PIPELINE_ID_MISMATCH`, or `PROJECT_RECOVERY_RUN_MISMATCH` | The supplied graph, project, or run does not match durable state | Restore the original input bytes; never edit the snapshot or reuse the run ID for a changed graph |
| `RECOVERY_PINNED_PACKAGE_*`, `RECOVERY_PACKAGE_UPGRADE_*`, or `RECOVERY_REGISTRY_SNAPSHOT_INVALID` | Installed package identity differs from the recorded snapshot | Restore the recorded package set; use only the separate authorized package-upgrade procedure when its exact contract applies |
| `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` or `RECOVERY_DEPENDENCY_IDENTITY_MISMATCH` | Runtime configuration or dependency identity changed | Restore the recorded runtime configuration and dependency set, or start a new governed run |
| `RECOVERY_EFFECT_OUTCOME_UNRESOLVED:<effect-id>` | An accepted external request has no known receipt outcome | Query the external authority with the original identity and reconcile it before any recovery retry |
| `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED:<effect-id>` | An external effect has a receipt, but its interrupted attempt needs explicit continuation | Follow the owning plugin or provider continuation contract; do not replay the effect through generic recovery |

Project recovery also validates the stored generated nodes and their encoding
selectors before it verifies the whole pinned graph. The implementation
authorities are
[`recovery.ts`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/recovery.ts#L5-L50)
and
[`delivery-manifest.ts`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/delivery-manifest.ts#L6-L33).
These are operator-visible identity mismatches, not permissions to repair the
stored graph:

| Exact outcome | Failed stored authority | Safe action |
| --- | --- | --- |
| `PROJECT_RECOVERY_SOURCE_INVALID` | Exactly one generated `source-preflight` node is absent or has the wrong type | Stop; restore the original durable run bytes from the owning store or retain the run as unrecoverable |
| `PROJECT_RECOVERY_REVIEW_NODES_MISMATCH` | Generated Review node identities differ from the project compiler | Stop; use the original project/compiler/package snapshot |
| `PROJECT_RECOVERY_REVIEW_SEMANTICS_INVALID` | A stored Review semantic or report encoding is unsupported | Stop; restore the exact compatible package snapshot; never rewrite the node |
| `PROJECT_RECOVERY_REVIEW_SEMANTICS_MIXED` | Review nodes contain mixed semantic generations | Stop; treat the durable graph as inconsistent and preserve it for diagnosis |
| `PROJECT_RECOVERY_REPORT_ENCODING_INVALID` | A Review report encoding is unsupported | Stop; restore the compatible package snapshot |
| `PROJECT_RECOVERY_REPORT_ENCODING_MIXED` | Review nodes contain mixed report encodings | Stop; preserve the inconsistent graph; do not select a mode by majority |
| `PROJECT_RECOVERY_SUMMARY_NODE_INVALID` | The one required `project-summary` identity/type pairing is missing, duplicated, or inconsistent | Stop; restore the original durable graph bytes or retain the run as unrecoverable |
| `PROJECT_RECOVERY_DELIVERY_SELECTOR_FOREIGN` | A non-summary node owns `deliveryManifestEncoding` | Stop; do not move or delete the foreign selector in durable state |
| `PROJECT_RECOVERY_DELIVERY_MANIFEST_ENCODING_INVALID` | The stored summary selector shape or value is unsupported | Stop; restore the compatible project/package snapshot |
| `PROJECT_DELIVERY_MANIFEST_ENCODING_INVALID` | A caller supplied a delivery-manifest mode outside the supported legacy/current pair | Correct the caller configuration before compilation; do not mutate an existing run |

Recovery has no separate temporary runtime object to clean up. Preserve both
audits, the unchanged command, output, exit status, effect queries and receipts,
and the final decision. Remove only restricted temporary copies after retaining
their digests. A completed final audit is the proof that restart/recovery ended
at the intended durable state.

## Cancellation Boundary

The current pipeline CLI has no supported operator cancellation command.
Do not present process termination as durable run cancellation.

An internal abort signal can cancel active work during runtime shutdown.
That mechanism is not an external operator control surface.

When urgent containment is necessary:

1. Preserve run and process evidence.
2. Stop new admission through the owning service boundary.
3. Use the approved incident process for workload containment.
4. Reconcile every accepted external effect.
5. Do not claim `cancelled` unless durable lifecycle evidence records it.

This is an implementation limit, not a documentation shortcut.

## Inspect Results and Demo Readiness

A successful run can report `technical-only` or `demo-handoff` completion.
Only the latter can report `ready-for-acceptance`.

Human acceptance remains a separate action.
It binds to the exact source, run, result, and exposed demo.

Check result artifacts through their owning store.
Verify content digests before sharing or importing them.

For final Tailnet exposure, use the registered pipeline stage and its receipt.
The [result and demo-readiness procedure](#inspect-results-and-demo-readiness) defines the supported entry point.

## Operate Prism

Use the [canonical Prism and Studio procedure](prism-studio.md#canonical-prism-and-studio-procedure).
This page does not define a second deployment, health, access, or recovery path.

## Operate Role Deployments

Use targeted commands when one role changes:

```bash
assert_cluster_binding
./scripts/deploy.sh agent nova
./scripts/deploy.sh agent buster
./scripts/deploy.sh agent prism
```

Use `--with-code` only for Nova or Buster.
Prism uses its dedicated multi-workload release.

After a role change, run its smoke command and inspect its selected image ID.
Do not restart every role to hide one role-specific failure.

## Safe Retry Decision

| Condition | Next action |
| --- | --- |
| Command failed before durable request acceptance | Correct the input and submit once |
| Durable request exists with a terminal failure | Follow its declared retry or repair decision |
| Request exists and provider outcome is absent | Inspect through a documented provider status operation; if the outcome remains uncertain, preserve evidence, stop, and escalate |
| Provider completed but local response was lost | Use an exact provider-specific idempotent import operation only when its contract documents one; otherwise preserve evidence, stop, and escalate |
| Wait remains active | Supply one matching authorized signal |
| Graph, package, or policy digest changed | Start a new governed run |
| Terminal run | Do not recover or resume it |

There is no generic Core operation that reconciles an uncertain external
effect and imports its result. See the
[current reconciliation boundary](../status/open-issues.md#uncertain-external-effects-have-no-supported-reconciliation-and-result-import-operation).
A provider-specific normal result import is safe only when that provider
documents the request identity, result identity, idempotency rule, authority,
and durable transition. External inspection alone does not authorize a retry,
resume, journal edit, or result import.

## Evidence to Retain

- Platform, project, graph, and signal digests.
- Complete command and nonsecret arguments.
- Start output and run identity.
- Audit output before and after recovery or signal handling.
- Provider request, receipt, and reconciliation record.
- Artifact identities and verified digests.
- Prism decision and demo identity when applicable.
- Unsupported-control finding when an operation stops at a missing surface.

## Read Next

Use [Observe and Diagnose](diagnose.md) for failed or slow work.
Use [Back Up and Recover](recovery.md) for data or access loss.

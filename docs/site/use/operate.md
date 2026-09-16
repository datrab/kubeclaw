# Configure and Operate

Status: implemented command paths with explicit missing operator controls
Audience: product operator, pipeline operator, Prism operator
Owner: Nova Core and platform operations
Evidence: skills/nova/project/cli.ts; skills/nova/core/cli.ts
Applies to: pipeline-platform.v2 and current Prism deployment
Last verified: 2026-09-16, source inspection and command-help execution

## Objective

Configure one governed runtime, start work, inspect durable results, and continue supported waits.
This page also identifies controls that the current CLI does not provide.

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

## Understand the Two Command Forms

KubeClaw accepts a project document or an explicit pipeline graph.

| Form | Use | Identity source |
| --- | --- | --- |
| `--project` | Normal project operation | Compiler derives the run and graph identity |
| `--pipeline` | Direct operation of an explicit graph | Operator supplies or accepts the run identity |

Both forms require `--platform`.
Do not mix their recovery syntax.

Display the exact current interface:

```bash
npm run pipeline -- --help
```

> **Source evidence — command surface**
>
> [The project CLI validates arguments, compiles projects, checks the baseline, and selects start, recover, or signal](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/nova/project/cli.ts#L15-L59).
>
> [The Core CLI supports run, recover, signal, and audit operations for explicit graphs](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/nova/core/cli.ts#L12-L70).
>
> Limit: Neither CLI defines a separate cancel command.

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
> [The platform schema requires trust, providers, grants, adapters, observers, storage, and issuer fields](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/common/plugin-runtime/foundation/config/platform.schema.json#L5-L110).
>
> [The loader validates the complete document and resolves paths from its directory](https://github.com/datrab/kubeclaw/blob/85e73b1885f04a9494f388cf6622ad0bde2db447/skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69).

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

The signal must match:

- `waitId`.
- `signalType`.
- Authorized issuer type and ID.
- Required payload for that wait.
- Current source and decision identity when the payload requires them.

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

## Recover After Interruption

Recovery reopens durable state after a process interruption.
It does not approve a wait or resolve an uncertain external result.

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
The short [Final Preview guide](../../operators/final-preview-tailscale.md) gives the legacy entry point.

## Operate Prism

Check deployment state:

```bash
export PRISM_NAMESPACE="<namespace>"
./scripts/deploy.sh prism-status
./scripts/deploy.sh prism-smoke
kubectl -n "$PRISM_NAMESPACE" get deploy,statefulset,svc,pvc
```

Find the Studio access resource selected by the deployment:

```bash
kubectl -n "$PRISM_NAMESPACE" get ingress,svc prism-studio
```

Do not infer external access from an Ingress hostname alone.
Tailnet grants and identity remain separate controls.

Prism decisions, another design round, and native worker handling have specialized procedures.
Use the [Prism operator guide](../../operations/prism-operator-guide.md).

## Operate Role Deployments

Use targeted commands when one role changes:

```bash
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
| Request exists and provider outcome is absent | Reconcile the provider before any repeat |
| Provider completed but local response was lost | Import or recover the existing result |
| Wait remains active | Supply one matching authorized signal |
| Graph, package, or policy digest changed | Start a new governed run |
| Terminal run | Do not recover or resume it |

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

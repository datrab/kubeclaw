# Prism Helm Deployment v1

Status: accepted architecture contract

## Decision

Prism is one Helm release in one namespace. It uses separate workloads for control,
Studio, normal design work, external ingestion, and PostgreSQL.

```text
namespace: prism
release: prism

prism-control
prism-studio
prism-worker
prism-ingestion-worker       optional
prism-postgresql
```

Resources use generous configurable defaults. Operators can change requests, limits,
replicas, storage, concurrency, and provider-call budgets without changing Prism
contracts.

## Prism control

`prism-control` is a single-replica Deployment in v1. It contains the OpenClaw Prism
agent, Prism API, Design Engine coordinator, and worker dispatch client.

It owns conversation, project coordination, revision transactions, provider
research, worker dispatch, and baseline-publication coordination. It does not run
Chromium capture, external source acquisition, PostgreSQL, or production deployment.

Control can scale only after session ownership supports more than one replica.

## Studio

`prism-studio` is a stateless Deployment. It contains the responsive desktop and
mobile editor, Puck adapter, and safe prototype renderer.

Studio has no database, provider, worker, Kubernetes, or artifact-write credentials.
It calls the authenticated Prism API. It can scale horizontally without changing the
Design Document or Studio operation contracts.

Only Studio is exposed through the existing Tailscale Kubernetes Operator.

## Standard worker

`prism-worker` contains generic worker-core, the Prism Design Engine, Playwright and
Chromium, trusted renderers, and approved runtime packs.

It runs generation, rendering, evaluation, publication, and permitted derived-data
work. It is stateless, uses bounded temporary storage, and scales horizontally.

## Ingestion worker

`prism-ingestion-worker` is a separate optional Deployment. It contains worker-core,
reviewed source adapters, browser-capture tools, and quarantine tools.

It is separate because public acquisition needs a different network trust class. It
starts disabled and can be enabled when external corpus collection begins.

The ingestion worker has restricted external HTTP and HTTPS access. It has no
Kubernetes API access, PostgreSQL credentials, Studio authority, or broad internal
network access.

## PostgreSQL

Prism uses a dedicated PostgreSQL database with pgvector. V1 can deploy PostgreSQL as
a StatefulSet or a reviewed chart dependency inside the Prism release.

Database roles are:

- `prism_migrator` for schema migration;
- `prism_runtime` for normal Prism transactions;
- `prism_readonly` for approved inspection and maintenance;
- a separate backup role when the selected backup tool requires it.

PostgreSQL has persistent storage, readiness checks, controlled migrations, daily
backup, and restore-proof jobs. It is not colocated with application containers.

## Services and exposure

Internal ClusterIP Services expose control, Studio, and PostgreSQL only where needed.

```text
Tailscale
  -> Prism Studio
  -> authenticated Prism control API
```

PostgreSQL, workers, internal OpenClaw ports, administrative artifact endpoints, and
metrics endpoints are not exposed through Tailscale or public ingress.

## Service accounts and Kubernetes RBAC

Each workload has a separate ServiceAccount with:

```yaml
automountServiceAccountToken: false
```

Prism application workloads receive no Kubernetes Roles, ClusterRoles,
RoleBindings, or ClusterRoleBindings in v1. The Tailscale Operator manages its own
resources.

Backup and migration jobs use mounted credentials. They do not receive broad
Kubernetes read authority.

## Network policy

The namespace uses default-deny ingress and egress.

Studio can receive Tailscale traffic and call only the Prism API and approved
artifact-read path.

Control can receive authenticated Studio and internal Nova traffic. It can reach
PostgreSQL, artifact storage, worker transport, approved providers, DNS, and the
OpenTelemetry collector.

The standard worker can reach worker transport, artifact storage, approved model
providers when required, DNS, and telemetry. It does not receive general public-web
access.

The ingestion worker can reach controlled public HTTP and HTTPS, quarantine artifact
storage, DNS, worker transport, and telemetry. It cannot reach private networks,
cloud metadata, the Kubernetes API, PostgreSQL, or unrelated cluster services.

PostgreSQL accepts traffic only from control, migration, backup, restore, and
approved read-only maintenance workloads.

## Secrets

Use separate Secrets for control authentication, provider credentials, database
runtime, database migration, database backup, artifact access, and worker transport.

Each workload receives only the credentials it needs. Studio receives no long-lived
platform secret. Secret values do not enter ConfigMaps, Design Documents, Baseline
Bundles, logs, or telemetry.

## Configuration

Versioned ConfigMaps or immutable configuration artifacts hold service settings,
runtime profiles, installed pack manifests, gate packs, ingestion policy packs,
operations policy, and telemetry endpoints.

Security policy cannot be weakened through project configuration.

## Storage

Persistent storage is limited to PostgreSQL, required OpenClaw state, and backup
staging when required. Workers and Studio use bounded temporary volumes.

Large durable files go to the content-addressed artifact store. Control and workers
do not share a writable workspace volume.

## Jobs and schedules

The release provides:

- one migration Job;
- one daily backup CronJob;
- one weekly restore-proof CronJob;
- one rights-expiry CronJob;
- an on-demand derived-data rebuild Job.

Migration runs once before the new control version becomes ready. Application
replicas do not run migrations independently.

## Pod security

All workloads run as non-root, deny privilege escalation, use a read-only root
filesystem where possible, drop all Linux capabilities, and use the runtime-default
seccomp profile.

Prism does not use privileged containers, host networking, host PID or IPC, HostPath,
Docker or BuildKit sockets, or broad device access. Chromium exceptions must be
small, explicit, and tested.

## Resources and scaling

The chart exposes configurable values for resources, storage, worker concurrency,
provider calls, and replica counts. Defaults give control, Chromium workers, and
PostgreSQL enough headroom for the initial complete experience.

V1 starts with one replica for each enabled workload. Studio and workers can scale
horizontally. Add autoscaling, disruption budgets, and topology spread only when
replica counts and measured load justify them.

No Prism contract contains CPU, memory, or storage numbers.

## Capability boundary

Control can manage projects, create revisions, record permitted preferences, read the
corpus, dispatch workers, coordinate publication, access artifacts, and emit
telemetry.

Standard worker attempts receive only the capability required by their operation:

- `design.generate`;
- `design.render`;
- `design.evaluate`;
- `design.baseline.publish`;
- scoped artifact read or write;
- telemetry emission.

Render authority does not imply publish authority.

The ingestion worker receives `design.corpus.ingest`, restricted network fetch,
quarantine and derived-artifact write, and telemetry emission.

Studio uses authenticated user API permissions for project viewing, design editing,
review, and approval. It cannot call workers or publish a baseline directly.

## Chart structure

Use one small Prism chart. Reuse stable KubeClaw Helm helpers where they fit. Do not
copy the complete Nova chart and remove unrelated parts.

```text
charts/prism/
  Chart.yaml
  values.yaml
  values.schema.json
  templates/
    control/
    studio/
    worker/
    ingestion/
    postgresql/
    jobs/
    network-policy/
    services/
```

## Acceptance checks

Point 13 is implemented only when tests prove that:

1. only Studio is exposed through Tailscale;
2. every application ServiceAccount disables token mounting;
3. no Prism application workload has Kubernetes RBAC;
4. default-deny network policy is active;
5. Studio has no privileged credentials;
6. standard workers cannot perform unrestricted public acquisition;
7. ingestion workers cannot reach private networks or PostgreSQL;
8. operation capabilities do not expand across attempts;
9. workers can scale without shared local state;
10. resource and storage values can change without contract changes;
11. database migration runs once and fails safely;
12. backup and restore-proof jobs use separate scoped credentials.

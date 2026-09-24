# Product and Platform Roadmap

Status: planned direction
Audience: operator, maintainer, developer
Owner: platform-maintainers
Evidence: docs/status/open-issues.json; packaging/runtime/package-ownership.json; skills/nova/plugins/lint/src/adapter.ts; skills/nova/plugins/lint/src/engine/discovery.ts; skills/nova/plugins/lint/src/engine/execution.ts; charts/kubeclaw/templates/configmap-swarm-config.yaml; charts/kubeclaw/templates/deployment.yaml
Applies to: planned KubeClaw product and platform work
Last verified: 2026-09-20

## Purpose

This page separates planned work from current behavior. A roadmap item is not a
deployment guarantee. Current behavior needs implementation, verification, and
operator guidance before it leaves this page.

## Automated Host Bootstrap and Recovery

The repository does not prepare a complete supported host from an empty machine.
The planned entry point must:

- check architecture, storage, networking, kernel features, cgroup v2, time, and required packages;
- install the selected K3s version with explicit datastore, CNI, DNS, and startup settings;
- prepare storage or connect the selected CSI implementation;
- establish independent administrative access before cluster-local access becomes necessary;
- emit a redacted record of versions, flags, networks, storage ownership, and recovery inputs;
- support an idempotent rerun, a plan view, clear stop conditions, and bounded rollback;
- keep credentials and recovery keys outside Git; and
- prove new-host installation and host-loss recovery in an isolated environment.

Acceptance requires a second operator to start with an empty supported host. The
operator must reproduce the cluster without undocumented repair. The restored
system must pass storage, DNS, identity, pipeline, and application checks.

## Protected Redis and Registry Transport

Redis and registry transport protection remains planned. The intended design
reuses workload identities and gives registry clients explicit peer permissions.
It must cover BuildKit, Buster, scanners, and node container runtimes. Positive,
negative, rotation, restart, and rollback tests must use the real transport path.

This work does not make the current HTTP registry secure. It also does not change
the authority boundary: Redis remains transport and projection infrastructure.

## Central Operator Configuration

The intended configuration model uses `swarm.config.json` as the authored source
for operator settings. It must not introduce a competing general configuration
file. The work must inventory every setting, default, override, consumer, unit,
and conflict rule. Secrets remain external references. `versions.json` remains
the software-version authority.

Acceptance requires production consumers to use resolved central values. Drift
tests must detect hard-coded duplicates and missing propagation.

## Resilient Git Source Acquisition

The current pipeline uses direct origin access. A future mirror or cache must
preserve exact Git object identity. It must define freshness, upstream loss,
corruption, credentials, failback, capacity, cleanup, backup, and restore.

Acceptance requires a complete run at an exact revision through the mirror. The
same test must fail safely when the mirror cannot supply that revision.

## Production-Grade Local OCI Registry

The current local registry is an anonymous HTTP laboratory service. It is not the
final security boundary for a complete platform.

The replacement must:

- serve HTTPS with a reviewed certificate authority and rotation procedure;
- authenticate push and pull clients with least-authority credentials;
- configure BuildKit, Buster, scanners, and Kubernetes nodes from one client contract;
- preserve manifests and layers across Pod, node, and service restarts;
- define capacity, backup, restore, corruption handling, and exclusive garbage collection; and
- reject anonymous clients, wrong credentials, untrusted certificates, and mutable substitutions.

Acceptance requires a real BuildKit push and a Buster digest check. A Kubernetes
node must then perform an uncached pull of the same digest.

## Lint Concurrency and Deployed Extension Acceptance

The current lint adapter can accept concurrent invocations, but discovery
diagnostics use shared process state and native analysers use shared cache
directories. The planned change must make diagnostic ownership
invocation-local. It must also isolate a cache or prove that its owning analyser
supports concurrent writers. Concurrency tests must overlap two distinguishable
runs and prove that findings, diagnostics, cancellation, cleanup, and artifacts
remain bound to the correct request.

The repository also lacks a maintained deployment fixture that invokes an
installed lint stage in a Nova pod. The fixture must select the namespace, pod,
and container through stable labels; verify access and readiness; compare the
approved configuration digests with `/runtime-config`; invoke pre-check and full
through the real stage/capability path; retain the immutable report artifact;
check its policy, config, pack, tool, scope, and finding identities; and remove
only fixture-owned data. It must specify expected exit states and stop when the
pod, source revision, or runtime bytes do not match.

Acceptance requires two results. The overlap test must prove report isolation,
and a second operator must run the deployment fixture without an undocumented
`kubectl exec` command or manual report reconstruction.

## Joined Showcase Acceptance Harness

The repository does not currently have one maintained harness that binds a
Prism Studio design and human approval, a Nova project run, Discord and Redis
reporting, Cilium and Hubble network evidence, and Buster BuildKit, Kubernetes,
and Tailscale work to one run identity. The documented 20-step request trace is
therefore a conceptual reference, not live acceptance evidence.

A future harness must use supported product entry points, preserve one source
and run identity, record every external effect before dispatch, and correlate
the Prism request, approval, Buster job, provider nodes, registry digest,
fixture lease, channel messages, Redis entries, allowed and denied flows, and
cleanup receipts. It must have bounded recovery for uncertain effects and must
not promote reporter delivery or a standalone preflight into lifecycle
authority. Acceptance requires an independently repeatable healthy run plus a
failure run that proves exact rollback and leaves no unidentified resource.

## Other Planned Themes

- Use a real pipeline-built project to expose practical operating pressure.
- Exercise third-party plugin installation, replacement, and removal.
- Add user-defined workflows without weakening lifecycle authority.
- Improve lint rules, diagnostics, templates, and build caching.
- Add design-aware delivery, security workflows, and bounded parallel execution.
- Select hostname-aware egress controls and platform-wide metrics and logs.

## Promotion Rule

Move an item from planned to delivered status only when implementation exists. At least
one proof from the following list must also exist:

- source and tests prove the behavior;
- rendered manifests and commands prove deployment behavior;
- generated inventory protects drift-prone facts; or
- an operator exercise proves the procedure and its failure path.

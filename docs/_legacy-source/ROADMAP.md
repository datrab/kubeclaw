# Roadmap

Status: planned direction
Audience: maintainers, operators, developers

## Purpose

This page keeps future direction separate from current operator behavior. Items here are not deployment guarantees until source, tests, manifests, generated inventory, and operator docs prove them.

## Near-Term Sequence

1. Keep current docs aligned with source and generated inventory; expand automated references where exact contracts remain manually maintained.
2. Redeploy the latest code bundles and use ClawDeck as the first production project built by the validated pipeline.
3. Use that real project to identify operational and extension-boundary pressure rather than inventing abstractions in isolation.
4. Exercise third-party plugin installation, replacement, and removal against real operator workloads.
5. Complete the deeper operator/reference documentation pass after the first production workload exposes the remaining practical gaps.
6. Implement and verify automated empty-host bootstrap and recovery preparation before promising a one-command first deployment.
7. Replace the anonymous HTTP lab registry with the reviewed authenticated HTTPS registry path.

## Product And Platform Direction

### Automated host bootstrap and recovery

Status: planned and tracked by [IFR-01-001](site/status/open-issues.md#ifr-01-001).
The repository does not currently create a complete supported host from an empty machine.

The planned capability must provide one reviewed automation entry point that can prepare a supported Linux host and produce an auditable configuration record.
It must cover these responsibilities:

- Check CPU architecture, storage, networking, kernel features, cgroup v2, time synchronization, and required operating-system packages before mutation.
- Install and configure the selected K3s version with explicit API, datastore, CNI, DNS, and startup settings.
- Prepare the selected StorageClass or connect an external CSI implementation without inventing a local durability guarantee.
- Configure the independent administration and recovery path before in-cluster access becomes necessary.
- Produce redacted machine-readable output for versions, flags, network ranges, storage ownership, and recovery inputs.
- Support an idempotent rerun, a dry-run or plan view, bounded rollback before the irreversible point, and explicit stop conditions.
- Keep credentials, host keys, recovery keys, and private values outside Git while recording their owners and required references.
- Verify a new-host build and a host-loss restore in an isolated environment before the project calls the path supported.

The automation must not combine an unproved CNI migration with application deployment.
It must hand off to `scripts/deploy.sh` only after the cluster, storage, DNS, identity prerequisites, and independent access checks pass.

Acceptance requires a second operator to start with an empty supported host and the documented external inputs.
That operator must reproduce the selected cluster, restore its authoritative data, and pass API, DNS, storage, identity, pipeline, and application checks without undocumented manual repair.

### Redis and registry transport protection

Status: deferred by operator on 2026-09-16. Finish Argo adoption and the Cilium
migration first. Inventory scripts and requirements exist; mTLS is not deployed.

- Reuse Envoy/SPIRE identities for KubeClaw Redis and registry connections;
  assign dedicated registry ServiceAccounts and explicit peer permissions.
- Include Buster/BuildKit, manifest verification, Trivy and host containerd.
  The observed containerd route maps the registry Service name to
  `http://127.0.0.1:30051`; the existing NodePort is not mTLS protection.
- Close network plaintext bypasses, including Redis headless access, after
  clients are migrated. Preserve the intentionally ephemeral local registry.
- Require real positive/negative client tests, certificate rotation, restart
  and rollback evidence. Argo/Paperless Redis instances are separate scope.

See [inventory and acceptance requirements](operations/data-plane-mtls.md).
Deferral does not relax existing runtime HTTPS checks or make the HTTP image
scan path supported; resolve that deployment prerequisite before promising a
working Buster image pipeline.

### Central operator configuration audit

Status: planned, requested 2026-09-12; follows completion of the four remaining
PR #6 remediation findings. This is not an implemented configuration guarantee.

- Use the existing `swarm.config.json` as the single authored source for operator
  settings; do not introduce a competing `kubeclaw.yaml` configuration surface.
- Inventory every configurable setting across production code, worker profiles,
  environment loaders and deployment templates. Remove scattered hardcoded
  operator settings and trace each setting from the central source to its actual
  runtime consumer, including Buster and Prism. Test-only profile expansion is
  not proof of production wiring.
- Keep centrally defined defaults, readable feature/tuning groups and explicit
  overrides. Validate unknown keys, units, precedence and conflicting budgets.
  Distinguish immutable protocol constants from operator-tunable settings; the
  audit must not turn security invariants into bypass switches.
- Generate or resolve downstream configuration automatically through the normal
  build/deployment path, with no additional manual synchronization step. Verify
  drift and end-to-end propagation with regression tests and document the
  effective configuration without exposing secrets.
- Keep secrets external and reference them; retain `versions.json` as the
  canonical software-version source without duplicate version maintenance.
- Give worker task limits generous measured headroom and coordinate per-attempt
  budgets, concurrency and container capacity. Do not silently reinterpret old
  process limits as task limits or automatically raise limits after a failure.

Acceptance: the inventory accounts for all operator settings; production
consumers use the central resolved values; regressions detect hardcoded setting
drift; operator documentation covers defaults and overrides in one place.

### Resilient Git source acquisition

Status: planned after the current direct-origin path receives production evidence.
The repository does not currently provide a shared Git mirror service.

The planned capability must reduce dependence on one upstream Git endpoint.
It must not weaken the exact-revision and source-identity rules.

- Define whether the service is a read-through cache, a managed mirror, or a replicated authoritative origin.
- Keep repository authentication separate from pipeline-authored data.
- Bind every checkout to the requested commit and verify that the mirror returns the same Git object.
- Define freshness, lag, upstream loss, corruption, credential rotation, and failback behavior.
- Prevent a stale mirror from replacing a required commit with a newer branch head.
- Record which origin supplied each source snapshot without making the mirror a lifecycle authority.
- Provide capacity, garbage collection, backup, restore, monitoring, and incident procedures.
- Test cold fetch, cache hit, stale reference, upstream outage, mirror outage, and digest mismatch paths.

Acceptance requires a complete pipeline run through the mirror at an exact revision.
The same test must prove safe failure when the mirror cannot provide that revision.

### Production-grade local OCI registry

Status: planned.
The current `registry-local` manifest is an anonymous HTTP laboratory service.
It is not the final security boundary for the complete showcase platform.

The planned service must preserve the existing immutable-digest contract.
It must also add the controls required for a durable multi-client registry:

- Serve HTTPS with a reviewed certificate authority and explicit certificate rotation.
- Require authenticated push and pull access with separate least-authority credentials where practical.
- Keep credentials outside Git and distribute only the required Secret references.
- Configure BuildKit, Buster, scanners, and every Kubernetes node from one validated client contract.
- Preserve image manifests and layers across Pod, node, and service restarts.
- Define storage capacity, inode monitoring, expansion, backup, restore, and corruption handling.
- Keep garbage collection offline, reviewable, writer-exclusive, and safe for every retained digest.
- Define migration from the current registry data without losing accepted image digests.
- Reject anonymous clients, wrong credentials, untrusted certificates, mutable substitutions, and foreign registry authorities.
- Record audit evidence without logging registry passwords or private keys.

Acceptance requires a real BuildKit push to the authenticated HTTPS endpoint.
Buster must verify the pushed manifest digest.
A Kubernetes node must then perform an uncached pull of that exact digest.

The acceptance exercise must also cover unauthorized access, certificate rotation, registry restart, node restart, backup restore, storage exhaustion, and offline garbage collection.
The separate Docker Hub pull-through mirror remains a cache and does not replace this writable registry.

### Other themes

These are candidate roadmap themes, not current behavior claims:

- ClawDeck as the first real pipeline-built project and as richer platform/pipeline visibility.
- A broader ecosystem of independently installed extensions using the implemented core/package boundary.
- User-defined workflows that compose installed stages, observers, and adapters, including independently installed lint-tool providers and configuration packs behind a versioned, capability-bounded registration contract.
- Design agent and design flow for design-aware application delivery.
- Improved linting with more configurable rules and clearer failure output.
- Code mapping and independent review features that help agents reason about ownership and risk.
- Parallel agents for concurrent specialized work.
- Parallel pipelines for multiple modules or intents.
- Improved pipeline reviews and pipeline auto-improvement loops.
- Improved templates for project setup, gates, tests, and docs.
- Faster container image builds through cache-friendly layering, smaller build contexts, dependency cache reuse, and clearer separation between heavyweight base dependencies and frequently changing runtime code.
- Improved prompt engineering and prompt upgrade workflows.
- Additional intent-driven use cases beyond application delivery, including infrastructure-oriented workflows.
- Pentest and security agent workflows.
- Hostname-aware egress policy after a CNI/egress layer is chosen.
- Kubernetes-native metrics/log aggregation after a stack is selected.

## Promotion Rule

Move an item from roadmap to current docs only after the implementation exists and at least one of these is true:

- source code and tests prove the behavior
- rendered manifests and verification commands prove deployment behavior
- generated inventory includes the drift-prone facts
- an operator dry-run or failure drill proves the documented procedure

## Related Pages

- `architecture/plugin-system-vision.md`
- `architecture/plugin-system-implementation-plan.md`
- `architecture/plugin-system-phase12-changelog.md`
- `architecture/pipeline-test-gate-roadmap.md`
- `operators/external-pipeline-plugins.md`

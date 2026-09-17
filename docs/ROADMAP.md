# Roadmap

Status: planned direction
Audience: maintainers, operators, developers

## Purpose

This page keeps future direction separate from current operator behavior. Items here are not deployment guarantees until source, tests, manifests, generated inventory, and operator docs prove them.

## Near-Term Sequence

Operator-selected order, updated 2026-09-17. This supersedes earlier suggestions
to migrate Cilium before starting the workers. Current priority is stage 1.

1. **Get the required Pods running.** Start and verify Buster, Nova and Prism with
   their dependencies on the existing network. Require Ready containers and stable
   restarts; Pod readiness alone is not pipeline acceptance. Resolve immediate
   startup blockers here. Optional UI networking must not silently force a CNI
   migration or lose access controls.
2. **Finish Argo adoption and automatic runtime deployment.** Put intended
   workloads/infrastructure under Argo with separate Applications. KubeClaw code
   merges publish verified bundles and update the selected deployment; image-input
   changes build/verify images before selection and rollout. Prove both paths.
   Keep infrastructure and Codex Ops child syncs manual as previously requested;
   platform root reconciliation may remain automatic. Preserve PVCs and Secrets.
3. **Resolve the open issues.** Inventory and triage the current tracker (operator
   estimate around 15, not a verified count), fix defects and verify their actual
   behavior. Do not postpone a stage-1/2 blocking defect merely to preserve this
   ordering. Include the known HTTP registry scanner compatibility gap without
   converting a failed security scan into success.
4. **Centralize operator configuration.** Remove hardcoded deployment-specific
   settings from code and resolve them from configuration files through the single
   operator configuration audit below. Keep versions in `versions.json`, Secrets
   external, and protocol/security invariants in code. No duplicated editable
   sources; prove configuration reaches each runtime consumer.
5. **Exercise the full pipeline and finish documentation together.** Use a real
   project (ClawDeck is the existing candidate), verify success/failure/cleanup
   paths and document actual operations and recovery. Fix findings rather than
   treating green Pods or CI as an end-to-end pass.
6. **Migrate to Cilium.** Plan the network maintenance separately, cover every
   existing application and verify connectivity, policy enforcement and recovery.
7. **Deploy HTTPS/mTLS transport protection.** Reuse the planned Envoy/SPIRE
   architecture for Redis/registry and required clients, then close plaintext
   bypasses and verify rotation and negative access tests.

Throughout these stages, label reusable installation steps, keep their contracts
and docs current, and build toward Controlnode-driven node onboarding. Finish
fresh-install, rerun and recovery verification before calling the installer
one-click. Cilium/HTTPS are deferred work, not implied prerequisites for stage 1.

## Product And Platform Direction

### Controlnode installer and repeatable node onboarding

Status: required operator experience, agreed 2026-09-17; not implemented as a
complete installer. Finish the current worker adoption and Cilium work while
capturing reusable steps, rather than requiring operators to replay repair scripts.

- One Controlnode entry point must orchestrate cluster inspection, node preparation,
  Argo bootstrap and verification. Operators must not log into each host and build
  binaries manually. SSH/sudo is an implementation detail for node-level work;
  Kubernetes API operations use the selected kubeconfig context.
- Support an existing compatible K3s/Kubernetes cluster first. Later add explicit
  cluster creation; never reinstall an existing cluster based on failed discovery.
- Make adding a node an inventory change and a targeted installer run: validate
  capacity/runtime, join if required, configure only its assigned roles, verify
  readiness, and reconcile placement. Keep the operator configuration audit's
  single-source requirement; do not add another competing configuration file.
- Native pools are installed only on nodes assigned native execution. Render
  per-node identities, policies and resource budgets; AX41 paths, names, digests
  and build directories must not become global defaults. Additional nodes do not
  automatically increase application concurrency or move local-path PVC data.
- Keep role pools independent of executable/browser selection. A compatible
  browser/tool replacement changes its image or task adapter, not host resource
  policy. Validate inherited aggregate limits and cleanup across supported tools;
  distinguish adapter compatibility from resource-pool capability.
- Preserve current sync policy: platform root may reconcile Application definitions;
  infrastructure/Codex Ops children stay manual, while validated KubeClaw runtime
  releases may autosync. Bootstrap completion is not an image-release selection.
- Acceptance requires fresh setup, unchanged rerun, interrupted-run recovery,
  adding a second node without restarting unrelated workloads, and a real workload
  smoke test. Print completed/pending steps without exposing credentials.

See the [installer contract](operations/ax41-rollout.md#requirements-for-a-future-one-click-installer).

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

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
6. Finish clean-cluster bootstrap verification before promising a one-command first deployment.

## Product And Platform Direction

These are candidate roadmap themes, not current behavior claims:

- ClawDeck as the first real pipeline-built project and as richer platform/pipeline visibility.
- A broader ecosystem of independently installed extensions using the implemented core/package boundary.
- User-defined workflows that compose installed stages, observers, and adapters, including independently installed lint-tool providers and configuration packs behind a versioned, capability-bounded registration contract.
- Design agent and design flow for design-aware application delivery.
- Improved linting with more configurable rules and clearer failure output.
- Code mapping and autoreview features that help agents reason about ownership and risk.
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

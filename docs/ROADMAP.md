# Roadmap

Status: planned direction
Audience: maintainers, operators, developers

## Purpose

This page keeps future direction separate from current operator behavior. Items here are not deployment guarantees until source, tests, manifests, generated inventory, and operator docs prove them.

## Current Documentation Rebuild

The original near-term roadmap was the documentation rebuild in `DOCUMENTATION_REBUILD_PLAN.md`. Current execution context is now the 2026-06-12 coverage audit, topic map, matrix, enrichment plan, and enrichment changelog under `docs/archive/audits/`.

Current sequence:

1. Keep P0/P1 docs source-grounded and update the coverage matrix when enriching them.
2. Expand generated inventory for the remaining drift-prone references.
3. Finish clean-cluster quickstart verification before promising live first-run behavior.
4. Split active limitations from long resolved-history tracker content where useful.
5. Add failure drills and docs maintenance automation only after source-backed procedures exist.

## Product And Platform Direction

These are candidate roadmap themes, not current behavior claims:

- Documentation overhaul
- Clawdeck observability for richer platform and pipeline visibility.
- Design agent and design flow for design-aware application delivery.
- Improved linting with more configurable rules and clearer failure output.
- Code mapping and autoreview features that help agents reason about ownership and risk.
- Parallel agents for concurrent specialized work.
- Parallel pipelines for multiple modules or intents.
- Improved pipeline reviews and pipeline auto-improvement loops.
- Improved templates for project setup, gates, tests, and docs.
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

- `DOCUMENTATION_REBUILD_PLAN.md`
- `future-implementation-ideas.md`
- `open-issues.md`

# Roadmap

Status: planned direction
Audience: maintainers, operators, developers

## Purpose

This page keeps future direction separate from current operator behavior. Items here are not deployment guarantees until source, tests, manifests, generated inventory, and operator docs prove them.

## Current Documentation Rebuild

The active near-term roadmap is the documentation rebuild in `DOCUMENTATION_REBUILD_PLAN.md`.

Current sequence:

1. Define documentation standards.
2. Audit and normalize the active docs tree.
3. Build generated inventory and generated reference checks.
4. Rebuild deployment, operator, pipeline, developer, and reference docs from source.
5. Add diagrams, examples, failure drills, and docs maintenance automation.

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

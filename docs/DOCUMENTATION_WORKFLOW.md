# Documentation workflow and style guide

Status: active
Owner: Nova / maintainers

## Purpose

This file is the operating guide for maintaining KubeClaw documentation. Read it with `docs/DOCUMENTATION_HANDOFF_PROMPT.md` when beginning or resuming a documentation change.

## Core rule

Documentation must be technical, clear, and code-grounded.

Every claim about current behavior must be proven from source files, rendered Helm output, tests, scripts, Dockerfiles, or other source-controlled implementation artifacts. Do not write aspirational documentation as if it describes current behavior. If something is target-state, planned, uncertain, inconsistent, or broken, say so explicitly and record it in the right tracker.

Treat every currently available documentation file as potentially outdated source material to inspect, not as authoritative proof of current behavior. This includes all READMEs, archived docs, conventions files, skill descriptions, and existing public docs.

## Execution discipline

- Scope the affected topics and source owners before editing.
- Review every related active page, index, example, diagram, generated slice, issue, and roadmap entry.
- Replace stale claims directly and keep one current path.
- Run the narrow source-owned verifier as well as the docs checks.
- Stop at a clean boundary and report exact remaining uncertainty when live proof is unavailable.

## Required workflow for each documentation area

For every document or section we create:

1. **Identify the audience**
   - operator
   - developer
   - maintainer/architect
   - reference reader

2. **Identify the source files**
   - list the code paths, config files, tests, and existing docs used
   - treat source files, rendered manifests, tests, scripts, and Dockerfiles as proof for current behavior
   - treat existing docs and archived material as topic discovery or historical context until source-verified

3. **Audit the code before writing**
   - inspect the relevant implementation files
   - inspect adjacent helpers and contracts
   - inspect verification tests when they exist
   - check whether old docs are stale before reusing them
   - inspect rendered Helm output when documenting deployment, Kubernetes resources, or runtime environment

4. **Write the doc in the correct layer**
   - architecture explains structure and ownership
   - operators docs explain tasks and recovery
   - developers docs explain extension and contribution rules
   - reference docs specify exact fields, schemas, commands, and exit codes
   - decisions docs explain why the design exists

5. **Capture findings immediately**
   - unresolved bugs, inconsistencies, stale docs, unclear behavior, and active risks go to `docs/open-issues.md`
   - future implementation ideas go to `docs/future-implementation-ideas.md`
   - do not bury findings inside prose where they will be lost

6. **Cross-link instead of duplicating truth**
   - if exact fields live in reference docs, link there
   - if recovery steps live in operator docs, link there
   - do not repeat long schemas or command lists across multiple docs

7. **Mark uncertainty**
   - use `Current behavior`, `Target state`, `Open issue`, or `Needs verification`
   - never blur current behavior with desired behavior

8. **Avoid filler sections**
   - omit `Operator notes` if no actionable code-grounded tasks or diagnostics are found
   - omit `Developer notes` if no actionable code-grounded extension or implementation guidance is found
   - split long `Current behavior` sections into `Initialization`, `Execution path`, and `State changes` when needed

## Documentation style rules

Use this style everywhere:

- technical, direct, and precise
- short paragraphs
- descriptive headings
- concrete file paths and command names
- active voice
- explicit ownership language: “core owns”, “Buster emits”, “Redis stores”
- exact names for statuses, events, files, and exit codes
- no marketing language
- no vague claims like “robust”, “smart”, or “seamless” unless backed by exact behavior
- no unexplained acronyms
- no hidden assumptions

## Maintenance Checks

Run these before finishing docs-affecting work:

```bash
npm run docs:inventory
npm run docs:generate
npm run docs:check
git diff --check
```

`npm run docs:check` is the local and CI entrypoint for docs hygiene. It checks generated inventory/reference freshness, local links, generated-section markers, core operator page shape, target-state guardrails on current pages, and SVG diagram basics.

Prefer:

```md
The pipeline exits with `10` when automatic retries are exhausted and Nova must inspect the failing module or gate.
```

Avoid:

```md
The pipeline intelligently handles problems and asks Nova when needed.
```

## Issue capture rules

Add an entry to `docs/open-issues.md` when code review finds:

- behavior that contradicts existing docs
- duplicate or competing sources of truth
- unclear ownership between core, gates, workers, Buster, Redis, or Discord
- confusing naming
- dead or obsolete code paths
- overly complex logic that can be simplified
- missing verification for documented behavior
- security, secret-handling, or path-safety concerns
- operator-facing ambiguity or poor failure messages

Each issue must include its area, priority, exact source paths, problem/impact, and smallest next step. Delete the entry when it is resolved.

## Future idea capture rules

Add an entry to `docs/future-implementation-ideas.md` when code review finds:

- a useful improvement that is not required for accurate docs
- a possible refactor
- a better operational model
- a future extension point
- a DX/tooling improvement

Do not mix future ideas into `docs/open-issues.md` unless the current behavior is actively wrong or risky.

## Code citation standard

When a doc describes behavior, cite the relevant file path in prose or in a source list.

Good:

```md
Source files: `skills/nova/pipeline/cli.ts`, `skills/nova/pipeline/core/constants.ts`.
```

For large topics, include source references only when they materially help verify implementation-specific claims.

Reference pages should include concrete examples when source-proven. Prefer repeated field blocks with `Type`, `Default`, `Required`, `Used by`, `Source`, `Example`, and `Notes` when Markdown tables would become too wide.

## Compaction handoff checklist

Before ending or after resuming a documentation session, check:

- `docs/DOCUMENTATION_PLAN.md`
- `docs/DOCUMENTATION_HANDOFF_PROMPT.md`
- `docs/DOCUMENTATION_WORKFLOW.md`
- `docs/open-issues.md`
- `docs/future-implementation-ideas.md`
- `git status --short`

Then continue from the exact current page or topic recorded in the handoff.

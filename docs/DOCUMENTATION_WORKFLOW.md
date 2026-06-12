# Documentation workflow and style guide

Status: active
Owner: Nova / maintainers

## Purpose

This file is the persistent operating guide for the KubeClaw documentation effort.

Read it at the start of every documentation session, at the start of every documentation phase, and after every compaction. Also read `docs/DOCUMENTATION_HANDOFF_PROMPT.md` at each of those points. These files keep the documentation process consistent while we audit a large codebase over many passes.

## Core rule

Documentation must be technical, clear, and code-grounded.

Every claim about current behavior must be proven from source files, rendered Helm output, tests, scripts, Dockerfiles, or other source-controlled implementation artifacts. Do not write aspirational documentation as if it describes current behavior. If something is target-state, planned, uncertain, inconsistent, or broken, say so explicitly and record it in the right tracker.

Treat every currently available documentation file as potentially outdated source material to inspect, not as authoritative proof of current behavior. This includes all READMEs, archived docs, conventions files, skill descriptions, and existing public docs.

## Execution discipline

Work sequentially to avoid context overflow and stale partial edits:

- complete one phase at a time
- do not voluntarily stop until every phase in `docs/DOCUMENTATION_PLAN.md` is complete
- work on one target documentation file at a time within each phase
- inspect only the source files needed for the current file
- write or update that file, add source references only when they materially help the reader, run the most relevant focused check, then move on
- stop early only if genuinely blocked or forced to hand off because context is getting large
- when stopping early, stop only at a clean boundary after a completed file
- leave the next exact file to continue with in the session summary

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
   - bugs, inconsistencies, stale docs, unclear behavior, and simplification opportunities go to `docs/open-issues.md`
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

Each issue must include:

- status
- area
- priority
- source files checked
- problem
- impact
- next step

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

Then continue from the current phase in `docs/DOCUMENTATION_PLAN.md`, one target file at a time.

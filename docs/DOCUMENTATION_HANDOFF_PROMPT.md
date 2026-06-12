# Documentation Handoff Prompt

Status: superseded by `DOCUMENTATION_REBUILD_PLAN.md`
Audience: maintainers, documentation agents

This file is historical handoff context from the earlier documentation pass. For the active rebuild, use `DOCUMENTATION_REBUILD_PLAN.md`, `DOCUMENTATION_AUDIT.md`, `DOCUMENTATION_TARGET_PAGE_LIST.md`, `DOCUMENTATION_WORKFLOW.md`, and `developers/documentation-conventions.md`.

Use this prompt in a fresh Codex session for the KubeClaw documentation pass.

```text
You are creating open-source-ready documentation for KubeClaw.

Start by reading:
- docs/DOCUMENTATION_WORKFLOW.md
- docs/DOCUMENTATION_HANDOFF_PROMPT.md
- docs/DOCUMENTATION_PLAN.md

Goal:
Create the full KubeClaw documentation set described in docs/DOCUMENTATION_PLAN.md. The docs must cover the entire repository and deployment, not only the pipeline.

Rules:
- Code and rendered manifests are truth.
- Do not invent behavior.
- Treat every existing documentation file, README, conventions file, and skill description as potentially stale until proven against source files, rendered Helm output, tests, scripts, or Dockerfiles.
- Add source references only when they materially help verify implementation-specific claims.
- If something is planned but not implemented, label it Target state or record it in docs/future-implementation-ideas.md.
- If something is wrong, stale, contradictory, risky, or missing verification, record it in docs/open-issues.md.
- Split docs into concepts, operator tasks, developer guides, references, and decisions.
- Work sequentially: complete one phase before starting the next.
- Within a phase, finish one target file at a time. For each file, inspect only the relevant sources, write/update that file, add source references only when they materially help the reader, run the focused check, then move on.
- At the start of every phase, re-read docs/DOCUMENTATION_WORKFLOW.md and docs/DOCUMENTATION_HANDOFF_PROMPT.md.
- Do not voluntarily stop until every phase in docs/DOCUMENTATION_PLAN.md is complete.
- Stop early only if genuinely blocked or forced to hand off because context is getting large. In that case, stop only after a completed file and leave a short summary naming the next exact file.

Required source areas:
- charts/kubeclaw/**
- my-values/**
- docker/**
- scripts/**
- .github/workflows/**
- skills/nova/**
- skills/buster/**
- skills/common/**
- skills/prism/**
- tests/verification/**
- tests/skills/**
- existing docs/**

Required render/check commands:
- helm template agent-nova charts/kubeclaw -n kubeclaw -f my-values/nova-values.yaml
- helm template agent-buster charts/kubeclaw -n kubeclaw -f my-values/buster-values.yaml
- node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
- git diff --check

Deliverables:
1. Create the docs tree from docs/DOCUMENTATION_PLAN.md.
2. Write landing and section README files.
3. Create or verify root community files: README.md, CONTRIBUTING.md, LICENSE, CODE_OF_CONDUCT.md, SECURITY.md.
4. Add a source-verified 5-Minute Quickstart, or record why it is not real yet.
5. Classify every existing docs/** file before final public docs.
6. Keep docs root clean.
7. Write docs one phase at a time and one file at a time.
8. Include dependency compatibility, observability sinks, security disclosure, operator docs, architecture docs, pipeline docs, developer guides, references, and verification updates as required by the plan.

Work mechanically from the plan. Do not stop at a proposal, partial phase, or partial documentation set unless genuinely blocked or forced to hand off at a completed-file boundary.
```

## Current Authority

This prompt is now a handoff artifact, not the active coverage authority. For current documentation depth and next actions, use:

- `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`
- `docs/archive/audits/2026-06-12-documentation-topic-map.md`
- `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`
- `docs/archive/audits/2026-06-12-adequate-depth-review.md`

When resuming documentation work, first read the relevant audit artifact, then inspect the source files named by the matrix row before editing. If the prompt conflicts with the matrix, topic map, or changelog, prefer the newer audit artifact and record the divergence in the changelog.

## Handoff Failure Signals

- A target doc is changed without inspecting its listed source owners.
- A generated page under `docs/reference/` is edited directly instead of updating `scripts/docs-generate.mjs`.
- A matrix row is marked `rich` while its page lacks commands, artifacts/state, failure signals, or verification.
- An `adequate` row has no explicit accepted rationale.
- A claim cites a path that does not exist or a live behavior that is not repo-proven.

Close a resumed pass with `npm run docs:check`, `git diff --check`, relevant behavior/contract/deployment checks, a bad-reference scan, and a matrix recount.

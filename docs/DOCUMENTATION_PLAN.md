# Documentation Maintenance Plan

Status: current
Audience: maintainers, documentation contributors

## Goal

Keep one concise active documentation tree that describes current behavior, current risks, and current operator procedures. Use Git history and `docs/archive/` for historical implementation detail rather than accumulating resolved narratives in active pages.

## Source Order

When claims disagree, verify them in this order:

1. Runtime source and typed contracts.
2. Helm templates, values, scripts, and workflow definitions.
3. Contract, deployment, and behavior verification.
4. Generated documentation inventory.
5. Active prose documentation.
6. Archived material.

## Change Rules

- Replace obsolete behavior directly; do not append a migration diary.
- Keep future behavior in `ROADMAP.md` or `future-implementation-ideas.md`.
- Keep unresolved current defects and risks in `open-issues.md`; remove them when resolved.
- Cite the smallest canonical source owner.
- Do not duplicate exact generated values into multiple prose pages.
- State live-only prerequisites and verification boundaries honestly.
- Update diagrams and examples when their behavior changes.

## Required Closeout

```bash
npm run docs:check
git diff --check
```

Run deployment truth, pipeline contracts, or focused tests when a documentation change also changes a protected behavior claim.

## Current Priorities

1. Maintain the high-level truth established by the 2026-07-18 audit.
2. Document ClawDeck from the first production pipeline run as evidence becomes available.
3. Document the future core/extension boundary only as implementation lands.
4. Expand generated reference coverage where manually maintained exact values repeatedly drift.
5. Produce the deeper operator/reference pass after real production workload feedback.

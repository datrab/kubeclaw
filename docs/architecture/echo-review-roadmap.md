# Echo review roadmap

Status: active roadmap
Owner: `skills/nova/plugins/review`

This roadmap continues the canonical contract and policy foundation completed in
Phase 2. The normal pipeline review remains diff-focused, bounded, and fail-closed.
Whole-repository analysis is deliberately deferred until the current pipeline is
working and ClawDeck can support evaluation and operator control.

## Phase 3 — frozen review bundle and focused context map

Create `review-bundle.v1` as the immutable input boundary for one Echo review.
The bundle records the task, requirements, caller-supplied base, stage-time frozen head, changed files,
allowed scope, supplied evidence, resolved policy digest, and bundle digest.

Phase 3 also adds a lightweight deterministic context map. It is not a complete
repository knowledge graph. Its only purpose is selecting relevant context for the
current diff. It should contain, where available:

- changed files and directly affected symbols;
- direct callers, imports, and dependencies;
- package, plugin, and ownership boundaries;
- related public exports, contracts, schemas, configuration, and tests; and
- the deterministic reason each contextual item was included.

The map should reuse existing repository facts from TypeScript analysis, Knip,
dependency-cruiser, plugin manifests, contract registries, test configuration, and
Git. It may be cached by repository revision. Review-bundle construction enforces
file, byte, ownership, and dependency-depth limits. Echo may request at most one
bounded context expansion, which the plugin must validate and record.

Acceptance requires reproducible bundle digests, deterministic context selection,
explicit inclusion reasons, scope and size enforcement, and no unrestricted
whole-repository material in a normal review.

## Completed pipeline phases

1. Phase 3 added the immutable focused review bundle and bounded context map.
2. Phase 4 added independent semantic verification for Echo findings. Its plan
   and proof are in [echo-review-phase-4-plan.md](echo-review-phase-4-plan.md)
   and [echo-review-phase-4-design.md](echo-review-phase-4-design.md).
3. Phase 5 added deterministic, evidence-gated Simplification candidate mining. Its
   plan and proof are in [echo-review-phase-5-plan.md](echo-review-phase-5-plan.md)
   and [echo-review-phase-5-design.md](echo-review-phase-5-design.md).
4. Phase 6 added verified root-cause clustering, stable identities, deterministic
   ranking, and bounded repair batches. Its plan and proof are in
   [echo-review-phase-6-plan.md](echo-review-phase-6-plan.md) and
   [echo-review-phase-6-design.md](echo-review-phase-6-design.md).
5. Phase 7 activated `gate`, `lean`, and diff-focused `audit` behavior with
   immutable reports, bounded advisories, and retained follow-ups. Its plan and
   proof are in [echo-review-phase-7-plan.md](echo-review-phase-7-plan.md) and
   [echo-review-phase-7-design.md](echo-review-phase-7-design.md).
6. Phase 8 added the deterministic scope and repair-cycle governor. It freezes
   the first completed review baseline, measures later repair revisions against
   certified file, LOC, ownership, and cycle limits, and escalates scope breaks
   without changing core lifecycle authority. Its plan and proof are in
   [echo-review-phase-8-plan.md](echo-review-phase-8-plan.md) and
   [echo-review-phase-8-design.md](echo-review-phase-8-design.md).
7. Phase 9 hardening made frozen reviewed source citeable, added production
   context discovery, deterministic large-diff slicing, a conservative
   simplification fact producer, complete governor history failure reporting,
   and bug-focused reviewer guidance. Its design and evaluation are in
   [echo-review-phase-9-hardening.md](echo-review-phase-9-hardening.md) and
   [echo-review-phase-9-evaluation.md](echo-review-phase-9-evaluation.md).

## Remaining pipeline phases

1. Complete production closeout and prove that every policy setting has a real
   runtime consumer.

Each phase receives focused tests, contract and TypeScript checks, linting,
Terra/high independent review, an architecture audit, and a documented closeout before the
next phase starts.

## Deferred capability — repository graph and whole-codebase audit

After the current pipeline is operational, build a deterministic repository graph
for existing codebases. The graph may derive modules, symbols, dependencies,
ownership, contracts, tests, and architectural boundaries. This is a separate
platform capability, not a Phase 3 requirement.

The future `audit` operation may use that graph to review a complete repository in
bounded module or package slices. It produces a deduplicated backlog and never
feeds hundreds of findings into a normal Nova repair loop. ClawDeck should later
control graph construction, audit scheduling, policy selection, evaluation, and
result comparison.

The audit source is deliberately separate from the normal changed-file source.
It may reuse the same immutable commit proof and review-bundle primitives, but it
must require explicit operator authorization and a bounded repository or graph
manifest. Normal `gate` and `lean` runs never fall back to whole-project listing.

Until that capability exists, the operational `audit` policy profile remains
diff-focused. It does not scan a whole repository.

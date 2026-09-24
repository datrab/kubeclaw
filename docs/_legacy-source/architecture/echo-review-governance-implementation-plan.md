# Echo review governance implementation plan

Status: Phase 1 complete; Phases 2-10 planned  
Owner: `skills/nova/plugins/review`  
Baseline: `docs/architecture/echo-review-phase-1-baseline.md`

## Objective

Turn Echo review into a bounded, evidence-backed closeout gate that:

- blocks only on confirmed, in-scope P0 problems introduced by the reviewed change;
- uses deterministic simplification signals to find likely improvement opportunities;
- groups repeated symptoms under stable root causes;
- never sends an unbounded issue list into Nova's repair loop; and
- preserves the complete review record as an artifact for audit and follow-up work.

This is plugin behavior, not a reusable agent skill. The plugin owns policy,
contracts, validation, reduction, and artifacts. Echo owns semantic judgment behind
`runtime.dispatch`. The pipeline core remains unaware of Echo, simplification categories,
review priorities, or finding semantics.

## Invariants

1. Deterministic tools run before semantic review.
2. A review attempt uses a frozen task, Git range, owner scope, and evidence set.
3. Agent output is untrusted until it passes the plugin's closed contracts and
   mechanical verification.
4. Simplification must not remove validation, security, accessibility, error
   handling, tests, or data-loss protection.
5. Only confirmed P0 findings introduced by the current change can block.
6. Normal review output is bounded by root causes, not raw instance count.
7. Full details remain available in a machine-readable artifact.
8. The repair loop stops after two non-converging cycles or material scope growth.
9. No compatibility path survives the canonical cutover.
10. The full E2E matrix remains a separate operator-authorized closeout step.

## Target flow

```text
task + frozen Git range + evidence
                  |
                  v
       deterministic candidate miners
                  |
                  v
          frozen review bundle
                  |
                  v
            Echo reviewer
                  |
                  v
 closed contract + mechanical verification
                  |
                  v
 fingerprint + deduplicate + root-cause cluster
                  |
                  v
      scope governor + output budget
          |                   |
          v                   v
  bounded Nova repair   complete audit artifact
```

## Phase 1 — Baseline the current review

Deliverables:

- inventory the current plugin contracts, prompt, parser, reducer, tests, and
  runtime capability boundary;
- run the package tests and TypeScript build;
- measure behavior with 1, 10, and 100 repeated issues;
- measure behavior with an oversized evidence object;
- inspect representative recorded PASS, FAIL, noisy, and repeated-repair Echo
  runs and relevant Git history;
- inventory current callers, adjacent review ownership, remediation routing, and
  known parity boundaries;
- identify duplicated contract authorities and drift risks; and
- record known strengths, gaps, and comparison metrics.

Acceptance:

- the baseline report is reproducible from named commands and commits;
- current behavior is described without changing runtime code; and
- metrics that require ClawDeck-backed evaluation are explicitly deferred rather
  than inferred from weak historical data; and
- each later phase has a measurable before/after target.

Status: complete. See `echo-review-phase-1-baseline.md`.

## Phase 2 — Define the canonical finding contract

Add a closed `review-finding.v1` contract with:

- category: correctness, security, contract, architecture, or simplification;
- priority: P0-P3;
- source location: normalized path, symbol, and optional line/column hint;
- claim, evidence references, and smallest recommended fix;
- introduced-by-diff assertion;
- scope class: `in_scope_blocker`, `follow_up`, or `scope_break`;
- confidence;
- optional simplification category and net-LOC estimate; and
- optional root-cause hint supplied by Echo.

Keep fingerprints and final cluster identities out of agent-authored output. The
plugin computes them after verification.

Acceptance:

- JSON Schema and TypeScript representation agree;
- unknown fields and incomplete findings are rejected;
- contradictory priority/scope combinations are rejected;
- contract tests cover every enum and failure mode; and
- existing PASS/FAIL behavior has an explicit migration mapping.

## Phase 3 — Build the frozen review bundle

Replace loose task/evidence input with a versioned bundle containing:

- task identity, objective, and acceptance requirements;
- `baseSha`, `headSha`, changed files, changed owners, and non-test LOC;
- permitted owners and declared repair boundary;
- content-addressed diff, lint, test, contract, and behavior artifacts;
- bundle byte limit and per-artifact limits; and
- review mode and output policy.

The bundle builder must sort inputs deterministically and reject missing commits,
mutable references, undeclared artifacts, and oversized input.

Acceptance:

- identical inputs produce an identical bundle digest;
- the stage rejects unfrozen or oversized input before dispatch;
- Echo can reference only evidence identities present in the bundle; and
- tests cover changed-file, owner, and artifact-boundary tampering.

## Phase 4 — Add deterministic simplification candidate miners

Start in shadow mode with high-confidence candidates:

- `PT001`: unused new export;
- `PT002`: new dependency used for a trivial operation;
- `PT003`: interface or abstract class with one implementation;
- `PT004`: wrapper that only forwards arguments and results;
- `PT005`: new layer with one caller and no visible policy boundary;
- `PT006`: new configuration option with no alternate configured value;
- `PT007`: new helper duplicating an existing repository helper; and
- `PT008`: hand-written operation with a known platform primitive.

Reuse existing TypeScript, ESLint, Knip, dependency-cruiser, JSCPD, and package
metadata where possible. A candidate is evidence for Echo to inspect, never an
automatic finding.

Acceptance:

- every candidate contains a rule ID, exact location, evidence, and confidence;
- rule output is deterministic and independently tested;
- rules do not execute project code or add another general lint stack; and
- shadow-mode metrics distinguish generated, accepted, rejected, and uncertain
  candidates.

## Phase 5 — Upgrade Echo's structured review protocol

Give Echo the frozen bundle and candidate set. Require raw JSON matching the
canonical proposed-finding contract. The reviewer must:

- evaluate correctness, safety, contracts, and current-diff regressions first;
- evaluate simplification candidates only after blocker review;
- identify the smallest safe fix;
- classify scope explicitly; and
- decline findings when evidence is insufficient.

Acceptance:

- no prose outside the JSON contract is accepted;
- prompt and output construction are deterministic;
- malformed, contradictory, or unsupported output blocks safely; and
- tests cover PASS, blocker, follow-up, scope break, and insufficient evidence.

## Phase 6 — Verify, fingerprint, deduplicate, and cluster

Mechanically verify each proposal:

- the path and symbol exist;
- cited evidence is in the frozen bundle;
- the Git range supports the introduced-by-diff claim;
- the owner is within scope;
- the proposed simplification preserves protected behavior; and
- category and priority are permitted by the mode.

Compute a stable fingerprint from schema version, category, normalized path,
enclosing symbol, and normalized root cause. Cluster sibling instances into one
root cause with a representative finding and all locations.

Acceptance:

- line movement alone does not change a fingerprint;
- duplicate proposals produce one cluster;
- 100 identical instances produce one root cause and retain all 100 locations in
  the artifact; and
- unverifiable proposals cannot become blockers.

## Phase 7 — Add bounded review modes

Implement:

- `echo-gate`: current-diff P0 only, at most five root causes, blocking;
- `echo-lean`: at most three high-confidence simplifications, advisory; and
- `echo-audit`: explicit repository-wide backlog generation, never part of an
  automatic repair loop.

When gate mode has more than five distinct confirmed P0 root causes, return
`orchestrator_required` with the complete artifact instead of truncating or
starting a broad repair.

Acceptance:

- budgets apply to root causes rather than instances;
- normal pipeline output cannot exceed its configured budget;
- the complete verified result remains available as an artifact; and
- simplification findings do not block during initial rollout.

## Phase 8 — Add the scope and convergence governor

Before returning `request_fix`, require that a finding is introduced by the
current change, in the declared owner boundary, confirmed, P0, and repairable
without changing the task contract.

Return `orchestrator_required` when:

- changed owners exceed the allowed owners;
- changed file count or non-test LOC grows beyond the configured scope multiplier;
- two repair cycles do not converge;
- a proposed fix changes public behavior or the task contract; or
- verified blockers cannot fit within the root-cause budget.

Acceptance:

- no third automatic Echo-to-Nova repair cycle is possible;
- pre-existing findings become follow-ups;
- scope expansion is recorded with exact metrics; and
- recovery and replay reproduce the same governor decision.

## Phase 9 — Add targeted semantic verification

Use a second fresh Echo call only for semantic P0 proposals that passed mechanical
verification but are not directly proven by deterministic evidence. Give it only
the proposed blocker, relevant diff, cited contracts, minimal adjacent source, and
task boundary.

Verifier outcomes are `confirmed`, `rejected`, or `insufficient_evidence`. Only
`confirmed` can block.

Acceptance:

- deterministic failures do not spend a verifier call;
- the verifier cannot add findings or expand scope;
- insufficient evidence never becomes a blocker; and
- verifier inputs and decisions are content-addressed artifacts.

## Phase 10 — Shadow calibration and canonical cutover

Run the new path beside current behavior without blocking. Calibrate on small,
large, clean, failing, repetitive, and scope-breaking changes. Track:

- raw proposals and verified findings;
- candidate acceptance and false-positive rates;
- duplicate-to-cluster reduction;
- blockers shown to Nova;
- token, byte, and runtime cost;
- repair convergence; and
- reviewer/verifier disagreement.

After acceptance thresholds are met:

- make the governed review plugin authoritative;
- migrate all review call sites and tests;
- delete superseded prompts, parsers, schemas, readers, writers, fixtures, aliases,
  and compatibility behavior;
- prove legacy absence; and
- run contracts, plugin tests, TypeScript, lint, non-E2E suites, historical
  fixtures, and operator-authorized E2E separately.

Acceptance thresholds must be set from shadow data rather than invented now. The
cutover requires zero unverified blockers and zero unbounded normal-run output.

## Commit strategy

Each phase is one independently reviewable commit unless a phase needs to be split
to preserve a green tree. Runtime behavior does not change in Phase 1. Simplification
remains shadow-only through Phase 6 and advisory through the initial cutover.

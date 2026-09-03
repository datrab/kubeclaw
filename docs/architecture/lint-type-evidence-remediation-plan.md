# Type-evidence remediation plan

Status: approved implementation plan; remediation not started  
Audit date: 2026-09-03  
Audit tree: `agent/lint-type-evidence-audit` rebased onto `origin/main` at `4a1ef4847240c25d6da1784b15f2df9e96f124e9`

## Objective

Resolve or disposition every experimental type-evidence finding without hiding risk, weakening truthful boundary contracts, or converting assertions into ceremonial helper functions. Keep the audit nonblocking until the measured backlog reaches zero or every remaining occurrence has an approved, test-backed rule refinement.

## Frozen inventory

The exhaustive audit covers 839 eligible JavaScript and TypeScript files in three disjoint scans:

- Tracked production/non-test: 497 files, 540 findings across 165 files.
- Tests/fixtures: 335 files, 15 findings across 8 files.
- Generated or otherwise untracked: 7 files, zero findings. This scope contains
  one tracked generated contract and six untracked generated observer files.
- Combined: 839 files, 555 findings, zero overlap, zero missing files, and zero parser failures.

Finding ledger:

- `@typescript-eslint/no-unsafe-type-assertion`: 435 production findings across 141 files.
- `type-evidence/no-chained-type-assertions`: 31 production and 13 test findings.
- `type-evidence/no-unknown-returns`: 61 production and 1 test finding.
- `type-evidence/no-object-parameters`: 13 production and 1 test finding.
- `no-known-value-widening`, `no-unknown-type-aliases`, `no-widen-then-assert`, and `no-module-mocking`: zero findings; retain as regression guards.

The inventory must be regenerated at the start of remediation and represented as stable fingerprints (`tool`, `rule`, `path`, source line, occurrence). Every initial fingerprint must have exactly one terminal disposition.

## Dispositions

Each finding receives one of these outcomes:

1. **Fixed** — code now preserves or proves the type, with focused tests.
2. **Rule refined** — the report was a reproducible false positive; narrow the rule and add valid/invalid fixtures proving the boundary.
3. **Approved boundary** — the broad contract is genuinely owned by an external or serialization boundary. Prefer a named boundary type or parser. A narrow suppression is allowed only if the lint report continues to expose it and maintainers approve the rationale.
4. **Duplicate** — another fingerprint fixes the same root cause; record the owning fingerprint and prove both disappear together.

No finding may be dropped because a file moved, a scan target narrowed, or a rule was disabled. Blanket ESLint disables, `as any`, replacement double assertions, and unvalidated generic helpers are forbidden.

## Batch sequence

Run batches sequentially unless their file sets are disjoint. Each batch should stay below roughly 55 findings and should be a separate reviewable commit.

### 0. Freeze and classify the ledger

- Rerun all three exhaustive scans on current `origin/main`.
- Persist the machine-readable findings and coverage summary as CI artifacts.
- Assign every fingerprint to exactly one batch below.
- Record baseline counts, affected files, and rule versions.
- Acceptance: production plus test plus generated/untracked file counts equal the eligible-file inventory; all 555 baseline findings are assigned once; parser failures are zero.

### 1–4. Review-plugin unsafe assertions — 201 findings

Split the 201 findings under `skills/nova/plugins/review` into four deterministic path-sorted chunks of at most 55 findings. Keep files together where practical.

Preferred remediation order:

- Replace assertions after JSON/model output with existing schema parsers or discriminated guards.
- Preserve validated values through typed result objects instead of widening and reasserting.
- For internal construction, use `satisfies`, typed factories, or exhaustive constructors.
- Keep assertions only where runtime/library invariants prove them and encode that invariant in a named helper plus tests.

Acceptance per chunk: assigned fingerprints reach terminal dispositions, review-plugin unit tests and TypeScript build pass, and no new type-evidence fingerprint appears.

### 5. Buster suite-runtime unsafe assertions — 54 findings

Scope: `skills/buster/plugins/buster-suite-runtime`.

Prioritize CLI/config decoding, runtime service responses, suite payloads, and optional-module boundaries. Reuse canonical schema validation and value-boundary helpers. Run the complete suite-runtime package tests and affected real-runtime contract checks.

### 6. Plugin-runtime unsafe assertions — 48 findings

Scope: 42 findings in `skills/common/plugin-runtime/foundation` and 6 in `skills/common/plugin-runtime/sdk`.

Treat registry, capability, activation, isolation, and durable-record parsing as trust boundaries. Require fail-closed parsing and preserve immutable container types. Run foundation/SDK builds, registry contracts, lifecycle, isolation, and recovery tests.

### 7. Common-plugin unsafe assertions — 45 findings

Scope: all common plugins outside plugin-runtime, including agent observers, wait-store, notification/operator messaging, runtime dispatch, command/network transports, telemetry, and stores.

Group by shared transport/config boundary so one parser can remove duplicate assertions without creating cross-plugin coupling. Run each touched package test plus runtime-dispatch and observer integration contracts.

### 8–9. Nova non-review unsafe assertions — 74 findings

- Batch 8: lint (18) and buster-quality-gate (13): 31 findings.
- Batch 9: remaining Nova plugins: 43 findings.

Preserve plugin input/output protocols and avoid moving validation out of the owning plugin. Run all touched package tests, Nova TypeScript verification, generated-contract checks, and lint self-tests.

### 10. Remaining Buster unsafe assertions — 13 findings

Scope: `skills/buster/plugins/test-agent`.

Use typed test-plan/result constructors and validate external agent output before narrowing. Run test-agent package tests and its live-function contract.

### 11. Production chained assertions — 31 findings

Scope: 17 files across contracts, plugin-runtime, Buster, Nova core/plugins, and common plugins.

Classify the source of missing evidence before editing. Replace `value as unknown as T` and equivalent chains with validation, a truthful adapter contract, or a typed constructor. Contract-validator findings require runtime schema proof before narrowing. Run each owning package and contract suite.

### 12. Test and fixture findings — 15 findings

Scope: 13 chained assertions, one broad `object` parameter, and one `unknown` return.

Prefer typed fixture builders and `satisfies` over double assertions. If a test intentionally constructs invalid state, expose a narrowly named unsafe fixture helper that is confined to tests and documents which invariant it violates. Do not weaken production rules to accommodate test fabrication.

### 13–15. Unknown return contracts — 61 production findings

- Batch 13: OpenClaw agent observer — 19 findings.
- Batch 14: Buster suite-runtime (10) and runtime-dispatch (8) — 18 findings.
- Batch 15: remaining contracts, plugin-runtime, plugins, Nova project setup, and Prism — 24 findings.

For each return, decide whether the function owns parsing. Internal functions should return a named parsed contract. True ingress functions may return `unknown` only when the caller is explicitly responsible for validation; encode that responsibility in the API name/type and test the handoff. Never replace `unknown` with `any` or an unjustified generic.

### 16. Broad object parameters — 13 production findings

Scope: contract validators, plugin-runtime, review, transport publisher, and Prism session encoding.

Replace `object` with the smallest named structural contract. For third-party constructor shims such as Ajv adapters, derive or import the real callable interface when stable; otherwise keep a narrow compatibility boundary with a fixture proving the external shape. The separate test occurrence is owned by batch 12.

### 17. Zero-finding regression guards and promotion decision

- Rerun both scans and prove zero unassigned/new findings.
- Verify zero-finding guards remain active with dedicated violating fixtures.
- Measure false-positive rates by rule and production/test scope.
- Promote only rules with zero unresolved findings, stable fixtures, and maintainer approval through the existing rule-admission ledger.
- Keep high-volume or boundary-sensitive rules audit-only until their precision is demonstrated on historical commits.

## Acceptance gate for every remediation batch

1. Freeze the batch fingerprint list before editing.
2. Inspect the real producer, consumer, and runtime boundary for each finding.
3. Make the smallest ownership-correct change.
4. Add or update focused positive and negative tests.
5. Run the affected package test, TypeScript build, blocking ESLint, and all three experimental scans.
6. Prove assigned fingerprints are terminally dispositioned and no new fingerprints appeared.
7. Run Autoreview on the batch commit and verify every proposed finding against the code.
8. Record before/after counts and dispositions in the remediation ledger.

## Final completion criteria

- All 555 initial fingerprints have exactly one terminal disposition.
- Production, test, and generated/untracked scans remain exhaustive, disjoint, and parser-clean.
- Active findings are zero, or every remaining approved boundary is represented by an auditable, unsuppressible structured record.
- No new blocking-lint debt is introduced.
- Complete package, TypeScript, generated-config, Helm, and plugin verification passes.
- Final Autoreview is clean.

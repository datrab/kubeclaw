# Full-lint remediation plan

Status: actionable implementation plan; remediation not started
Audit date: 2026-09-03
Branch: `agent/lint-type-evidence-audit`

## Objective

Bring the complete repository lint lifecycle to a reproducible clean result without
baselining active risk, weakening rules to hide valid findings, or mixing unrelated
ownership changes into unreviewable patches. The known inventory contains 422
blocking findings and 555 experimental type-evidence findings. One required scanner
failed, so the inventory remains open until that scanner produces valid evidence.

## Frozen inventory

The last full run invoked 24 tools and reported:

- 422 blocking findings: 279 errors and 143 warnings.
- 555 audit-only type-evidence findings.
- 0 baselined findings.
- 23 successful tools and 1 failed tool (`trivy-kubernetes`).
- 977 known findings in total.

Blocking findings by tool:

| Tool | Findings | Principal rule or ownership groups |
| --- | ---: | --- |
| ESLint | 198 | depth 60; complexity 45; generic ESLint 29; function size 26; swallowed errors 18; file size 10; other 10 |
| npm audit | 72 | 66 moderate; 6 high; root 25, spikes 44, Docker 3 |
| Semgrep | 46 | 45 raw-SQL boundary findings; 1 unsanitized React href |
| JSCPD | 23 | review 8; operator messaging 6; scripts 4; remaining 5 |
| govulncheck | 21 | eight vulnerability IDs across root/module and command paths |
| Knip | 20 | 14 files; 3 unlisted dependencies; 2 exports; 1 dev dependency |
| Hadolint | 13 | 8 unpinned image tags; 4 root-user findings; 1 working-directory finding |
| gocyclo | 12 | command code 7; observability contracts 5 |
| Kubernetes policy | 8 | 6 secret-reference findings; 2 required-runtime-env findings |
| shfmt | 5 | scripts 3; Docker 1; verification tests 1 |
| staticcheck | 2 | ST1005 and U1000 in command code |
| TypeScript | 1 | TS2307 in `spikes` |
| ShellCheck | 1 | SC2034 in `scripts` |

The type-evidence inventory and its exact 555-finding disposition batches are owned
by [lint-type-evidence-remediation-plan.md](./lint-type-evidence-remediation-plan.md).
Its three disjoint scopes cover 497 tracked production files, 335 tracked tests or
fixtures, and 7 generated or otherwise untracked files, with zero parser failures.

## Ledger and disposition rules

Before editing product code, emit a machine-readable ledger keyed by stable
fingerprint (`tool`, `rule`, `path`, source evidence, occurrence). Every initial and
newly discovered fingerprint must be assigned to exactly one batch and end as one of:

1. **Fixed** — the root cause is removed and focused verification passes.
2. **Upstream remediated** — a dependency or toolchain upgrade removes the verified
   vulnerability without suppressing it.
3. **Rule refined** — a reproducible false positive is narrowed with positive and
   negative rule fixtures.
4. **Approved boundary** — a real exception is documented narrowly, remains visible
   in structured output, has an owner and expiry, and is explicitly approved.
5. **Duplicate** — another fingerprint owns the same root cause and both disappear
   together.

Deleting evidence, broad ignores, blanket disables, severity downgrades, and
unapproved baseline entries are not valid dispositions.

## Ordered remediation batches

Keep each batch independently reviewable. Batches in the same phase may run in
parallel only when their file sets and dependency lockfiles are disjoint.

### Phase A — restore complete and reproducible evidence

#### A0. Fix full-run inputs and the failed Trivy scan

- Replace the missing `Projects/buster-infra-smoke/src/deployment.yaml` policy input
  with a repository-owned canonical fixture or fail configuration validation with a
  clear ownership error.
- Supply the Prism chart's required `postgresql.existingSecret` through a committed,
  non-secret lint values file; never embed a credential value.
- Run all 24 tools with canonical binary paths and persist the structured report.
- Add every newly exposed Trivy fingerprint to the ledger before any remediation.
- Acceptance: 24 successful or explicitly not-applicable tools, zero tool failures,
  and identical tracked-source counts on two consecutive clean-checkout runs.

#### A1. Freeze the complete ledger and batch map

- Capture all blocking and experimental fingerprints after A0.
- Prove every fingerprint is assigned once and only once below.
- Record tool versions, policy/config digests, commit SHA, generated-file inventory,
  and package-lock digests.
- Acceptance: ledger cardinality equals the report totals and no unassigned finding
  exists. If Trivy adds findings, create bounded `K` batches before Phase E.

### Phase B — deterministic compiler, formatter, and Go findings (21 known)

#### B1. TypeScript and shell correctness — 7 findings

- Resolve the TS2307 module boundary in `spikes` without path aliases that hide a
  missing package contract.
- Fix SC2034 and the five `shfmt` findings in their owning scripts.
- Verify TypeScript, ShellCheck, shfmt, and every affected script smoke test.

#### B2. Staticcheck correctness — 2 findings

- Fix ST1005 and U1000 in command code; do not suppress unused behavior.
- Run unit tests, `go vet`, and `staticcheck` for the owning Go modules.

#### B3. Go complexity — 12 findings

- Split into command code (7) and pipeline-observability contracts (5), preserving
  behavior with characterization tests before extraction.
- Prefer named domain operations over mechanical helper fragmentation.
- Acceptance: all 12 `go-complexity` fingerprints disappear and contract/golden tests
  remain unchanged.

### Phase C — ESLint structural debt (198 known)

Use path-stable sub-ledgers and keep each patch near 30–45 findings.

#### C1–C2. Scripts — 72 findings

- C1: complexity/depth and swallowed-error findings, path-sorted first half.
- C2: function/file size and remaining rules, path-sorted second half.
- Preserve CLI exit codes, cleanup, and error reporting with script-level tests.

#### C3. Plugin-runtime foundation and Buster size-budget — 38 findings

- Foundation 20; size-budget 18.
- Refactor at registry/budget ownership boundaries; do not move complexity into
  untyped utilities.

#### C4. Command runner and review plugin — 28 findings

- Command runner 14; review plugin 14.
- Protect subprocess cancellation, review scheduling, and recovery behavior with
  focused integration tests.

#### C5. Buster runtime and lint plugin — 19 findings

- Buster suite-runtime 11; lint plugin 8.
- Preserve fail-closed parsing and deterministic structured reports.

#### C6. Transport publisher, JUnit adapter, and runtime dispatch — 19 findings

- Transport publisher 7; JUnit 6; runtime dispatch 6.
- Keep retry, idempotency, and remote-session semantics explicit.

#### C7. Remaining ESLint owners — 22 findings

- Direct command 5; operator messaging 5; all smaller owners 12.
- Split further if a patch crosses unrelated package ownership.

Acceptance for C1–C7: assigned fingerprints reach terminal disposition, no new ESLint
fingerprints appear, affected package tests pass, and repository blocking ESLint is
rerun after every batch.

### Phase D — dead code and duplication (43 known)

#### D1. Knip files — 14 findings

- Verify each entrypoint before deletion; remove generated/runtime-loaded files only
  when their dynamic registration path is proven absent.
- Update generator-owned Knip configuration only for real dynamic ownership.

#### D2. Knip dependency/export contracts — 6 findings

- Resolve 3 unlisted dependencies, 2 unused exports, and 1 dev-dependency mismatch.
- Run package builds from clean installs so hoisting cannot hide undeclared imports.

#### D3. Review and operator-messaging duplication — 14 findings

- Review 8; operator messaging 6.
- Consolidate only shared behavior with the same lifecycle and error contract.

#### D4. Remaining duplication — 9 findings

- Scripts 4; contracts/plugin-runtime/verification/other 5.
- Reject coincidental clones whose ownership or failure semantics differ, using a
  fixture-backed rule refinement rather than a blanket exclusion.

### Phase E — dependency and security findings (152 known, plus A0 discoveries)

#### E1. Root npm dependency graph — 25 findings

- Map advisories to direct dependency chains; upgrade the smallest compatible direct
  set and regenerate the lockfile deterministically.
- Run all 42 plugin packages and root build/test gates.

#### E2–E3. Spike dependency graphs — 44 findings

- Split spikes into two lockfile-disjoint batches of at most 25 findings.
- Spikes remain in scope: update, remove, or explicitly retire each vulnerable spike;
  do not suppress findings because code is experimental.

#### E4. Docker npm graph — 3 findings

- Upgrade the container-owned dependency graph and rebuild/scan the real image.

#### E5. Go vulnerability graph — 21 findings

- Group the eight GO advisory IDs by the direct module upgrade that resolves them.
- Verify root/module API compatibility, unit tests, race-sensitive paths where
  relevant, and a clean `govulncheck` result.

#### E6–E7. Raw SQL boundaries — 45 findings

- E6: production `skills` paths, first path-stable half.
- E7: remaining `skills` and `spikes` paths.
- Replace construction at the data-owner boundary with parameterized/query-builder
  APIs. Refine the rule only when a parser proves the reported text is not executable
  SQL.

#### E8. Unsanitized React href — 1 finding

- Validate the allowed URL schemes at ingress and test dangerous schemes.

#### E9. Dockerfile policy — 13 findings

- Pin eight base images by immutable digest, remove four root-runtime paths or justify
  a narrowly scoped build-only root stage, and replace the single `cd` with `WORKDIR`.
- Build and scan every affected image.

### Phase F — Kubernetes findings (8 known, plus Trivy discoveries)

#### F1. Secret references — 6 findings

- Correct secret-key ownership in the KubeClaw chart and render all supported value
  combinations with placeholder secret names only.

#### F2. Required runtime environment — 2 findings

- Add or correctly derive the required runtime environment fields and verify chart,
  deployment, and startup contracts together.

#### F3–Fn. Trivy findings discovered by A0

- Group by Trivy rule and owning chart, maximum 25 fingerprints per batch.
- Never mark the scanner clean by omitting charts or required values.

### Phase G — type-evidence remediation (555 known)

Execute stages 0–17 from
[lint-type-evidence-remediation-plan.md](./lint-type-evidence-remediation-plan.md).
Those stages include ten bounded unsafe-assertion batches and dedicated batches for
chained assertions, `unknown` returns, broad `object` parameters, test fixtures, and
zero-finding regression guards. Keep these rules audit-only until their measured
precision supports promotion.

### Phase H — final enforcement and clean-room proof

#### H1. Full clean-checkout proof

- Run the full 24-tool lifecycle twice from a clean checkout with generated artifacts
  absent, then once after normal code generation.
- Require zero blocking findings, zero tool failures, zero unassigned experimental
  findings, zero overlap/missing files across evidence scopes, and stable fingerprints.

#### H2. Rule admission and debt review

- Promote experimental rules individually only after their active backlog is zero and
  their false-positive ledger is accepted.
- Any approved boundary remains structured, visible, owned, expiring, and
  unsuppressible in aggregate reporting.

## Gate for every remediation batch

1. Freeze assigned fingerprints and owning tests before editing.
2. Inspect the producer, consumer, runtime boundary, and dependency/tool documentation.
3. Fix the smallest correct ownership boundary; avoid broad rewrites.
4. Add focused positive, negative, and failure-path tests.
5. Run affected package tests and the owning lint tool.
6. Rerun blocking ESLint and all three type-evidence audits.
7. Prove assigned fingerprints are terminal and no new fingerprints appeared.
8. Run Terra/high Autoreview on the batch diff and verify every proposed finding.
9. Commit one coherent batch and record before/after counts in the ledger.

## Completion criteria

- Every known and A0-discovered fingerprint has one terminal disposition.
- All required tools complete with zero operational failures.
- Blocking findings and unapproved active debt are zero.
- Type-evidence production, test, and generated/untracked scopes remain exhaustive,
  disjoint, parser-clean, and stable across generation state.
- Complete package, TypeScript, Go, shell, image, Helm, Kubernetes, generated-config,
  and plugin verification passes.
- Final Terra/high Autoreview is clean.

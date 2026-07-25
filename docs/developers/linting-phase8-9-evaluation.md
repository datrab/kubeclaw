# Linting Phase 8 And 9 Evaluation

Status: evaluated with unresolved rollout blockers
Date: July 21, 2026
Scope: Nova's canonical lint reporter, Echo-facing quality evidence, and the repository sources inspected by that reporter. Buster remains the testing owner; no Buster test-runner repair is part of this work.

## Result

The suite is opinionated and substantially fail-closed, but it is not yet a clean, reproducible production gate. Its controls correctly expose genuine new debt. They also expose two rollout defects that must be fixed before acceptance:

- the deployed live runtime does not contain all required pinned lint binaries;
- TypeScript results depend on where the shared JavaScript dependencies are mounted.

No new baseline entries were added during this evaluation. Genuine new findings remain blocking.

## Phase 8: Historical Calibration

The initial rule-admission record was invalid: its three commits did not contain ESLint-applicable changed files. The policy now names three representative JavaScript/TypeScript changes:

- `c33020319b13ac0054622812eb454a828b0d5f74`: 55 applicable files, 225 actionable findings after calibration;
- `c73802816dc86b0d4a84c2dcd64109db85ea26c4`: five applicable files, six actionable findings;
- `ffd21d25af8e0e3547f948c83210c7bd62d53353`: six applicable files, 62 actionable findings.

Manual classification found two shared false-positive patterns:

- Generated telemetry types were being judged by hand-written file-size rules. The exact generated file is now excluded from production cohesion budgets.
- Intentional terminal output in canonical CLI/logging boundaries was being treated as unstructured application logging. `no-console` is now disabled only for declared script, command, and logger boundaries; service and suite code remains blocking.

The remaining findings describe complexity, large cohesive units requiring review, direct environment access, hardcoded defaults, fallback chains, swallowed errors, mutable module state, or bypassed structured logging. These are actionable under the agreed principles.

A temporary deliberate changed-file probe was then run through the canonical reporter. It produced unmatched blocking findings from TypeScript, ESLint, and Knip. This proves that new violations do not disappear into the existing baseline.

## Current Repository Evidence

An isolated committed-snapshot run using the runtime-like dependency mount produced:

```text
131 errors
19 warnings
150 blocking findings
16,488 baselined findings
11 tools successful
9 tools failed
```

The active findings were:

- TypeScript: 25;
- ESLint: 81;
- Knip: 15;
- JSCPD: eight;
- npm audit: 19 moderate advisories;
- Helm lint: two environmental artifacts caused by a temporary dependency symlink inside the chart, not chart defects.

The nine execution failures included seven genuinely missing runtime tools: Gofmt, Go vet, Gocyclo, shfmt, the Go import-boundary check, Staticcheck, and govulncheck. Kubeconform and Trivy were additionally affected by the temporary chart-local dependency mount used to reproduce runtime JavaScript resolution. Clean Helm/Kubeconform verification succeeds when that mount is absent.

The shared dirty checkout produced 652 blocking findings. Those changes belong to concurrent observability work and were not modified or baselined by this evaluation. Their visibility proves that the ratchet detects new debt.

TypeScript is not deterministic across supported-looking local layouts. A repository-root dependency mount produced 492 active TypeScript findings, while the runtime-like config mount produced 25. The TypeScript projects need one explicit dependency/type-resolution layout shared by local and CI execution.

## Empty-Baseline Stress Calibration (July 21, 2026)

The pinned runtime tools and canonical `/home/node/.openclaw` configuration were installed temporarily, and the approved runtime baseline was replaced with a valid empty baseline. A full repository run completed with all 20 tools successful and no hidden fallback execution:

```text
10,301 errors
29 warnings
10,330 blocking occurrences
0 baselined findings
20 tools successful
0 tools failed
```

Systematic noise was corrected without admitting new debt:

- TypeScript diagnostics are deduplicated across projects only when file, source location, code, severity, and message are identical. Overlapping projects fell from 14,233 repeated occurrences to 8,042 source-located diagnostics.
- Knip's two invalid pipeline entry paths now name the real Buster and Nova entrypoints. This first calibration reduced findings from 543 to 527; the subsequent dead-code audit below resolved the remainder.
- Gocyclo excludes vendored, generated, and `node_modules` source through its native `-ignore` option. Findings fell from six to four genuine repository functions.
- Generated telemetry TypeScript and Go contracts are excluded from duplication analysis. JSCPD findings fell from 306 to 293.
- Dependency Cruiser reports strongly connected components rather than every route through the same cycle. Forty-five route findings became two actionable components: one 36-module component and one two-module component.
- Explicit CLI, script, logger, and output-adapter files may use terminal output. ESLint findings fell from 1,505 to 1,428. Console calls remaining in services, runners, and suites still block as structured-logging debt.
- Trivy's exact `KSV-0109` false positive for Semgrep secret-pattern examples inside `agent-nova-swarm-config` is filtered only when the canonical resource and lint payload are present. The approval is owned, justified, tracked, and expires October 20, 2026. The two genuine read-only-root-filesystem findings remain.

The stress-run snapshot contained code and dependency debt rather than an approved baseline: 8,042 TypeScript diagnostics, 1,428 ESLint findings, 527 Knip findings, 293 duplication findings, two circular components, four Go complexity findings, two Go formatting findings, one shell formatting finding, two Kubernetes security findings, and 17 moderate dependency advisories. The Knip count was subsequently reduced to zero by the audit below. Concurrent observability changes remain part of this dirty-checkout measurement.

## Knip Dead-Code Audit (July 21, 2026)

Every one of the 527 configured Knip findings was classified rather than baselined:

- Five stale declaration-file shadows were genuinely dead and were deleted. Each duplicated a typed `.ts` implementation that TypeScript already resolves canonically.
- 188 unused export modifiers were removed from internally used implementations. The implementations were retained because they are live; only their unsupported public surface was dead. ESLint reported no newly unused local declarations after this change.
- Canonical command entrypoints, packaged runtime facades, and dynamically loaded public contract surfaces were declared explicitly as Knip entries. These were reachability false positives, not dead code.
- Runtime-provided dependencies were ignored only through an exact allowlist. A policy test requires each non-virtual ignored dependency to be pinned in `docker/general-tools/package.json`; virtual runtime modules have a separate fixed allowlist.

The canonical runtime configuration now reports zero findings across Knip's configured files, exports, types, dependencies, unlisted dependencies, and unresolved-import categories. No Knip fingerprints were added to the baseline.

## Structural Duplication Follow-up (July 22, 2026)

The production and test clone audits are complete with an empty baseline:

- Nova/Buster shared capabilities moved to Common while the runtime-overwritten repo facades remain available for direct repository tests.
- Repeated Nova and Buster implementation blocks were consolidated within their owning subsystem.
- The OpenClaw observer and Common now consume one neutral, versioned `contracts/agent-observability/v1` contract. Their facades no longer contain copied mapping, routing, type, or validation implementations.
- Production sources retain the strict 10-line/70-token threshold. Tests use a dedicated 18-line/100-token calibration so large fixtures and behavioral flows remain checked without forcing small assertion sequences behind opaque helpers.

Both canonical JSCPD passes now report zero clones. Knip and Dependency Cruiser also report zero findings and zero circular components. The empty-baseline full report has 9,376 remaining blocking findings: 7,965 TypeScript diagnostics and 1,411 ESLint findings. All other configured tools are clean.

## Phase 9: Vertical Slice Verdict

- Reporter correctness and canonical policy: **pass**. Required failures block and policy/report evidence is typed and digested.
- TypeScript and ESLint: **partial**. Projects and rules are explicit, but TypeScript output changes with dependency layout and 25 unmatched diagnostics remain in the runtime-like snapshot.
- Go and Terraform: **partial**. Adapters, pins, scopes, and tests exist. Required Go binaries are absent from the live runtime. Terraform correctly remains inactive because no Terraform root is declared.
- YAML, Helm, and Kubernetes: **partial**. Explicit rendering and schema paths pass clean verification, but live Trivy is unavailable.
- Architecture and cycles: **pass**. Dependency Cruiser is the sole JavaScript/TypeScript graph authority and produced no active architecture findings.
- Dead code and unused exports: **pass after follow-up audit**. Knip reports zero configured findings with an empty baseline.
- Structural duplication: **pass after follow-up audit**. Separate production and test JSCPD calibrations both report zero clones with an empty baseline.
- Complexity and cohesion: **partial**. Historical noise was corrected; 81 unmatched ESLint findings remain in the isolated snapshot.
- Environment/settings/fallback discipline: **partial**. Rules reliably report violations, but genuine unmatched violations remain.
- Baseline and ratchet: **partial**. The deliberate probe blocks and suppression metadata is strict, but a committed snapshot is not clean and TypeScript fingerprints vary by environment.

## P00-P25 Control

`Control` describes whether the lint suite has one enforceable authority. `Repository` describes whether the evaluated source/runtime currently satisfies it.

- P00 smallest clear solution — control: pass; repository: fail because active typing and complexity findings remain.
- P01 one canonical implementation — control: pass; repository: pass for lint capability ownership.
- P02 one explicit path, no hidden fallbacks — control: pass; repository: partial because local dependency wiring differs from runtime wiring.
- P03 dependency direction and boundaries — control: pass; repository: pass with zero active graph findings.
- P04 typed validated settings — control: pass; repository: pass.
- P05 environment variables only for infrastructure/secrets — control: pass; repository: fail with active direct-access/default findings.
- P06 small cohesive files/functions — control: pass; repository: fail with active size and complexity findings.
- P07 obvious code over clever indirection — control: pass where static analysis is reliable; repository: fail with active nesting/fallback findings.
- P08 delete dead compatibility code — control: pass; repository: pass after the Knip audit.
- P09 explicit dependencies and no hidden global state — control: pass; repository: fail with active mutable-state and dependency findings.
- P10 intentional error handling — control: pass; repository: fail with active swallowed-error findings.
- P11 observable-behavior tests — control: pass for lint adapter contracts; full ownership remains with the testing pod.
- P12 deterministic local/CI execution — control: partial; repository/runtime: fail because tools are missing and TypeScript evidence changes by mount layout.
- P13 strong typing and explicit boundaries — control: pass; repository: fail with unmatched TypeScript diagnostics.
- P14 enforced module dependency rules — control: pass; repository: pass.
- P15 circular dependency detection — control: pass; repository: pass for new findings; existing approved debt remains expiring.
- P16 dead code and unused exports — control: pass; repository: pass after the Knip audit.
- P17 complexity limits — control: pass; repository: fail with active findings.
- P18 dependency and vulnerability scanning — control: pass; repository/runtime: fail with 19 advisories and missing live scanners.
- P19 naming and folder conventions — control: pass; repository: pass in the calibrated samples.
- P20 structured errors and logging — control: pass; repository: fail with active console/swallowed-error findings.
- P21 deterministic tests — control: pass for offline adapter fixtures; full testing-pod compliance was not audited.
- P22 configuration and failure-path tests — control: pass; 82 focused lint tests and 73 validator controls pass.
- P23 no old/new dual implementation — control: pass; repository: pass for the lint runner cutover.
- P24 justified expiring suppressions — control: pass; repository: pass. Existing groups have approval metadata and expire October 20, 2026.
- P25 strict quality ratchet — control: pass; repository rollout: partial because the deliberate probe blocks but the committed snapshot and environment are not clean.

## Required Closeout Before Production Acceptance

1. Rebuild and deploy the general runtime containing every required pinned binary, then prove its inventory from inside the live Nova pod.
2. Define one TypeScript dependency and ambient-type layout used unchanged by local commands and CI/runtime execution.
3. Fix the unmatched TypeScript and ESLint findings, or separately approve narrowly scoped expiring baseline entries. Do not bulk-baseline them as calibration noise.
4. Run the canonical full report from a clean checkout in the rebuilt runtime and require zero active findings and zero failed tools.
5. Re-run the deliberate violation probe in CI and prove the same normalized finding fingerprints and blocking result.

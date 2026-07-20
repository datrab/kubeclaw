# Linting Improvement Implementation Plan

Status: active plan
Audience: developers, maintainers, pipeline owners

## Objective

Build an opinionated, deterministic, low-noise static-analysis suite that uses one explicit execution path, one authority per capability, and the smallest clear implementation.

This plan implements the target contract in `linting-improvement-audit.md`. Each phase is a vertical slice with source, configuration, tests, documentation, and runtime dependencies completed together.

## Non-Negotiable Rules

- A required check that did not run is a pipeline failure, never a warning or clean result.
- One tool owns each capability. Overlap requires an explicit, tested justification.
- There is no permanent warning backlog: findings are blocking, baselined with expiry, or experimental and hidden from normal output.
- Project roots, tool configs, scopes, and architecture boundaries are explicit settings.
- Local and CI execution call the same implementation.
- Environment variables may provide infrastructure endpoints, credentials, and secrets only. They do not select lint rules or policy.
- Existing debt may be fingerprinted temporarily; new debt blocks immediately.
- Superseded execution paths are deleted during cutover.

## Phase 1: Trustworthy Evidence (implemented July 20, 2026)

Goal: make every report an authoritative statement that all required applicable checks executed correctly.

Deliverables:

- Required missing binaries are execution failures.
- Missing or invalid required native configuration is an execution failure.
- Timeouts, crashes, and output parse failures are execution failures.
- `not_applicable` is distinct from execution failure and source success.
- Reports and cached/imported evidence use a versioned validated schema.
- The pipeline validates a report before accepting it.
- Reporter-path and native-config discovery fallbacks are removed.
- The lint cache is removed until a complete authority fingerprint exists.
- Focused tests cover required missing tools, missing config, malformed output, malformed report, exact configured paths, and repeated uncached execution.

Exit criteria:

- No applicable required check can skip successfully.
- No malformed report can be interpreted as zero findings.
- Running the same request twice executes the reporter twice.
- Focused lint tests, strict report-contract type checking, existing skill syntax checks, documentation checks, and diff checks pass.

Implementation note: the unsafe lint cache was removed. It may return only after Phase 2 can prove complete policy, configuration, reporter, source, and toolchain identity.

Verification evidence:

- 33 focused lint/config tests pass.
- The validator control contract passes 73 checks.
- The new report contract passes a standalone strict TypeScript check.
- Existing skill syntax checks pass.
- Documentation, reference, generated inventory, coverage, and diff checks pass.
- A real full report classifies the observed Semgrep parser crash as `tools_failed: 1` with code `semgrep-parse-failed`; it no longer reports the failed execution as a successful tool warning.

The repository-wide `skills/nova/tsconfig.json` strict check still has extensive pre-existing migration errors and missing ambient-type wiring. Phase 3 makes those projects explicit and reportable; it does not hide or silently baseline their failures.

## Phase 2: Canonical Policy And Explicit Scope (implemented July 20, 2026)

Goal: move project policy out of runner code and eliminate heuristic project discovery.

Deliverables:

- One versioned, typed lint-policy schema.
- Explicit project/module roots and enabled languages.
- Explicit tool requirement, category, scope, timeout, config path, and blocking severity.
- Explicit generated/vendor exclusions.
- Explicit architecture layer graph.
- Native configuration files referenced once by the central policy.
- Adapter registry generated from validated policy rather than scattered constants.
- Policy/config/reporter/tool digests designed before any cache is reconsidered.

Exit criteria:

- No recursive marker search chooses project authority.
- No tool chooses its own global scope or severity.
- Invalid or missing policy fails before tool execution.
- Local and deployed policy paths are explicit invocation inputs, not fallbacks.

Implementation evidence:

- `pipeline_lint_policy.v1` validates project roots, language evidence, tools, categories, scopes, tiers, timeouts, blocking thresholds, native config paths, exclusions, and architecture layers.
- The chart deploys one `lint-policy.json`; pipeline configuration passes its exact path and exact project id.
- ESLint and Semgrep config paths now exist only in the policy.
- The runtime registry is assembled from policy plus execution-only adapters and rejects adapters missing policy ownership.
- Reports use `pipeline_lint_report.v3`, include policy/config digests and per-tool policy metadata, and enforce `summary.total_blocking`.
- Marker search no longer selects a project. The selected policy project owns the root and the declared language-evidence patterns.
- The cache remains removed. Reporter and toolchain binary digests are intentionally prerequisites for any later cache proposal.

## Phase 3: Correct Existing Language Coverage (implemented July 20, 2026)

Goal: make current JavaScript, TypeScript, Python, shell, Docker, YAML, Helm, and Kubernetes checks precise and non-overlapping.

Deliverables:

- TypeScript-aware ESLint configuration and explicit TS project roots.
- `tsc` once per affected configured project.
- Ruff and mypy against explicit Python roots.
- ShellCheck plus canonical shell formatting.
- Explicit Dockerfile roots for Hadolint.
- Explicit Yamllint configuration and roots.
- Helm lint against explicit chart roots.
- Deterministic Helm rendering before Kubeconform.
- Separate `format`, `lint`, `types`, and `manifests` categories.

Exit criteria:

- Nested TypeScript projects cannot be missed.
- Raw Helm templates are never passed directly to Kubeconform.
- Repository-wide YAML noise is replaced with actionable scoped findings.
- Each rule has one owner.

Implementation evidence:

- `pipeline_lint_policy.v2` requires explicit targets for every tool; missing or escaping targets fail before execution.
- Seven TypeScript projects are named by exact `tsconfig.json` path. `tsc` runs once per affected configured project, including nested projects.
- ESLint parses JS, JSX, TS, and TSX through the pinned `typescript-eslint` parser. Premature maintainability warnings were removed until Phase 6 admission and ratchet support.
- The workspace currently has no Python source or Python project root, so Python is not enabled for this project. Ruff/mypy adapters remain available for a future explicit Python project rather than pretending `.` is a Python root.
- ShellCheck is restricted to warning-or-higher correctness signals. Pinned shfmt owns shell formatting with policy-declared arguments, and the declared shell roots were normalized once.
- Hadolint owns eight exact Dockerfiles. Yamllint owns explicit non-template YAML roots and one explicit low-noise config.
- Helm lint owns the exact `charts/kubeclaw` chart. Kubeconform receives only deterministic `helm template --include-crds` output over stdin; raw templates are never inputs.
- `format`, `lint`, `types`, and `manifests` are distinct report categories.

Known typed debt is now visible rather than missed: six configured TypeScript projects currently fail strict checking, while `plugins/openclaw-agent-observer/tsconfig.json` is clean. Existing findings require the Phase 7 fingerprinted ratchet or a separately authorized type-migration effort; new project discovery is no longer heuristic.

## Phase 4: Go And Terraform (implemented July 20, 2026)

Goal: add first-class native coverage for Go and Terraform.

Go deliverables:

- Pinned Go toolchain.
- `gofmt -l` for format authority.
- `go vet` for compiler-supported correctness.
- Staticcheck for deeper lint and unused code.
- `govulncheck` in the dependency-security category.
- Explicit Go module roots, build tags, and package-boundary policy.

Terraform deliverables:

- Pinned Terraform and TFLint tools.
- `terraform fmt -check -recursive` against explicit roots.
- Non-mutating `terraform validate` per explicit root.
- TFLint with one explicit configuration.
- One Terraform security scanner in the security category.
- Provider lockfile and generated/vendor policy.

Exit criteria:

- Go modules and Terraform roots are explicit and independently reportable.
- Terraform lint never plans, applies, or mutates remote infrastructure.
- Tool absence, config failure, and output failure block deterministically.

Implementation evidence:

- The general runtime pins Go 1.26.5, Staticcheck 2026.1, govulncheck 1.1.4, Terraform 1.15.7, TFLint 0.64.0, and Trivy 0.72.0 for amd64 and arm64.
- `pipeline_lint_policy.v3` owns one exact Go module, its explicit empty build-tag set, and its allowed import prefix. All four Go tools must use that canonical module target.
- Gofmt, go vet, Go import boundaries, Staticcheck, and govulncheck normalize findings independently and fail closed on execution or output failures.
- Terraform formatting, validation, TFLint, and Trivy adapters are configured through the same registry and report contract. The single `.tflint.hcl` is deployed beside the policy.
- Terraform validation requires a committed `.terraform.lock.hcl`, prepares providers through `terraform init -backend=false -get=false -lockfile=readonly` in an isolated temporary data directory, and then invokes `terraform validate -json`. Provider installation is restricted to the policy's pre-provisioned filesystem mirror, with no direct registry fallback. It never plans, applies, accesses a backend, downloads modules, or writes `.terraform` into the source tree.
- Trivy scans Terraform misconfiguration only at high and critical severity, uses the pinned binary's embedded checks without runtime updates, and excludes `.terraform` plus state files.
- This repository contains no Terraform source, so the canonical Terraform root list is empty and the language remains inactive. Policy validation rejects enabling Terraform without at least one explicit root; no repository-root fallback exists.
- Adapter fixtures cover Go formatting/correctness/vulnerability normalization, Terraform lockfile enforcement, forbidden command absence, TFLint output, and Trivy output.

## Phase 5: Architecture, Dead Code, And Duplication (implemented July 20, 2026)

Goal: enforce canonical authority and clean dependency structure.

Deliverables:

- One dependency-boundary implementation per language ecosystem.
- Blocking circular-dependency detection.
- Dead-file, dead-code, unused-export, and undeclared-dependency checks.
- Structural exact and near-duplicate detection across supported text languages.
- Removal of duplicate-public-export-name as a duplication proxy.
- Stable finding fingerprints.

Exit criteria:

- Duplicate implementations are detected by structure, not names.
- New cycles, boundary violations, dead code, and clones block.
- Existing genuine debt is baselined with owner, reason, and expiry.

Implementation evidence:

- Dependency Cruiser 18.1.0 replaces Madge and is the single JavaScript/TypeScript graph authority. It reports canonical directed cycles and enforces the four policy-owned dependency layers: observer plugin, common pipeline, Buster pipeline, and Nova pipeline.
- Knip 6.27.0 uses one explicit `knip.json` and reports dead files, unused exports/types/dependencies, undeclared dependencies, and unresolved dependencies without truncation.
- JSCPD 5.0.12 replaces duplicate-export-name matching with token-based exact and near-duplicate detection across JavaScript, TypeScript, Go, Python, shell, Dockerfile, and Terraform/HCL source.
- Every finding receives a stable SHA-256 fingerprint. Clone identities omit line coordinates and include source context so repeated identical blocks remain independently ratcheted.
- `pipeline_lint_policy.v5`, `pipeline_lint_report.v5`, and `pipeline_lint_baseline.v1` bind the exact baseline digest into report evidence. Unexpired matches remain visible as baselined findings but do not block; unmatched findings block immediately.
- The calibrated baseline has three groups with one owner, reason, expiry, and tracking reference: 529 Knip findings, 45 dependency cycles, and 295 structural clones. All 869 expire on October 20, 2026.
- The legacy `repo-policy` duplicate-export proxy and Madge adapter are deleted, leaving one owner per capability.

## Phase 6: Complexity And Configuration Discipline (implemented July 20, 2026)

Goal: enforce the smallest clear implementation and explicit settings boundaries.

Initial candidate budgets to calibrate against real code:

- Cyclomatic complexity: 10 per function.
- Nesting depth: 3.
- Parameters: 5.
- Function size: 40 logical lines.
- File size: 300 logical lines.
- Duplicate block: approximately 10–12 meaningful lines.

Deliverables:

- Language-native complexity, nesting, branching, and size rules.
- Environment access allowed only in declared infrastructure/config adapters.
- Hardcoded deployment/business settings rejected where configuration is required.
- Hidden fallback chains rejected.
- Dynamic module loading restricted to declared plugin/registry boundaries.
- Global mutable state and swallowed-error rules.
- Predictable naming and folder-root rules.

Exit criteria:

- Each accepted rule has good/bad examples, stable code, remediation, tests, and demonstrated low noise.
- Limits that encourage artificial splitting are revised or rejected.
- Human cohesion review remains explicit where syntax metrics cannot decide intent.

Implementation evidence:

- ESLint is the single JavaScript/TypeScript owner for complexity 10, nesting depth 3, five parameters, 40 logical function lines, 300 logical file lines, lowercase kebab-case filenames, direct environment access, environment-backed hardcoded defaults, fallback chains longer than two candidates, dynamic module loading, module-level mutable state, swallowed errors, and unstructured console output.
- Exact environment and dynamic-loader boundaries live in the native ESLint settings file. Tests and fixtures are parsed but excluded from production maintainability budgets.
- Gocyclo 0.6.0 is pinned in the general runtime and enforces the same complexity maximum of 10 over explicit Go module roots. Its text output, finding exits, and operational failures are normalized independently.
- Semgrep no longer duplicates JavaScript/TypeScript swallowed-error, dynamic-loading, or console rules. The broad path-traversal rule was rejected after 340 false positives, and raw Helm-template scanning was removed after deterministic parser failures. Semgrep now scans every tracked production code and executable-script root through an explicit allowlist with focused security rules. A policy test fails when a supported production source file lacks a Semgrep root. The documentation-reference parser is the sole exact exclusion because Semgrep 1.170.0 only partially parses its regular-expression grammar; ESLint still covers it.
- Trivy scans deterministic Helm-rendered manifests for high and critical Kubernetes security misconfigurations. It replaces the removed raw-template Semgrep rules without confusing Helm syntax for YAML, and it runs with embedded checks plus update/version checks disabled.
- Every tool blocks at warning severity. Existing Phase 6 debt is fingerprinted rather than emitted as advisory noise: 1,464 ESLint findings, 11 Hadolint findings, four Go complexity findings, one Semgrep finding, and three rendered Kubernetes security findings. Together with Phase 5, the baseline contains 2,352 fingerprints, all expiring October 20, 2026.
- ESLint and Hadolint fingerprints include normalized source context and occurrence identity, so repeated same-code findings in one file cannot silently share one suppression.
- The accepted-rule contract documents stable codes, rejected and accepted examples, remediation, and the two noisy proposals rejected during calibration. Focused tests execute both clean and violating examples.
- `pipeline_lint_policy.v5` and `pipeline_lint_report.v5` bind the stricter warning threshold and updated native configuration digests into evidence.

## Phase 7: Ratchet, Suppressions, And Cutover

Goal: activate strict enforcement without preserving permanent compatibility paths.

Deliverables:

- Experimental rule mode that does not pollute normal developer output.
- Historical changed-file calibration for every proposed blocking rule.
- Fingerprinted baseline for genuine existing debt.
- Suppressions requiring rule, owner, reason, creation date, expiry, and tracking reference.
- Expired suppressions block.
- New findings and new suppressions block unless explicitly approved.
- Removal of old runner paths, fallback discovery, duplicate rules, and obsolete configuration.

Exit criteria:

- Normal output contains only actionable blocking findings and explicitly requested debt reports.
- Existing debt cannot increase.
- No old/new dual implementation remains.
- Local and CI normalized reports are equivalent.

## Rule Admission Checklist

A rule may become blocking only when all answers are yes:

- Does it enforce a written principle?
- Is there exactly one owner/tool for the capability?
- Is the finding deterministic and stable?
- Does it have a stable code and precise remediation?
- Are good, bad, and edge-case fixtures present?
- Was it evaluated against current code and representative historical changes?
- Are false positives rare and explainable?
- Is a safe autofix used where possible?
- Is suppression narrow, structured, owned, and expiring?
- Does activation avoid creating a permanent warning backlog?

Rules that fail admission are improved in experimental mode or deleted.

## Verification Strategy

Every phase must include:

- adapter contract tests for clean, finding, not-applicable, missing binary, missing config, timeout, crash, and malformed output
- configuration-schema tests and path-boundary tests
- normalized report-schema tests
- local/CI command equivalence checks
- deterministic fixtures with no network, real clock, ordering, or shared-state dependency
- targeted runtime-image verification for installed pinned tools
- documentation and generated-reference checks when surfaces change

## Sources

- `docs/developers/linting-improvement-audit.md`
- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-validators.ts`
- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/`
- `docker/Dockerfile.general`
- `docker/general-tools/package.json`

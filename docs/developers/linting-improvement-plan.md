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

- `pipeline_lint_policy.v6` requires explicit targets for tools whose authority is narrower than the selected project. Semgrep is the deliberate exception: an omitted or empty target list means the complete selected project root. Optional custom Semgrep targets replace that default, remain project-relative, and fail validation when they escape or do not exist.
- Seven TypeScript projects are named by exact `tsconfig.json` path. `tsc` runs once per affected configured project, including nested projects.
- ESLint parses JS, JSX, TS, and TSX through the pinned `typescript-eslint` parser. Premature maintainability warnings were removed until Phase 6 admission and ratchet support.
- The workspace currently has no Python source or Python project root, so Python is not enabled for this project. Ruff/mypy adapters remain available for a future explicit Python project rather than pretending `.` is a Python root.
- ShellCheck is restricted to warning-or-higher correctness signals. Pinned shfmt owns shell formatting with policy-declared arguments, and the declared shell roots were normalized once.
- Hadolint owns eight exact Dockerfiles. Yamllint owns explicit non-template YAML roots and one explicit low-noise config.
- Helm lint owns the exact `charts/kubeclaw` chart. Kubeconform receives only deterministic `helm template --include-crds` output over stdin; raw templates are never inputs.
- `format`, `lint`, `types`, and `manifests` are distinct report categories.

Known typed debt is now visible rather than missed: six configured TypeScript projects currently fail strict checking, while `skills/common/plugins/openclaw-agent-observer/tsconfig.json` is clean. Existing findings require the Phase 7 fingerprinted ratchet or a separately authorized type-migration effort; new project discovery is no longer heuristic.

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

- JavaScript/TypeScript cyclomatic complexity: 15 per function.
- Go cyclomatic complexity: 10 per function.
- Nesting depth: 3.
- Parameters: 5.
- Function size: 60 logical lines.
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

- ESLint is the single JavaScript/TypeScript owner for complexity 15, nesting depth 3, seven parameters, 60 logical function lines, 300 logical file lines, lowercase kebab-case filenames, direct environment access, environment-backed hardcoded defaults, fallback chains longer than two candidates, dynamic module loading, module-level mutable state, swallowed errors, and unstructured console output.
- Exact environment and dynamic-loader boundaries live in the native ESLint settings file. Tests and fixtures are parsed but excluded from production maintainability budgets.
- Gocyclo 0.6.0 is pinned in the general runtime and independently enforces complexity 10 over explicit Go module roots. Its text output, finding exits, and operational failures are normalized independently.
- Semgrep no longer duplicates JavaScript/TypeScript swallowed-error, dynamic-loading, or console rules. The broad path-traversal rule was rejected after 340 false positives, and raw Helm-template scanning was removed after deterministic parser failures. Semgrep scans the selected current project by default with focused security rules; operators may replace that root with validated custom project-relative paths. Changed-file execution narrows the effective set without changing project authority. The documentation-reference parser is the sole exact exclusion because Semgrep 1.170.0 only partially parses its regular-expression grammar; ESLint still covers it.
- Trivy scans deterministic Helm-rendered manifests for high and critical Kubernetes security misconfigurations. It replaces the removed raw-template Semgrep rules without confusing Helm syntax for YAML, and it runs with embedded checks plus update/version checks disabled.
- Every tool blocks at warning severity. Existing Phase 6 debt is fingerprinted rather than emitted as advisory noise: 1,464 ESLint findings, 11 Hadolint findings, four Go complexity findings, one Semgrep finding, and three rendered Kubernetes security findings. Together with Phase 5, the baseline contains 2,352 fingerprints, all expiring October 20, 2026.
- ESLint and Hadolint fingerprints include normalized source context and occurrence identity, so repeated same-code findings in one file cannot silently share one suppression.
- The accepted-rule contract documents stable codes, rejected and accepted examples, remediation, and the two noisy proposals rejected during calibration. Focused tests execute both clean and violating examples.
- `pipeline_lint_policy.v5` and `pipeline_lint_report.v5` bind the stricter warning threshold and updated native configuration digests into evidence.

## Phase 7: Ratchet, Suppressions, And Cutover (implemented July 20, 2026)

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

Implementation evidence:

- `pipeline_lint_policy.v6` owns one explicit `experimental_tools` list. Experimental tools do not run or appear in normal reports; `--include-experimental` runs them as non-blocking evidence with separate counts.
- `pipeline_lint_report.v6` has explicit debt and experimental visibility. Normal reports disclose only active actionable findings. `--include-debt` reveals approved debt records without changing blocking counts.
- `pipeline_lint_baseline.v2` requires tool, stable fingerprint, owner, reason, creation date, expiry, tracking reference, approver, and approval date. Missing approval is invalid, and an expired group fails policy loading even when its finding is absent.
- New findings remain unmatched and blocking. New suppressions cannot take effect without explicit approval metadata, and experimental findings cannot be suppressed. Phase 7 fingerprints the 4,220 unique TypeScript diagnostics deliberately deferred from Phase 3; overlapping project runs may emit the same fingerprint more than once without weakening the ratchet.
- The Phase 6 rule-admission records are machine-validated against three representative historical changed-file commits. Each admitted rule records its principle, remediation, reviewed changed-set count, observed false positives, approver, and approval date.
- The pipeline invokes the same reporter and default visibility locally and in CI. Contract tests bind exact tool inventory, policy/config/baseline digests, changed-file scope, and visibility.
- The root reporter alias, config discovery, unsafe cache, Madge path, duplicate-export proxy, raw Helm validation, and advisory-warning path remain deleted. Contract checks prevent these compatibility paths from returning.

## Phase 8: Calibrate Using Real History (evaluated July 20, 2026)

Goal: prove that admitted blocking rules produce actionable findings on current and representative historical changes without preserving shared false-positive exceptions.

Procedure:

1. Run the canonical reporter against the current repository and an isolated committed snapshot.
2. Run every admitted ESLint rule against representative historical JavaScript and TypeScript changed sets.
3. Classify every recurring finding pattern as actionable or noise.
4. Correct native rule scope when a false positive is systematic; do not edit unrelated application code to make calibration appear clean.
5. Keep genuine existing debt visible and fingerprinted.
6. Introduce a temporary deliberate violation and prove that it is unmatched and blocking.

Evaluation evidence:

- The three originally recorded historical commits changed no ESLint-applicable files. They were rejected as invalid calibration evidence and replaced with `c33020319b13ac0054622812eb454a828b0d5f74`, `c73802816dc86b0d4a84c2dcd64109db85ea26c4`, and `ffd21d25af8e0e3547f948c83210c7bd62d53353`.
- The replacement sets exercise 55, five, and six JavaScript/TypeScript files respectively. After calibration they produce 225, six, and 62 actionable findings.
- Generated telemetry types are excluded from production cohesion budgets because the file is generated and explicitly says not to edit it.
- `no-console` is disabled only for four declared command-line or logging boundaries. Direct console use elsewhere remains blocking.
- A temporary changed-file probe produced unbaselined TypeScript, ESLint, and Knip findings, including direct environment access, an environment-backed default, a fallback chain, excessive nesting, and a dead file. The canonical report blocked it. The probe worktree was deleted after the check.

Outcome: rule calibration is materially improved and the strict ratchet works. The repository is not yet a clean gate: current genuine debt, runtime tool drift, and TypeScript environment dependence are recorded in `linting-phase8-9-evaluation.md` and must not be hidden by expanding the baseline without explicit approval.

## Phase 9: Roll Out In Narrow Vertical Slices (evaluated July 20, 2026)

Goal: audit the completed implementation as ten independently verifiable capability slices instead of treating tool installation as completion.

Slices:

1. Reporter correctness and canonical policy.
2. TypeScript detection and ESLint support.
3. Go and Terraform adapters.
4. YAML, Helm, and Kubernetes scope.
5. Architecture and circular dependencies.
6. Dead code and unused exports.
7. Structural duplication.
8. Complexity and file/function cohesion.
9. Environment, settings, fallback, and hardcoded-policy rules.
10. Initial baseline and strict ratchet activation.

Outcome: all ten slices have canonical controls and focused contract tests, but rollout is only partially operational. The deployed live runtime is missing required binaries, TypeScript evidence changes with module-resolution layout, and the committed repository has new unmatched debt. The detailed slice verdict and P00-P25 control are authoritative in `linting-phase8-9-evaluation.md`. Phase 9 is complete as an audit, not accepted as a clean production rollout.

The executable debt-removal and typed-boundary migration sequence is maintained in `pipeline-type-and-structure-migration-plan.md`. It starts from commit `3332db05d`, migrates Common before Buster and Nova, and requires every completed slice to reach zero TypeScript and ESLint findings without baseline expansion.

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
- `skills/nova/pipeline/services/module-lint-validators.ts`
- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/`
- `docker/Dockerfile.general`
- `docker/general-tools/package.json`

# Linting Improvement Audit And Target Contract

Status: proposed
Audience: developers, maintainers, pipeline owners

## Purpose

This document records the July 20, 2026 audit of Nova's lint-report pipeline and defines the target linting contract. It is intentionally limited to linting and deterministic static analysis. Test-suite design and implementation belong to the testing pod, but test-related principles are retained here as cross-pod acceptance constraints so they are not lost.

The design objective is:

> Optimize for the smallest clear solution: minimal concepts, branches, indirection, and duplication.

This is more important than minimizing physical line count. A shorter implementation is only better when it remains explicit, cohesive, and easy to verify.

## Scope

The audit covered:

- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-lint-validators.ts`
- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/`
- `charts/kubeclaw/files/config/eslint.config.mjs`
- `charts/kubeclaw/files/config/.semgrep.yml`
- `docker/Dockerfile.general`
- `docker/general-tools/package.json`
- focused lint-report tests under `tests/skills/nova/pipeline/`

The target contract covers JavaScript, TypeScript, Python, shell, Dockerfile, YAML, Helm, Kubernetes manifests, Go, and Terraform. It must be extensible through explicit language adapters without turning the runner into a collection of inferred fallbacks.

## Verification Performed

The focused reporter suite passed:

```text
12 tests passed
0 tests failed
```

A repository-wide full report was also run with explicit ESLint and Semgrep configuration. In the audit environment it produced:

```text
8,386 errors
1,103 warnings
8 tools OK
3 tools skipped
0 tools failed
```

This run was diagnostic, not a statement that the general Docker image lacks the skipped tools. The Dockerfile installs the JavaScript tools under `/opt/kubeclaw-tools`; the audit shell did not use that image. The run did prove that an applicable missing binary is classified as skipped rather than failed.

Most reported errors came from untuned repository-wide YAML linting. Semgrep exited without valid JSON, but the reporter represented the parse failure as one non-blocking warning with an otherwise successful tool status. These results demonstrate that the current report is structured but not yet an authoritative quality gate.

## Current Strengths

- One reporter aggregates tool output into a structured JSON report.
- External commands use executable plus argument arrays rather than interpolated shell commands.
- Tool execution has bounded timeouts and captured output.
- Module and changed-file scopes exist.
- Tool crashes can be distinguished from source findings when they throw through the adapter.
- ESLint and Semgrep avoid implicit repository-local configuration.
- Tool versions are mostly pinned either directly or through a pinned Debian snapshot.
- The reporter has focused tests for discovery, scoping, caching, parsing, and fail-closed pipeline behavior.

These pieces should be retained while simplifying authority, configuration, and failure semantics.

## Audit Findings

### LINT-001: Required tools can be skipped successfully

`runTool` returns `status: skipped` when an applicable binary is absent. Pre-check and full lint block on `total_errors` and `tools_failed`, but not `tools_skipped`.

Impact: an incomplete or damaged runtime image can produce a clean gate without running required checks.

Target:

- Every configured tool is explicitly `required` or `optional`.
- A missing required binary is an execution failure.
- Optional tools are exceptional and must have a documented reason.
- Applicability comes from validated project configuration, not guessed markers.

### LINT-002: Configuration and parser failures are downgraded to warnings

Missing ESLint/Semgrep configuration and unparsable tool output are converted into warning findings. `runTool` then reports the adapter as `status: ok`.

Impact: a tool that did not execute correctly can be indistinguishable from a successful tool with an advisory source finding.

Target:

- Missing required configuration, invalid configuration, timeout, crash, and parse failure are execution failures.
- Execution failures never enter the source-warning count.
- Every adapter returns a discriminated result: `passed`, `findings`, `not_applicable`, or `execution_failed`.
- The pipeline blocks when any required adapter returns `execution_failed`.

### LINT-003: Important maintainability findings do not block

Warnings-only reports pass. Current warning-only checks include ESLint rules, Knip findings, duplicate-export warnings, many Semgrep maintainability rules, ShellCheck warnings, and Hadolint warnings.

Impact: the reporter describes maintainability debt but does not consistently prevent new debt.

Target:

- Severity and blocking behavior are defined once in lint policy.
- New blocking findings fail immediately.
- Existing accepted findings use a fingerprinted quality baseline and ratchet.
- A changed file may not introduce a new baseline finding.
- Baseline entries require owner, reason, and expiry.

### LINT-004: TypeScript discovery misses nested projects

TypeScript is detected only when `tsconfig.json` exists directly at the selected module root or repository root. This repository contains nested TypeScript projects, including `skills/nova/tsconfig.json`, but the full-repository audit did not classify the repository as TypeScript.

The shared ESLint configuration also targets JS/JSX-family files only, leaving TS/TSX primarily dependent on Semgrep.

Impact: TypeScript can avoid both compiler checking and proper ESLint analysis.

Target:

- Project roots and their `tsconfig.json` files are explicitly listed in lint settings.
- TypeScript ESLint support is installed and configured.
- Changed TS/TSX files run fast lint locally.
- Each affected TypeScript project runs `tsc` once with its canonical configuration.
- The runner never searches upward or downward for a convenient `tsconfig.json`.

### LINT-005: Duplicate export names are not duplicate-code detection

The custom repository policy treats repeated public export names as possible duplication. The audit produced 442 such warnings.

Impact:

- Common legitimate names create noise.
- Exact and near-duplicate implementations with different names are missed.
- Naming and implementation duplication are incorrectly combined.

Target:

- Remove duplicate-public-export-name as a duplication proxy.
- Use one structural clone detector for exact and near-duplicate code across supported text languages.
- Configure minimum token/line thresholds centrally.
- Keep naming rules separate and language-native.
- Ratchet existing clones; reject newly introduced clones.

### LINT-006: Lint policy authority is fragmented

Policy currently lives across reporter TypeScript, ESLint config, Semgrep config, per-tool defaults, and pipeline configuration. Hardcoded policy includes discovery depths, ignored directories, extensions, timeouts, tiers, severities, output caps, and configuration candidate chains.

Impact: changing one lint policy requires knowledge of several unrelated files, and different tools can interpret scope differently.

Target:

- One typed, schema-validated lint settings file is the policy authority.
- Language-native files contain only settings that their native tools require.
- The central settings file references native config paths explicitly.
- The runner contains execution mechanics, not project policy.
- No environment variable selects lint rules, paths, tiers, or severity.

### LINT-007: Hidden path fallbacks remain

The service maps `/app/skills/pipeline/tools/lint-report.ts` to a repository checkout path when the configured runtime path does not exist. ESLint and Semgrep also walk candidate lists to find usable platform configuration.

Impact: the same configuration can execute different files depending on filesystem state.

Target:

- Configure one absolute reporter path for the deployed runtime.
- Configure one repository-relative development entry point for local commands through the local command wrapper.
- Configure exactly one ESLint path and one Semgrep path.
- A configured path that does not exist is an execution failure.
- Do not search alternative locations.

### LINT-008: The cache does not include lint authority

The cache key includes source commit and scope but omits reporter content/version, lint settings, native configuration contents, and tool versions.

Impact: changing lint rules or upgrading a tool can reuse a report created under older policy.

Target:

- Cache keys include source revision, normalized scope, central policy digest, every referenced config digest, reporter version, and tool version set.
- An unknown source revision disables cache reuse.
- Cache schema validation is mandatory.
- Cache reads never silently coerce malformed counts to zero.

### LINT-009: Scope semantics differ implicitly by tool

Some adapters use changed files, some use a complete module, some use a TypeScript project, and dependency audits use the repository. These choices are embedded in adapter code.

Impact: the same `changed-files` request means different things without a visible contract.

Target:

- Every adapter declares one scope class: `file`, `project`, `module`, or `repository`.
- The central policy assigns explicit roots.
- A file change deterministically expands to affected project/module checks.
- Full and changed-file execution use the same rules and configs.

### LINT-010: Unrelated concerns share one undifferentiated report

The registry combines formatting/style lint, type checking, architecture, dead code, duplication, security patterns, dependency vulnerabilities, Helm validation, and Kubernetes schema validation.

Impact: failures with different ownership and remediation are presented as generic lint findings.

Target:

Keep one `quality check` entry point, but produce separate categories:

```text
format
lint
types
architecture
dead-code
duplication
security
dependencies
manifests
```

Each tool has exactly one primary category. The orchestrator combines results without duplicating rules between categories.

### LINT-011: YAML and manifest checks are noisy and structurally incorrect

Yamllint currently uses implicit defaults across a broad repository tree. Kubeconform scans YAML files directly when Helm templates should be rendered before Kubernetes schema validation.

Impact: thousands of low-value findings hide actionable failures, while templated manifests can be judged as raw YAML/Kubernetes resources.

Target:

- Add an explicit Yamllint config and explicit YAML roots/exclusions.
- Run Helm lint against explicit chart roots.
- Render each configured Helm chart deterministically.
- Run Kubeconform only against rendered Kubernetes manifests or explicit raw-manifest roots.
- Keep YAML style, Helm correctness, and Kubernetes schema validation as separate categories.

### LINT-012: Go is not supported

Go is a first-class required language for the target system.

Target Go adapter set:

- `gofmt -l`: canonical formatting check.
- `go vet`: compiler-supported correctness analysis.
- `staticcheck`: deeper language-native lint and unused-code analysis.
- `govulncheck`: Go dependency/reachability vulnerability analysis under the dependency-security category.
- An explicit import-boundary rule based on configured packages/layers.

Go requirements:

- Every Go module root and `go.mod` path is explicit.
- No recursive module guessing.
- `go env` may describe toolchain/infrastructure state but may not select project lint policy.
- Go build tags used by linting are explicit settings.
- Formatting, lint, architecture, and vulnerability findings remain separate.

### LINT-013: Terraform is not supported

Terraform is a first-class required language for the target system.

Target Terraform adapter set:

- `terraform fmt -check -recursive`: canonical formatting check within explicit roots.
- `terraform validate`: syntax and provider-schema validation per explicit root.
- `tflint`: Terraform-specific lint using one explicit config.
- One infrastructure-security scanner under the security category; do not duplicate equivalent rules in several scanners.

Terraform requirements:

- Every Terraform root is explicit; directories are not inferred from arbitrary `.tf` files.
- Provider lockfiles are required for reproducibility where providers are used.
- Validation must not perform apply/plan or mutate remote infrastructure.
- Provider credentials and infrastructure secrets may come from deployment environment or secret stores.
- Policy, defaults, regions, resource sizes, and ordinary Terraform inputs belong in versioned settings/variable files, not hidden environment variables.
- Generated and vendored module paths are explicitly excluded.

### LINT-014: General multi-language extensibility is incomplete

Semgrep is useful for selected cross-language policy but is not a replacement for language-native formatting, types, compilation, or dependency analysis.

Target:

- A small adapter contract supports additional languages.
- An adapter declares identity, category, required binary, version command, scope, config path, and parser.
- The project policy explicitly enables adapters and roots.
- Adding a language does not require adding discovery fallback chains.
- Exactly one tool owns each rule/capability unless an overlap is documented and tested.

### LINT-015: Report and adapter contracts are insufficiently validated

The service accepts parsed JSON and reads summary fields without validating the full report shape. Several helpers coerce missing or invalid counts to zero.

Impact: malformed evidence can look clean.

Target:

- Define a versioned, discriminated report schema.
- Validate reports at the reporter boundary and pipeline-consumer boundary.
- Reject unknown statuses, missing required fields, invalid counts, duplicate tool IDs, and findings without stable codes.
- Never interpret missing evidence as zero findings.

### LINT-016: Current lint tests do not prove the complete gate contract

The focused tests cover useful individual behavior, but do not yet prove every adapter's clean, finding, missing-binary, missing-config, timeout, malformed-output, and scope behavior.

Target:

- Contract-test every adapter against observable inputs and outputs.
- Test central configuration validation and invalid paths.
- Test required versus optional behavior.
- Test cache invalidation when policy, configs, reporter, or tool versions change.
- Test that local and CI commands produce equivalent normalized reports.
- Keep tests deterministic and offline; dependency scanners use fixtures in contract tests.

## Canonical Target Architecture

The smallest clear design has four layers:

```text
quality command
  -> validated lint policy
  -> category/language adapters
  -> versioned normalized report
```

### 1. Quality command

One command is used locally and in CI:

```text
quality check
```

Optional narrow commands such as `quality lint` and `quality format` select categories through the same implementation. CI must not contain a second orchestration path.

### 2. Validated lint policy

One dedicated settings file owns:

- enabled languages and categories
- explicit project/module roots
- required tools and version constraints
- native configuration paths
- scope classes
- blocking severities
- timeouts
- exclusions
- suppression-baseline path
- architecture boundaries

The policy must have a schema and fail before execution when invalid. Environment variables may provide infrastructure endpoints, credentials, and secrets only; they cannot alter lint behavior.

### 3. Focused adapters

Each adapter owns only:

- construction of one tool invocation
- parsing that tool's output
- normalization into the shared result contract

Adapters do not discover projects, choose fallback configs, downgrade execution failures, or decide global blocking policy.

Large language registries should be split by language/category so individual files remain cohesive. File splitting must follow responsibility rather than arbitrary line-count thresholds.

### 4. Versioned report

The report distinguishes:

- source findings
- execution failures
- not-applicable adapters
- suppression/baseline matches
- category summaries
- exact policy/tool/config digests

Structured error codes and context are mandatory. Logs are structured and must never silently swallow write failures that affect required evidence.

## Policy Rules Required By The Design Principles

The initial rule catalog must cover:

- forbidden hidden fallback chains
- environment access outside declared infrastructure/config adapters
- hardcoded deployment or business settings where a configured value is required
- dynamic module loading outside declared registry/plugin boundaries
- circular dependencies
- forbidden cross-layer imports
- dead code and unused exports
- exact and near-duplicate code
- file, function, nesting, branching, and cyclomatic-complexity budgets
- swallowed errors and empty catch/exception blocks
- global mutable state and hidden singleton dependencies
- unsafe dynamic execution and injection patterns
- dependency vulnerabilities
- naming conventions and canonical folder roots
- suppression metadata and expiry

Rules that cannot be expressed reliably through language-native tools may use focused custom checks. Custom checks must parse syntax or authoritative tool output; fragile text matching is not acceptable for structural rules.

## Principle Coverage Control

Every principle supplied for this audit is mapped below. `Lint-owned` means this work can enforce it directly. `Cross-pod` means linting records or supports the constraint, while the testing pod owns full implementation.

| ID | Principle | Ownership | Required control |
| --- | --- | --- | --- |
| P00 | Smallest clear solution; minimal concepts, branches, indirection, and duplication | Lint-owned | Complexity, duplication, dead-code, and architecture checks; adapter design constrained to four layers |
| P01 | One canonical implementation for each capability | Lint-owned | One tool/rule owner per capability; duplicate-code and duplicate-rule inventory |
| P02 | One explicit execution path; no hidden fallback chains | Lint-owned | One quality entry point; configured paths; missing path fails |
| P03 | Clear dependency direction and strict module boundaries | Lint-owned | Configured layer graph and forbidden-import checks |
| P04 | Typed, validated configuration in dedicated settings files | Lint-owned | Versioned lint-policy schema and native config references |
| P05 | Environment variables only for deployment infrastructure and secrets | Lint-owned | Environment-access rules and explicit infrastructure boundary exceptions |
| P06 | Small, cohesive files and functions, split by responsibility rather than arbitrary limits | Lint-owned | Configured size/complexity budgets plus reviewer-visible cohesion guidance |
| P07 | Prefer obvious code over clever abstractions | Lint-supported | Nesting, complexity, dynamic-loading, metaprogramming, and indirection rules; human review remains necessary |
| P08 | Delete dead code instead of preserving speculative compatibility | Lint-owned | Dead-code, unused-file, unused-export, and unreachable-code checks |
| P09 | Dependencies explicit; avoid global state and invisible side effects | Lint-owned | Import graph, undeclared dependency, global mutation, hidden singleton, and dynamic-load checks |
| P10 | Errors handled intentionally and never silently swallowed | Lint-owned | Empty/swallowed handler rules and execution-failure contract |
| P11 | Tests verify observable behavior, not implementation details | Cross-pod | Adapter contract tests assert commands/results, not private helper structure |
| P12 | Changes deterministic and reproducible locally and in CI | Shared | Same quality command, pinned tools, locked dependencies, digested policy/config, offline fixtures |
| P13 | Strong typing and explicit interfaces at system boundaries | Lint-owned | TypeScript, Python, and Go type/static checks; validated adapter/report schemas |
| P14 | Enforced dependency rules between layers/modules | Lint-owned | Same configured dependency graph as P03; one canonical boundary checker per language |
| P15 | Circular dependency detection | Lint-owned | Language-native/import-graph circular checks with blocking findings |
| P16 | Dead-code and unused-export detection | Lint-owned | Same canonical dead-code owner as P08; no duplicate scanner authority |
| P17 | Complexity limits for nesting, branching, and function size | Lint-owned | Central budgets implemented by language-native rules/adapters |
| P18 | Dependency and vulnerability scanning | Lint-owned category | npm, Python, Go, Terraform/container dependency checks separated from source lint |
| P19 | Consistent naming and predictable folder conventions | Lint-owned | Language naming rules and explicit allowed project/folder roots |
| P20 | Structured errors and logging | Lint-owned | Versioned error codes, discriminated results, structured logs, no swallowed evidence failure |
| P21 | Deterministic tests without ordering, network, real-clock, or shared-state reliance | Cross-pod | Offline adapter fixtures, injected clock where required, isolated temporary roots |
| P22 | Tests for configuration validation and failure paths | Shared | Lint-policy schema tests and adapter execution-failure contract tests |
| P23 | Migration rules prevent old and new implementations coexisting indefinitely | Lint-owned process | Cutover inventory, single authority switch, removal deadline, no dual runner after acceptance |
| P24 | Every lint suppression has written justification and expiry | Lint-owned | Structured suppression entries require owner, reason, creation date, and expiry |
| P25 | Quality ratchet prevents new problems while existing debt is tracked | Lint-owned | Stable finding fingerprints; baseline only for existing findings; changed code cannot add debt |

Coverage result: all supplied principles are represented. P11 and P21 remain cross-pod constraints because their full ownership belongs to testing, but lint adapter tests must still obey them. P03/P14 and P08/P16 intentionally share one enforcement authority instead of creating duplicate checks.

## Migration Sequence

### Phase 1: Make evidence trustworthy

- Add and validate the report schema.
- Fail required skips, missing config, timeouts, crashes, and parse failures.
- Stop converting execution failures into warnings.
- Add required failure-path tests.

### Phase 2: Establish canonical policy

- Introduce the typed lint settings file.
- Move tiers, roots, scopes, timeouts, config paths, exclusions, and severity policy out of runner code.
- Remove reporter and configuration fallback chains.
- Include complete authority digests in cache keys.

### Phase 3: Correct existing language and manifest coverage

- Add explicit JS/TS/Python/shell/Docker/YAML/Helm/Kubernetes roots.
- Add TypeScript ESLint support.
- Render Helm before Kubeconform.
- Tune YAML config and exclusions.
- Split category results.

### Phase 4: Add Go and Terraform

- Install pinned Go and Terraform toolchains/adapters in the general image.
- Add explicit Go module and Terraform root configuration.
- Add clean, finding, failure, and scope contract tests.
- Keep Terraform validation non-mutating and offline where possible.

### Phase 5: Enforce maintainability

- Replace duplicate-export heuristics with structural clone detection.
- Add dependency boundaries, dead code, complexity, naming, configuration, environment, and fallback rules.
- Create the initial fingerprinted baseline.
- Block all new findings governed by the ratchet.

### Phase 6: Remove superseded paths

- Delete the old discovery and fallback implementations in the same cutover change or by an explicit short-lived deadline.
- Remove obsolete rules rather than keeping compatibility branches.
- Confirm local and CI execution use the same quality command.

## Acceptance Criteria

The linting improvement is complete only when:

- One validated policy determines every enabled check and root.
- Local and CI use the same execution implementation.
- Required tools/configs cannot skip or fail successfully.
- Reports distinguish source findings from execution failures.
- Cache identity includes all lint authority.
- TypeScript, Go, and Terraform have first-class native coverage.
- Helm is rendered before Kubernetes schema validation.
- Duplicate code detection compares implementations rather than names.
- Architecture, dead code, complexity, configuration, environment, error handling, and naming controls are active.
- Existing debt is baselined with owner/reason/expiry and new debt blocks.
- No old runner, fallback path, or duplicate rule authority remains.
- Focused tests prove configuration validation, failure behavior, scope behavior, and deterministic normalized output.

## Sources

- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-lint-validators.ts`
- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/discovery.ts`
- `skills/nova/pipeline/tools/lint-report/report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- `charts/kubeclaw/files/config/eslint.config.mjs`
- `charts/kubeclaw/files/config/.semgrep.yml`
- `docker/Dockerfile.general`
- `docker/general-tools/package.json`
- `tests/skills/nova/pipeline/services/lint.test.mjs`
- `tests/skills/nova/pipeline/tools/lint-report/`

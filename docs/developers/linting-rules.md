# Linting Rules

Status: current
Audience: developer, maintainer

## Purpose

Use this page when changing KubeClaw's static analysis behavior. Linting is used both as a fast pre-check after Forge output and as a fuller validator around review/gate flows.

## Current Lint Tiers

The lint aggregator is:

```text
skills/nova/pipeline/tools/lint-report.ts
```

Tiers:

- `pre-check`: fast checks after Forge output. Current tier intent is affected TypeScript and Go projects plus ShellCheck, shfmt, gofmt, and Terraform formatting where applicable. Python and Terraform tools activate only for policy projects with explicit roots.
- `full`: all applicable tools.

`runPreCheck(...)` runs `pre-check` and fails closed if the report cannot be produced. `runFullLintValidatorStage(...)` runs `full` and blocks when tools fail.

## Current Tool Registry

Current tools include:

- `tsc`: TypeScript type checking once per affected configured `tsconfig.json`.
- `ruff`: Python linting.
- `shellcheck`: shell script linting.
- `shfmt`: canonical shell formatting.
- `eslint`: JavaScript/TypeScript parsing plus blocking complexity and configuration-discipline rules with the pinned TypeScript parser.
- `knip`: dead files, unused exports/types/dependencies, undeclared dependencies, and unresolved dependencies.
- `dependency-cruiser`: circular dependency detection and policy-owned JavaScript/TypeScript layer boundaries.
- `jscpd`: exact and near-duplicate structural clone detection across supported code languages.
- `npm-audit`: production dependency audit.
- `mypy`: Python type checking.
- `pip-audit`: Python dependency audit.
- `semgrep`: pattern-based analysis with explicit platform config.
- `hadolint`: Dockerfile linting.
- `helm-lint`: Helm chart linting.
- `kubeconform`: rendered Kubernetes manifest validation; raw Helm templates are never inputs.
- `trivy-kubernetes`: high and critical security checks over the same deterministic rendered Helm manifests; embedded checks only, with runtime updates disabled.
- `yamllint`: correctness-oriented YAML linting against explicit non-template roots.
- `gofmt`: canonical Go formatting.
- `go-vet`: compiler-supported Go correctness checks.
- `gocyclo`: Go cyclomatic-complexity enforcement at the same maximum of 10 used for JavaScript/TypeScript.
- `go-imports`: Go import-boundary enforcement from canonical allowed prefixes.
- `staticcheck`: deeper Go correctness and unused-code analysis.
- `govulncheck`: reachable Go vulnerability analysis.
- `terraform-fmt`: canonical Terraform formatting.
- `terraform-validate`: validation with a required committed provider lockfile and isolated `init -backend=false` provider data sourced only from the configured filesystem mirror.
- `tflint`: Terraform language linting using the single deployed `.tflint.hcl`.
- `trivy-terraform`: high/critical Terraform misconfiguration scanning without state-file inputs.

The versioned `lint-policy.json` owns exactly one explicit project root and declares language evidence, exact tool targets, tool ownership, category, scope, timeout, config path, blocking severity, exclusions, and architecture layers. Version 5 also binds an expiring, fingerprinted debt baseline. It rejects multiple projects because tool settings are intentionally global rather than pretending to provide project isolation. Adapters contain execution and parsing only. Missing targets, invalid policy, and missing required native configs fail before tool execution.

`lint-baseline.json` groups stable SHA-256 fingerprints by tool and requires an owner, reason, expiry, and tracking reference. Baselined findings remain visible in structured evidence but do not block. New findings block immediately. Phase 5 records 529 Knip findings, 45 dependency cycles, and 295 structural clones. Phase 6 records 1,464 ESLint findings, 11 Hadolint findings, four Go complexity findings, one Semgrep finding, and three rendered Kubernetes security findings. All 2,352 fingerprints expire on October 20, 2026.

## Phase 6 Rule Contract

All findings are blocking at warning severity or higher. There is no advisory warning mode. The budgets are intentionally strict but measure syntax only; a reviewer must still reject artificial splitting that worsens cohesion.

| Stable code | Rule | Rejected example | Accepted direction | Remediation |
| --- | --- | --- | --- | --- |
| `complexity` / `go-complexity` | cyclomatic complexity at most 10 | one function owns parsing, validation, retry, and persistence branches | small functions each own one decision domain | extract cohesive decisions; do not merely shuffle branches |
| `max-depth` | nesting depth at most 3 | four nested loops/conditions | guard clauses and named operations | flatten control flow or extract a coherent operation |
| `max-params` | at most five parameters | `run(a, b, c, d, e, f)` | `run(request)` with a typed request | introduce one explicit input object |
| `max-lines-per-function` | at most 40 logical lines | one orchestration function implements every step | short coordinator calling cohesive operations | split by responsibility, not by arbitrary line chunks |
| `max-lines` | at most 300 logical lines | unrelated configuration, transport, and rendering in one file | one file owns one clear concern | move a complete concern behind an explicit interface |
| `discipline/no-direct-env-access` | environment reads only in the exact adapters listed in `eslint.config.mjs` | `const timeout = process.env.TIMEOUT` in business logic | validated config passed into business logic | move infrastructure input parsing to a declared boundary |
| `discipline/no-env-default` | no hardcoded application default behind infrastructure environment input | `process.env.REGION || "us-east-1"` | required validated config or a versioned settings value | put the value in canonical settings and fail if required input is absent |
| `discipline/no-fallback-chain` | at most one fallback | `primary || legacy || guessed` | `primary ?? explicitFallback` | remove compatibility/guessing paths and select one authority |
| `discipline/no-dynamic-module-loading` | dynamic imports only in exact loader boundaries | `import(userSelectedPath)` in ordinary code | static import or a declared optional-dependency adapter | add the dependency statically or justify the exact boundary centrally |
| `discipline/no-top-level-mutable-state` | no module-level `let` or `var` | `let client` shared implicitly | state owned by a class, factory, or explicit lifecycle object | move state into its owner and pass the owner explicitly |
| `discipline/no-swallowed-error` | catches may not be empty, return absence, or only print | `catch { return null }` | contextual rethrow or explicit typed result | preserve failure evidence and let the owning boundary decide recovery |
| `discipline/filename-case` | lowercase kebab-case source filenames | `TaskRunner.ts` | `task-runner.ts` | rename the file and update imports |
| `no-console` | structured logging only | `console.log(value)` | project logger with level/component/context | use the canonical logger at the owning boundary |

Two tempting rules were rejected during calibration: generic “hardcoded literal” detection cannot distinguish protocol constants from settings, and generic path-traversal matching produced hundreds of ordinary filesystem false positives. The accepted environment-default rule targets the precise hardcoded-setting case, while security path validation remains explicit application code and review responsibility.

Semgrep no longer scans raw Helm templates or broad repository roots. It owns only focused security rules over an explicit allowlist covering every tracked production code and executable-script file; an inventory test rejects uncovered additions. `scripts/docs-check-refs.mjs` is the sole explicit Semgrep exclusion because the pinned parser reports partial parsing for its regular-expression grammar; ESLint still covers that file. Rendered manifest correctness remains with Helm and Kubeconform, while Trivy owns rendered Kubernetes security policy. ESLint owns JavaScript/TypeScript swallowed-error, dynamic-loading, logging, and maintainability concerns so Semgrep does not duplicate them.

This repository currently declares one Go module and zero Terraform roots. Terraform adapters and their pinned runtime tools are present, but remain honestly inapplicable until a Terraform root is added to both project languages/evidence and `project.terraform.roots`; the policy rejects an enabled language with no root. Enabled roots must also have every locked provider pre-provisioned in `project.terraform.provider_mirror`; no direct registry installation method is available during lint.

## Output Shape

Reports include:

- `tier`
- `timestamp`
- `summary.total_errors`
- `summary.total_warnings`
- `summary.total_blocking`
- `summary.total_baselined`
- `summary.tools_ok`
- `summary.tools_not_applicable`
- `summary.tools_failed`
- per-tool `status`
- per-tool `findings`

Findings use a consistent shape:

```json
{
  "file": "src/app.ts",
  "line": 12,
  "column": 4,
  "severity": "error",
  "code": "TS2322",
  "message": "Type 'string' is not assignable to type 'number'.",
  "fingerprint": "..."
}
```

## Adding A Tool

1. Add a tool registration in `skills/nova/pipeline/tools/lint-report/tool-registry.ts` or a focused module imported by it.
2. Define only adapter identity, binary, execution, and parsing in code.
3. Add the tool's policy-owned targets, tier, languages, category, scope, timeout, severity, includes, exclusions, arguments, and config path to `lint-policy.json`.
4. Return structured findings with `file`, `line`, `column`, `severity`, `code`, and `message`.
5. Treat missing required config as an execution failure, never a source finding or fallback.
6. Scope to changed files when `ctx.changedFiles` is present.
7. Add tests or behavior verification for clean, finding, parse failure, and tool failure cases.
8. Update [linting rules reference](../reference/linting-rules.md).

## Customization Points

Current platform-level config supports:

- `pre_check.enabled`
- `pre_check.lint_report_path`
- `pre_check.lint_policy_path`
- `pre_check.lint_policy_project`

CLI flags inside `lint-report.ts` include:

- `--repo`
- `--policy`
- `--policy-project`
- `--tier`
- `--module-path`
- `--project`
- `--output`
- `--changed-files`
- `--log-path`

## Failure Behavior

- Pre-check report missing: fail closed with `LINT_PRECHECK_EVIDENCE_REQUIRED`.
- Full lint report missing: block as execution failure.
- Required tools missing or failed: block as environment/tooling issue.
- Missing required tool config, timeout, crash, or parser failure: block as environment/tooling issue.
- Malformed report schema: reject the evidence and block.
- `summary.total_blocking` greater than zero: request code fix.
- Every configured tool blocks at warning severity or higher; warning-only advisory output is not accepted.

## Verification

Run the aggregator directly:

```bash
node skills/nova/pipeline/tools/lint-report.ts \
  --repo "$PWD" \
  --policy "$PWD/charts/kubeclaw/files/config/lint-policy.json" \
  --policy-project workspace \
  --tier full \
  --output /tmp/kubeclaw-lint-report.json
```

Run behavior verification:

```bash
node --test tests/verification/e2e/*.test.mjs
```

## Sources

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- `skills/nova/pipeline/tools/lint-report/go-terraform-tools.ts`
- `skills/nova/pipeline/tools/lint-report/architecture-tools.ts`
- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-validators.ts`

## Rule And Tool Contract

| Surface | Source owner | Expected output |
| --- | --- | --- |
| CLI flags and exit behavior | `skills/nova/pipeline/tools/lint-report.ts`; `lint-report/output.ts` | exact repo, policy, policy-project, tier, project, module, changed-file, and output inputs; process exits nonzero on blocking findings or tool failures |
| Policy authority | `charts/kubeclaw/files/config/lint-policy.json`; `lint-report/policy.ts` | versioned typed project, language, tool, scope, severity, exclusion, config, and architecture authority |
| Report schema | `lint-report/report.ts`; `lint-report/report-contract.ts` | JSON summary with blocking/error/warning totals, policy/config digests, per-tool policy metadata, findings, duration, and diagnostics |
| Pipeline consumption | `skills/nova/pipeline/services/lint.ts`; `module-validators.ts` | pre-check/full lint can request fixes, block, or provide evidence according to policy |

## Failure Signals

- `unknown tier`: CLI input is invalid; use `pre-check` or `full`.
- `eslint-config-missing` or `semgrep-config-missing`: the exact configured path is absent; execution fails without searching alternatives.
- parse failure: tool output format changed or command failed unexpectedly; execution fails.
- `tools_failed` greater than zero: treat as environment/tooling issue, not clean code.

Run the lint-report unit tests when changing parsing/discovery and the pipeline E2E behavior area when changing how lint results affect module/gate decisions.

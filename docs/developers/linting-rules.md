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

- `pre-check`: fast checks after Forge output. Current tier intent is TypeScript compiler, Ruff, and ShellCheck where applicable.
- `full`: all applicable tools.

`runPreCheck(...)` runs `pre-check` and fails closed if the report cannot be produced. `runFullLintValidatorStage(...)` runs `full` and blocks when tools fail.

## Current Tool Registry

Current tools include:

- `tsc`: TypeScript type checking.
- `repo-policy`: custom policy checks such as `erasableSyntaxOnly` and duplicate public exports.
- `ruff`: Python linting.
- `shellcheck`: shell script linting.
- `eslint`: JavaScript/TypeScript linting with explicit platform config.
- `knip`: unused code/dependency reporting.
- `madge`: circular dependency checks.
- `npm-audit`: production dependency audit.
- `mypy`: Python type checking.
- `pip-audit`: Python dependency audit.
- `semgrep`: pattern-based analysis with explicit platform config.
- `hadolint`: Dockerfile linting.
- `helm-lint`: Helm chart linting.
- `kubeconform`: Kubernetes manifest validation.
- `yamllint`: YAML linting.

The tool registry discovers project types before running tools. Missing explicit ESLint or Semgrep config produces config-missing findings instead of falling back to repo-local or implicit registry behavior.

## Output Shape

Reports include:

- `tier`
- `timestamp`
- `summary.total_errors`
- `summary.total_warnings`
- `summary.tools_ok`
- `summary.tools_skipped`
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
  "message": "Type 'string' is not assignable to type 'number'."
}
```

## Adding A Tool

1. Add a tool registration in `skills/nova/pipeline/tools/lint-report/tool-registry.ts` or a focused module imported by it.
2. Define `id`, `name`, `binary`, `tier`, `detect`, and `run`.
3. Keep timeout bounded.
4. Return structured findings with `file`, `line`, `column`, `severity`, `code`, and `message`.
5. Treat missing required config as a structured finding, not an implicit fallback.
6. Scope to changed files when `ctx.changedFiles` is present.
7. Add tests or behavior verification for clean, finding, parse failure, and tool failure cases.
8. Update [linting rules reference](../reference/linting-rules.md).

## Customization Points

Current platform-level config supports:

- `pre_check.enabled`
- `pre_check.lint_report_path`
- `pre_check.timeout_seconds`
- optional `pre_check.semgrep_config_path`

CLI flags inside `lint-report.ts` include:

- `--repo`
- `--tier`
- `--module-path`
- `--project`
- `--output`
- `--changed-files`
- `--semgrep-config`
- `--eslint-config`
- `--log-path`

## Failure Behavior

- Pre-check report missing: fail closed with `LINT_PRECHECK_EVIDENCE_REQUIRED`.
- Full lint report missing: block as execution failure.
- Tools failed: block as environment/tooling issue.
- Total errors greater than zero: request code fix.
- Warnings only: reported as evidence, not necessarily blocking unless policy changes.

## Verification

Run the aggregator directly:

```bash
node skills/nova/pipeline/tools/lint-report.ts \
  --repo "$PWD" \
  --tier full \
  --output /tmp/kubeclaw-lint-report.json
```

Run behavior verification:

```bash
node tests/verification/behavior/verify.mjs --source-root "$PWD" --area pipeline
```

## Sources

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- `skills/nova/pipeline/services/lint.ts`
- `skills/nova/pipeline/services/module-validators.ts`

## Rule And Tool Contract

| Surface | Source owner | Expected output |
| --- | --- | --- |
| CLI flags and exit behavior | `skills/nova/pipeline/tools/lint-report.ts`; `lint-report/output.ts` | `--repo`, `--tier`, `--project`, `--module-path`, `--changed-files`, `--output`, config flags; process exits nonzero on errors or tool failures |
| Tool discovery | `lint-report/discovery.ts`; `tool-registry.ts`; `container-yaml-tools.ts` | applicable tools based on project files and tier; config-missing results instead of implicit repo-local ESLint/Semgrep fallback |
| Report schema | `lint-report/report.ts`; `lint-report/output.ts` | JSON summary with total errors/warnings, per-tool status, findings, duration, and diagnostics |
| Pipeline consumption | `skills/nova/pipeline/services/lint.ts`; `module-validators.ts` | pre-check/full lint can request fixes, block, or provide evidence according to policy |

## Failure Signals

- `unknown tier`: CLI input is invalid; use `pre-check` or `full`.
- `eslint-config-missing` or `semgrep-config-missing`: platform-level configs were not discovered; do not silently fall back to repo defaults.
- parse failure finding: tool output format changed or command failed unexpectedly.
- `tools_failed` greater than zero: treat as environment/tooling issue, not clean code.

Run the lint-report unit tests when changing parsing/discovery and the pipeline behavior area when changing how lint results affect module/gate decisions.

# Linting Rules

Status: current
Audience: reference reader, developer

## Summary

KubeClaw linting is provided by `skills/nova/pipeline/tools/lint-report.ts`. It aggregates applicable tools into structured JSON for pre-check and full validator stages.

## Tiers

- `pre-check`: fast checks after Forge output.
- `full`: all applicable tools.

Default CLI tier is `full`.

## CLI

```bash
node skills/nova/pipeline/tools/lint-report.ts \
  --repo /workspace/repo \
  --tier full \
  --output /tmp/lint-report.json
```

Flags:

- `--repo`
- `--tier`
- `--module-path`
- `--project`
- `--output`
- `--changed-files`
- `--semgrep-config`
- `--eslint-config`
- `--log-path`
- `--help`

## Tools

- `tsc`: pre-check TypeScript compiler.
- `ruff`: pre-check Python linting.
- `shellcheck`: pre-check shell script linting.
- `repo-policy`: full custom repository policy checks.
- `eslint`: full JavaScript/TypeScript linting with explicit config.
- `knip`: full unused code/dependency checks.
- `madge`: full circular dependency checks.
- `npm-audit`: full production dependency audit.
- `mypy`: full Python typing.
- `pip-audit`: full Python dependency audit.
- `semgrep`: full pattern checks with explicit config.
- `hadolint`: full Dockerfile linting.
- `helm-lint`: full Helm chart linting.
- `kubeconform`: full Kubernetes manifest validation.
- `yamllint`: full YAML linting.

## Report Shape

```json
{
  "tier": "full",
  "timestamp": "2026-06-08T00:00:00.000Z",
  "summary": {
    "total_errors": 0,
    "total_warnings": 1,
    "tools_ok": 8,
    "tools_skipped": 4,
    "tools_failed": 0
  },
  "tools": {
    "tsc": {
      "status": "ok",
      "errors": 0,
      "warnings": 0,
      "findings": []
    }
  }
}
```

Finding shape:

```json
{
  "file": "src/app.ts",
  "line": 12,
  "column": 4,
  "severity": "error",
  "code": "TS2322",
  "message": "Type mismatch"
}
```

## Failure Behavior

- report unavailable in pre-check: fail closed
- tool failure in full lint: block as environment/tooling issue
- total errors greater than zero: request code fix
- warnings only: evidence unless policy changes
- missing explicit ESLint/Semgrep config: structured config-missing finding, no implicit fallback

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- `skills/nova/pipeline/services/lint.ts`

## Tool Inventory

The lint report runner supports two tiers: `pre-check` and `full`. Pre-check tools include fast language/shell checks; full adds heavier project, dependency, container, YAML, and security checks when applicable. Tool discovery is source-backed by `lint-report/discovery.ts` and the registries under `skills/nova/pipeline/tools/lint-report/`.

| Failure | Meaning | Next action |
| --- | --- | --- |
| `unknown tier` | caller passed a tier outside `pre-check` or `full` | fix pipeline config or CLI args |
| config-missing finding | ESLint or Semgrep config was not explicitly found | provide `--eslint-config`, `--semgrep-config`, or platform config files |
| parse failure | external tool output did not match parser expectations | inspect raw stdout/stderr and update parser/tests if the tool changed |
| `summary.total_errors > 0` | blocking findings exist | request code fixes before passing the gate |
| `summary.tools_failed > 0` | environment/tool execution failed | treat as tooling issue, not clean code |

Run `node --test tests/skills/nova/pipeline/tools/lint-report/*.test.mjs tests/skills/nova/pipeline/services/lint.test.mjs` for parser/service changes.

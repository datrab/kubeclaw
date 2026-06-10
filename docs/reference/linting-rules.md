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

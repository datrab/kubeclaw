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
  --policy /home/node/.openclaw/lint-policy.json \
  --policy-project workspace \
  --tier full \
  --output /tmp/lint-report.json
```

Flags:

- `--repo`
- `--policy`
- `--policy-project`
- `--tier`
- `--module-path`
- `--project`
- `--output`
- `--changed-files`
- `--log-path`
- `--help`

## Tools

- `tsc`: pre-check TypeScript compiler.
- `ruff`: pre-check Python linting.
- `shellcheck`: pre-check shell correctness linting at warning severity or higher.
- `shfmt`: pre-check canonical shell formatting.
- `eslint`: full JavaScript/TypeScript complexity, size, naming, configuration-boundary, fallback, error-handling, dynamic-loading, state, and logging enforcement with explicit config.
- `knip`: full dead-code, unused-export, and dependency-authority checks.
- `dependency-cruiser`: full circular-dependency and explicit layer-boundary checks.
- `jscpd`: full structural exact/near-duplicate detection.
- `npm-audit`: full production dependency audit.
- `mypy`: full Python typing.
- `pip-audit`: full Python dependency audit.
- `semgrep`: full pattern checks with explicit config.
- `hadolint`: full Dockerfile linting.
- `helm-lint`: full Helm chart linting.
- `kubeconform`: full validation of deterministic Helm-rendered manifests only.
- `yamllint`: full correctness-oriented YAML linting over explicit non-template roots.
- `gofmt`, `go-vet`, `gocyclo`, `go-imports`, `staticcheck`, and `govulncheck`: native Go format, correctness, complexity, import-boundary, deeper analysis, and reachable-vulnerability checks over explicit module roots.
- `helm`, `kubeconform`, and `trivy-kubernetes`: chart validation, rendered schema validation, and high/critical security checks over deterministic rendered manifests.
- `terraform-fmt`, `terraform-validate`, `tflint`, and `trivy-terraform`: native Terraform format, offline-mirror validation, lint, and high-confidence security checks over explicit roots.

## Report Shape

The single `pipeline_lint_policy.v5` project owns language evidence, architecture layers, native tool settings, Go and Terraform authority, and an exact `pipeline_lint_baseline.v1` path. Baselined findings require stable fingerprints, owner, reason, expiry, and tracking metadata. New findings block immediately.

```json
{
  "schema_version": "pipeline_lint_report.v5",
  "policy": {
    "schema_version": "pipeline_lint_policy.v5",
    "digest": "...",
    "project": "workspace",
    "config_digests": {},
    "baseline_digest": "..."
  },
  "tier": "full",
  "timestamp": "2026-06-08T00:00:00.000Z",
  "summary": {
    "total_errors": 0,
    "total_warnings": 0,
    "total_blocking": 0,
    "total_baselined": 2352,
    "tools_ok": 8,
    "tools_not_applicable": 4,
    "tools_failed": 0
  },
  "tools": {
    "tsc": {
      "status": "ok",
      "errors": 0,
      "warnings": 0,
      "blocking_findings": 0,
      "baselined_findings": 0,
      "category": "types",
      "scope": "affected-projects",
      "blocking_severity": "warning",
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
  "message": "Type mismatch",
  "fingerprint": "..."
}
```

## Failure Behavior

- report unavailable in pre-check: fail closed
- tool failure in full lint: block as environment/tooling issue
- `summary.total_blocking` greater than zero: request code fix
- every warning blocks unless its exact fingerprint is present in the owned, expiring baseline
- missing or invalid policy/project/native config: execution failure before tool execution
- missing required binary, timeout, crash, or unparseable output: execution failure
- malformed report schema: rejected by the pipeline consumer

## Generated From

This page is manually maintained from:

- `skills/nova/pipeline/tools/lint-report.ts`
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`
- `skills/nova/pipeline/tools/lint-report/container-yaml-tools.ts`
- `skills/nova/pipeline/services/lint.ts`

## Tool Inventory

The lint report runner supports two tiers: `pre-check` and `full`. The validated policy selects the project and tool registry; configured language-evidence patterns decide applicability inside that explicit project root.

| Failure | Meaning | Next action |
| --- | --- | --- |
| `unknown tier` | caller passed a tier outside `pre-check` or `full` | fix pipeline config or CLI args |
| `LINT_POLICY_INVALID` | policy, selected project, or required native config is invalid or missing | fix the single canonical policy authority |
| parse failure | external tool output did not match parser expectations | inspect raw stdout/stderr and update parser/tests if the tool changed |
| `summary.total_blocking > 0` | findings meet a tool's configured blocking threshold | request code fixes before passing the gate |
| `summary.tools_failed > 0` | environment/tool execution failed | treat as tooling issue, not clean code |

Run `node --test tests/skills/nova/pipeline/tools/lint-report/*.test.mjs tests/skills/nova/pipeline/services/lint.test.mjs` for parser/service changes.

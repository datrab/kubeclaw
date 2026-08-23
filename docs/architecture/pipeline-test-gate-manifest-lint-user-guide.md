# Static Kubernetes Lint User Guide

Status: authoritative; the legacy manifest suite is deleted

## What this check does

The lint stage reads declared raw Kubernetes YAML and rendered Helm charts. It
checks YAML structure, Kubernetes schemas, and selected static policy rules.
It does not apply resources, contact a cluster, or prove runtime health.

## Project configuration

The lint policy has one `kubernetes` block per project:

```json
{
  "raw_manifests": ["deploy/base.yaml"],
  "helm_charts": ["charts/app"],
  "policy_packs": ["company-default"],
  "kubernetes_version": "1.35.6",
  "schema_location": "/opt/schemas/v1.35.6-strict/{{.ResourceKind}}{{.KindSuffix}}.json",
  "limits": {
    "max_files": 128,
    "max_file_bytes": 1048576,
    "max_rendered_bytes": 10485760,
    "max_documents": 2048
  }
}
```

All project input paths are repository-relative and explicit. Globs and hidden
manifest discovery are not supported. `schema_location` is operator-owned and
must be an absolute local path. HTTP and HTTPS schema locations are rejected.

## Results

`kubernetes-schema` reports invalid raw or rendered resources.
`kubernetes-policy` reports selected rule findings. Each policy finding names
the resource, container, source file, rule, and line when YAML supplies it.
The original bounded schema output, source digests, rendered digests, and pack
digests remain in the lint report.

Both tools are authoritative lint checks. Error findings and tool failures
block a blocking lint stage. Advisory policy findings remain visible without
blocking the stage. The old and new paths were run against the same raw
YAML, Helm, multi-resource, multi-container, Secret, ConfigMap, and
ServiceAccount fixtures. All 28 baseline behaviors are preserved, improved, or
removed as accepted defects. The old Buster manifest runner no longer exists.

## Policy rules

Version 1 supports these rule types:

- `required-env`
- `secret-ref`
- `private-registry-pull-secret`
- `readiness-probe`
- `liveness-probe`
- `resource-limits`

The project cannot supply executable policy code. It can select only a pack
that the operator installed and approved.

## Common errors

- `LINT_POLICY_INVALID`: fix the named field, path, digest, limit, or pack ID.
- `kubernetes-manifest-yaml-invalid`: correct the YAML at the named source.
- `kubernetes-manifest-size-limit`: reduce or split the declared input.
- `kubeconform-execution-failed`: the local tool or schema tree is absent.
- `lint-evidence-size-limit`: reduce the declared scope or output size.

Live cluster checks belong to the later Kubernetes fixture and readiness tests.

## Verify locally

Run `npm run verify:test-gate:manifest-lint-cutover`. It checks the 28-item
ledger, immutable old evidence, the sole Nova lint path, deletion guards,
evidence, and all earlier regressions. No Kubernetes cluster is required.

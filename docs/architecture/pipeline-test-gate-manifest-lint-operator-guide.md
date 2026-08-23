# Static Kubernetes Lint Operator Guide

Status: authoritative production runbook

## Operator-owned inputs

The Nova image must contain:

1. Pinned `helm` and `kubeconform` binaries.
2. A strict Kubernetes JSON schema tree for the approved version.
3. Versioned declarative policy pack files.
4. A lint policy that binds every pack to its SHA-256.

The image build fetches schema source at one exact Git commit. The
authoritative check uses only `/opt/kubeclaw-kubernetes-schemas`. It does not
download a schema or policy pack during a run. Projects with explicit
Kubernetes inputs use this single schema authority.

## Policy pack format

```json
{
  "schema_version": "kubernetes_lint_policy_pack.v1",
  "id": "company-default",
  "version": "1.0.0",
  "rules": [
    {
      "id": "limits",
      "type": "resource-limits",
      "severity": "error",
      "parameters": { "cpu": true, "memory": true }
    }
  ]
}
```

The lint policy stores the pack ID, version, relative file path, and lowercase
SHA-256. Nova verifies all four before it reads project input. Pack paths must
remain inside the policy directory, including after symlink resolution.

## Contained verification

Run:

```text
npm run verify:test-gate:manifest-lint-implementation
```

This uses real Helm rendering, real kubeconform execution, real YAML parsing,
real digest verification, and the real lint report contract. It uses local
temporary schemas and does not require a cluster or BuildKit.

Run the complete cutover proof with:

```text
npm run verify:test-gate:manifest-lint-cutover
```

This proves all 28 ledger items, checks immutable old comparison evidence,
crosses the real Nova lint plugin and artifact store, and proves that the old
protocol, runner, parser, setup fields, and examples are absent.

## Authority restriction

Do not restore `manifest` in the legacy bridge, protocol, registry, setup
fields, or real-pipeline suite lists. A live cluster test is not part of this
static check.

## Deployment checks for final program closeout

At the final single-path production test, confirm that the image has the exact
schema directory, pack files match their configured digests, runtime network
denial does not affect lint, and invalid raw and rendered resources fail. This
external proof is deliberately deferred until all suites have one path.

# Kubernetes Manifest Policy Pack Author Guide

Status: authoritative format

## Purpose

A policy pack is declarative data installed by an operator. It is not project
code and it cannot run commands, access the network, or install itself. A
project can select an installed pack by ID only.

## Smallest pack

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

The operator stores the file beside the lint policy and records its ID,
version, relative path, and lowercase SHA-256 digest in
`kubernetes_policy_packs`. Nova verifies the file before it reads project
manifests.

## Supported rules

- `required-env`: `parameters.names` is a non-empty array of variable names.
- `secret-ref`: no parameters; checks direct and `envFrom` Secret references.
- `private-registry-pull-secret`: `parameters.registries` lists exact registry
  hosts or prefixes.
- `readiness-probe`: no parameters; checks every regular container.
- `liveness-probe`: no parameters; checks every regular container.
- `resource-limits`: `parameters.cpu` and `parameters.memory` select limits.

Every rule has a unique `id` and `severity` of `error` or `warning`. Pack size,
rule count, strings, and parameter arrays are bounded. Unknown fields and rule
types fail closed.

## Installation

1. Review the pack as configuration, not executable code.
2. Store it under the operator-controlled lint-policy directory.
3. Calculate SHA-256 from the exact file bytes.
4. Add the pack reference to the lint policy.
5. Add the pack ID to the intended project's `policy_packs` array.
6. Run `npm run verify:test-gate:manifest-lint-parity`.

Changing any byte requires a version and digest review. A missing, forged,
oversized, symlinked, or unapproved pack stops the replacement tool safely.

## Result identity

Each finding contains the pack-derived rule ID, severity, resource, container,
source file, and source line when available. The report also contains the
verified pack digest as evidence.

# kubeclaw.security-providers

Status: implemented
Audience: plugin author, operator, maintainer
Owner: kubeclaw.security-providers
Evidence: skills/buster/plugins/security-providers/plugin.json
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: generated during publication

## Purpose

This package provides 5 registered extensions through the canonical plugin runtime.

## When To Use It

Use this package when a test plan needs one of its declared provider contracts.

## Boundaries

- The manifest declares extension identity and requested authority.
- Platform policy grants authority separately.
- Core validates lifecycle effects and owns canonical pipeline state.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `headers` | `kubeclaw.security-headers@1` | `src/headers.js` | `provider` |
| test provider | `dependency-trivy` | `kubeclaw.dependency-scan-trivy@1` | `src/dependency.js` | `provider` |
| test provider | `image-trivy` | `kubeclaw.image-scan-trivy@1` | `src/image.js` | `provider` |
| test provider | `kubernetes-policy` | `kubeclaw.kubernetes-policy-security@1` | `src/kubernetes-policy.js` | `provider` |
| test provider | `kubernetes-runtime` | `kubeclaw.kubernetes-runtime-security@1` | `src/kubernetes-runtime.js` | `provider` |

## test provider: headers

Public identifier: `kubeclaw.security-headers@1`.

Required capabilities: `network.http`

Provided capabilities: None.

Configuration schema: `schemas/headers.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `deployment`: value; required.

## test provider: dependency-trivy

Public identifier: `kubeclaw.dependency-scan-trivy@1`.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: `schemas/dependency.schema.json`

Input schema: None.

Result schema: None.

## test provider: image-trivy

Public identifier: `kubeclaw.image-scan-trivy@1`.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: `schemas/image.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `image`: value; required.

## test provider: kubernetes-policy

Public identifier: `kubeclaw.kubernetes-policy-security@1`.

Required capabilities: `security.scan`

Provided capabilities: None.

Configuration schema: `schemas/kubernetes-policy.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `checked-manifest`: artifact; required.

## test provider: kubernetes-runtime

Public identifier: `kubeclaw.kubernetes-runtime-security@1`.

Required capabilities: `kubernetes.runtime-security`

Provided capabilities: None.

Configuration schema: `schemas/kubernetes-runtime.schema.json`

Input schema: None.

Result schema: None.

Inputs:

- `deployment`: value; required.
- `checked-manifest`: artifact; required.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
Runtime policy rejects authority that the operator did not grant.
Core records a validated failure without giving the plugin lifecycle authority.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/security-providers
```

Package tests found: 0.

## Source Evidence

- Manifest: `skills/buster/plugins/security-providers/plugin.json`
- Package root: `skills/buster/plugins/security-providers`
- Authored package guide: `skills/buster/plugins/security-providers/README.md`

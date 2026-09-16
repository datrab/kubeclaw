# kubeclaw.tailscale-exposure

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/tailscale-exposure/plugin.json; skills/buster/plugins/tailscale-exposure/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Create a bounded Tailscale exposure for a Buster test target.

## When To Use It

Use it when a remote test must reach an otherwise private fixture.

## When Not To Use It

Do not use it for permanent ingress or unrelated network access.

## Most Important Limit

It depends on Tailscale authority and must clean up the temporary exposure.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.tailscale-exposure@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/tailscale-exposure/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `exposure` | `kubeclaw.tailscale-exposure@1` | `src/provider.js` | `provider` |

## test provider: exposure

Public identifier: `kubeclaw.tailscale-exposure@1`.

Required capabilities: `kubernetes.exposure`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/schemas/config.schema.json)

Configuration fields:

- `retentionMode` (schema-defined; optional)
- `endpointName` (schema-defined; optional)
- `hostname` (schema-defined; optional)
- `path` (string; optional)
- `readinessTimeoutSeconds` (integer; optional)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `exposure` |
| `contractId` | `kubeclaw.tailscale-exposure@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"}]` |
| `outputs` | `[{"name":"exposure","kind":"value","required":true,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `requiredCapabilities` | `["kubernetes.exposure"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `deployment`: value; required.

Outputs:

- `exposure`: value; required.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/tailscale-exposure
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/tailscale-exposure/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/plugin.json)
- Authored package guide: [skills/buster/plugins/tailscale-exposure/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/README.md)
- Module for `exposure`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/src/provider.js)
- Test: [skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

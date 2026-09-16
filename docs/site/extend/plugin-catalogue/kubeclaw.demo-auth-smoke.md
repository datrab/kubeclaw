# kubeclaw.demo-auth-smoke

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/demo-auth-smoke/plugin.json; skills/buster/plugins/demo-auth-smoke/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Exercise the demo authentication session as a Buster provider.

## When To Use It

Use it when the demo path needs a focused authenticated smoke check.

## When Not To Use It

Do not use it as a general identity-provider security assessment.

## Most Important Limit

It validates the configured demo session path and its available environment only.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.demo-auth-smoke@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/demo-auth-smoke/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `session` | `kubeclaw.demo-auth-smoke@1` | `src/provider.js` | `provider` |

## test provider: session

Public identifier: `kubeclaw.demo-auth-smoke@1`.

Required capabilities: `network.http`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json)

Configuration fields:

- `protocol` (schema-defined; required)
- `loginPath` (string; required)
- `usernameKey` (string; required)
- `passwordKey` (string; required)
- `cookieName` (string; required)
- `protectedPath` (string; required)
- `usernamePointer` (string; required)
- `assertions` (array; required)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `session` |
| `contractId` | `kubeclaw.demo-auth-smoke@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"credentials","kind":"value","required":true,"schemaId":"kubeclaw.generated-demo-credentials@1"},{"name":"exposure","kind":"value","required":true,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `outputs` | `[{"name":"authentication","kind":"value","schemaId":"kubeclaw.demo-auth-evidence@1","required":true}]` |
| `requiredCapabilities` | `["network.http"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `deployment`: value; required.
- `credentials`: value; required.
- `exposure`: value; required.

Outputs:

- `authentication`: value; required.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command requires the Go executable, which is absent on this host.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/demo-auth-smoke
```

Package tests found: 0.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/demo-auth-smoke/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/plugin.json)
- Authored package guide: [skills/buster/plugins/demo-auth-smoke/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/README.md)
- Module for `session`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/demo-auth-smoke/src/provider.js)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

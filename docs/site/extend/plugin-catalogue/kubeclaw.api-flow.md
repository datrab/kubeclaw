# kubeclaw.api-flow

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/api-flow/plugin.json; skills/buster/plugins/api-flow/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run ordered API flow checks as a Buster test provider.

## When To Use It

Use it when several HTTP operations form one stateful test scenario.

## When Not To Use It

Do not use it for one independent request or OpenAPI-wide operation discovery.

## Most Important Limit

Flow state exists only inside the bounded provider execution.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.api-flow@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/api-flow/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `flow` | `kubeclaw.api-flow@1` | `src/provider.js` | `provider` |

## test provider: flow

Public identifier: `kubeclaw.api-flow@1`.

Required capabilities: `network.http`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/schemas/config.schema.json)

Configuration fields:

- `flowFile` (string; required)
- `url` (string; optional)
- `endpointName` (string; optional)
- `requestTimeoutMs` (integer; optional; default `10000`)
- `maximumResponseBytes` (integer; optional; default `1048576`)
- `maximumSteps` (integer; optional; default `64`)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `flow` |
| `contractId` | `kubeclaw.api-flow@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":false,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"endpoint","kind":"value","required":false,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["network.http"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log","test-report"]` |
| `evidenceDefaults` | `{"onPass":["log","test-report"],"onFail":["log","test-report"],"onError":["log"]}` |

Inputs:

- `deployment`: value; optional.
- `endpoint`: value; optional.

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
npm test --prefix skills/buster/plugins/api-flow
```

Package tests found: 2.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/api-flow/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/plugin.json)
- Authored package guide: [skills/buster/plugins/api-flow/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/README.md)
- Module for `flow`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/src/provider.js)
- Test: [skills/buster/plugins/api-flow/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/tests/live-function.test.ts)
- Test: [skills/buster/plugins/api-flow/tests/remediation.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/api-flow/tests/remediation.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

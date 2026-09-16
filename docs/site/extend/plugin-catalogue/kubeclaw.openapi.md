# kubeclaw.openapi

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/openapi/plugin.json; skills/buster/plugins/openapi/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Check declared OpenAPI operations through the Buster provider boundary.

## When To Use It

Use it when API behavior must agree with an OpenAPI description.

## When Not To Use It

Do not use it for an unrelated HTTP smoke request.

## Most Important Limit

Coverage includes only selected operations and supplied runtime access.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.openapi@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/openapi/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `operations` | `kubeclaw.openapi@1` | `src/provider.js` | `provider` |

## test provider: operations

Public identifier: `kubeclaw.openapi@1`.
Global registration ID: `kubeclaw.openapi:operations`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `network.http`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `specFile` (string; required; minLength `1`; maxLength `1024`; pattern `^(?!/)(?!.*(?:^|/)\.\.(?:/|$)).+$`)
- `url` (string; optional; minLength `1`; maxLength `2048`)
- `endpointName` (string; optional; pattern `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
- `operations` (array; optional; minItems `1`; maxItems `128`)
- `tags` (array; optional; minItems `1`; maxItems `32`)
- `requestTimeoutMs` (integer; optional; default `10000`; minimum `1`; maximum `300000`)
- `maximumResponseBytes` (integer; optional; default `1048576`; minimum `1`; maximum `16777216`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `operations` |
| `contractId` | `kubeclaw.openapi@1` |
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

The provider resolves selected operation IDs and path parameters from the supplied specification. Unknown operations, missing parameters, or paths outside the selected origin fail before the request.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/openapi
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts && node tests/remediation.test.ts
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/buster/plugins/openapi/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/plugin.json)
- Authored package guide: [skills/buster/plugins/openapi/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/README.md)
- Module for `operations`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/src/provider.js)
- Test: [skills/buster/plugins/openapi/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/tests/live-function.test.ts)
- Test: [skills/buster/plugins/openapi/tests/remediation.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/openapi/tests/remediation.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

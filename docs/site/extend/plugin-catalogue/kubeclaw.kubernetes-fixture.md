# kubeclaw.kubernetes-fixture

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/kubernetes-fixture/plugin.json; skills/buster/plugins/kubernetes-fixture/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb

## Authored Guidance

Prepare and clean a Kubernetes fixture for Buster tests.

## When To Use It

Use it when a test requires a bounded temporary Kubernetes deployment.

## When Not To Use It

Do not use it for permanent application deployment.

## Most Important Limit

Fixture ownership and cleanup apply only to the resolved test plan scope.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.kubernetes-fixture@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/kubernetes-fixture/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `deployment` | `kubeclaw.kubernetes-fixture@1` | `src/provider.js` | `provider` |

## test provider: deployment

Public identifier: `kubeclaw.kubernetes-fixture@1`.
Global registration ID: `kubeclaw.kubernetes-fixture:deployment`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `kubernetes.fixture`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `image` (object; optional)
- `serviceName` (referenced schema; required; reference `#/$defs/dnsLabel`)
- `servicePort` (integer; required; minimum `1`; maximum `65535`)
- `serviceTargetPort` (integer; optional; minimum `1`; maximum `65535`)
- `namespacePrefix` (referenced schema; optional; reference `#/$defs/namespacePrefix`)
- `retention` (object; optional)
- `readinessTimeoutSeconds` (integer; optional; minimum `1`; maximum `3600`)
- `secretReferences` (array; optional; maxItems `32`)
- `testCredentials` (object; optional)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `deployment` |
| `contractId` | `kubeclaw.kubernetes-fixture@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"image","kind":"value","required":false,"schemaId":"kubeclaw.container-image@1"},{"name":"checked-manifest","kind":"artifact","required":true,"mediaTypes":["application/vnd.kubeclaw.checked-kubernetes-yaml"]}]` |
| `outputs` | `[{"name":"demo-credentials","kind":"value","required":false,"schemaId":"kubeclaw.generated-demo-credentials@1"},{"name":"deployment","kind":"value","required":true,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"image","kind":"value","required":true,"schemaId":"kubeclaw.container-image@1"}]` |
| `requiredCapabilities` | `["kubernetes.fixture"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log"]` |
| `evidenceDefaults` | `{"onPass":["log"],"onFail":["log"],"onError":["log"]}` |

Inputs:

- `image`: value; optional.
- `checked-manifest`: artifact; required.

Outputs:

- `demo-credentials`: value; optional.
- `deployment`: value; required.
- `image`: value; required.

## Failure Behavior

Preparation returns deployment evidence and, when requested, credential provenance. Cleanup calls release and requires a successful response. Provider-level tests do not prove deletion in a real cluster.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Catalogue status: `locally-verified`.
Recorded local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/kubernetes-fixture
```

Package test files found: 1. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts
```

The catalogue status does not claim live host or cluster acceptance.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/buster/plugins/kubernetes-fixture/plugin.json](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/plugin.json)
- Authored package guide: [skills/buster/plugins/kubernetes-fixture/README.md](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/README.md)
- Module for `deployment`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/src/provider.js)
- Test: [skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. Maintained guidance data owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

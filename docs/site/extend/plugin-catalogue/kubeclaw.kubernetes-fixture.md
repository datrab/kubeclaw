# kubeclaw.kubernetes-fixture

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/kubernetes-fixture/plugin.json; skills/buster/plugins/kubernetes-fixture/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

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

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/README.md)
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
- Manifest: [skills/buster/plugins/kubernetes-fixture/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/plugin.json)

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

Required capabilities: `kubernetes.fixture`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json)

Configuration fields:

- `image` (object; optional)
- `serviceName` (schema-defined; required)
- `servicePort` (integer; required)
- `serviceTargetPort` (integer; optional)
- `namespacePrefix` (schema-defined; optional)
- `retention` (object; optional)
- `readinessTimeoutSeconds` (integer; optional)
- `secretReferences` (array; optional)
- `testCredentials` (object; optional)

Input schema: None.

Result schema: None.

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

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `locally-verified`.
Local command result on 2026-09-16: `passed`.

The package-local command completed with exit code 0.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/kubernetes-fixture
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/kubernetes-fixture/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/plugin.json)
- Authored package guide: [skills/buster/plugins/kubernetes-fixture/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/README.md)
- Module for `deployment`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/src/provider.js)
- Test: [skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

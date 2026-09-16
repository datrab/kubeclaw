# kubeclaw.direct-command

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/direct-command/plugin.json; skills/buster/plugins/direct-command/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run one declared command as a Buster test provider.

## When To Use It

Use it when a test plan needs a bounded command and its evidence.

## When Not To Use It

Do not use it for long-lived services or unrestricted shell sessions.

## Most Important Limit

Retry safety depends on the command behavior declared by the plan.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.direct-command@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/direct-command/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `command` | `kubeclaw.direct-command@1` | `src/provider.js` | `provider` |

## test provider: command

Public identifier: `kubeclaw.direct-command@1`.

Required capabilities: `command.execute`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/schemas/config.schema.json)

Configuration fields:

- `executable` (string; required)
- `args` (array; optional)
- `workingDirectory` (string; optional)
- `environment` (object; optional)
- `resultMode` (schema-defined; required)
- `reports` (array; optional)
- `coverage` (array; optional)
- `artifacts` (array; optional)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `command` |
| `contractId` | `kubeclaw.direct-command@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | Empty list. |
| `outputs` | `[{"name":"coverage-1","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-2","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-3","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-4","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-5","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-6","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-7","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"coverage-8","kind":"artifact","required":false,"mediaTypes":["text/lcov"]},{"name":"artifact-1","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-2","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-3","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-4","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-5","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-6","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-7","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]},{"name":"artifact-8","kind":"artifact","required":false,"mediaTypes":["application/octet-stream","application/x-tar","application/gzip","application/vnd.kubeclaw.build-output.tar","application/vnd.kubeclaw.checked-kubernetes-yaml","application/vnd.kubeclaw.size-budget-baseline+json"]}]` |
| `requiredCapabilities` | `["command.execute"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | `["junit"]` |
| `evidenceTypes` | `["log","test-report","coverage","artifact"]` |
| `evidenceDefaults` | `{"onPass":["log","test-report","coverage","artifact"],"onFail":["log","test-report","coverage","artifact"],"onError":["log","test-report","coverage","artifact"]}` |

Outputs:

- `coverage-1`: artifact; optional.
- `coverage-2`: artifact; optional.
- `coverage-3`: artifact; optional.
- `coverage-4`: artifact; optional.
- `coverage-5`: artifact; optional.
- `coverage-6`: artifact; optional.
- `coverage-7`: artifact; optional.
- `coverage-8`: artifact; optional.
- `artifact-1`: artifact; optional.
- `artifact-2`: artifact; optional.
- `artifact-3`: artifact; optional.
- `artifact-4`: artifact; optional.
- `artifact-5`: artifact; optional.
- `artifact-6`: artifact; optional.
- `artifact-7`: artifact; optional.
- `artifact-8`: artifact; optional.

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
npm test --prefix skills/buster/plugins/direct-command
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/direct-command/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/plugin.json)
- Authored package guide: [skills/buster/plugins/direct-command/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/README.md)
- Module for `command`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/src/provider.js)
- Test: [skills/buster/plugins/direct-command/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

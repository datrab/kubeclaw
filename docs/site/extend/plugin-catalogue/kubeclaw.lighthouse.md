# kubeclaw.lighthouse

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/lighthouse/plugin.json; skills/buster/plugins/lighthouse/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run Lighthouse web-quality checks as a Buster provider.

## When To Use It

Use it when a rendered page needs performance and quality measurements.

## When Not To Use It

Do not use it as a load test or server-capacity measure.

## Most Important Limit

Results depend on the tested page, runner environment, and configured categories.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.lighthouse@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/lighthouse/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `lighthouse` | `kubeclaw.lighthouse@1` | `src/provider.js` | `provider` |

## test provider: lighthouse

Public identifier: `kubeclaw.lighthouse@1`.

Required capabilities: `browser.lighthouse`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/schemas/config.schema.json)

Configuration fields:

- `purpose` (schema-defined; required)
- `url` (string; optional)
- `endpointName` (string; optional)
- `routes` (array; required)
- `settingsFile` (string; required)
- `profile` (string; required)
- `budget` (string; optional)
- `runs` (schema-defined; optional)
- `acceptances` (array; optional; default `[]`)
- `timeoutMs` (integer; optional; default `120000`)

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `lighthouse` |
| `contractId` | `kubeclaw.lighthouse@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":false,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"endpoint","kind":"value","required":false,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["browser.lighthouse"]` |
| `retrySafe` | `true` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log","performance-report","performance-report-representative"]` |
| `evidenceDefaults` | `{"onPass":["log","performance-report","performance-report-representative"],"onFail":["log","performance-report","performance-report-representative"],"onError":["log"]}` |

Inputs:

- `deployment`: value; optional.
- `endpoint`: value; optional.

## Failure Behavior

Registry validation rejects a missing module, export, schema, or capability declaration.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Local command result on 2026-09-16: `unavailable`.

The command requires a configured real Chromium or Playwright browser that is absent on this host.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/lighthouse
```

Package tests found: 1.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/lighthouse/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/plugin.json)
- Authored package guide: [skills/buster/plugins/lighthouse/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/README.md)
- Module for `lighthouse`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/src/provider.js)
- Test: [skills/buster/plugins/lighthouse/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/lighthouse/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

# kubeclaw.playwright

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/playwright/plugin.json; skills/buster/plugins/playwright/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: see the separate verification record; source evidence revision bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Run browser scenarios through Playwright in a Buster provider.

## When To Use It

Use it when behavior requires a real browser and page interaction.

## When Not To Use It

Do not use it for a simple HTTP status or API-only check.

## Most Important Limit

Browser, evidence, network, and execution time remain plan-bound.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.playwright@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/playwright/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| test provider | `playwright` | `kubeclaw.playwright@1` | `src/provider.js` | `provider` |

## test provider: playwright

Public identifier: `kubeclaw.playwright@1`.
Global registration ID: `kubeclaw.playwright:playwright`. This identifies the installed registration. Graphs select stage types; Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: `browser.playwright`

Provided capabilities: None.

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/schemas/config.schema.json)

Configuration fields (schema declarations; defaults are annotations, not proof that the caller inserts a value):

- `url` (string; optional; maxLength `2048`; pattern `^https?://`)
- `endpointName` (string; optional; pattern `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
- `projectDirectory` (string; required; minLength `1`; maxLength `1024`; pattern `^(?:\.|(?!/)(?!.*(?:^|/)\.\.(?:/|$)).+)$`)
- `configFile` (string; required; minLength `1`; maxLength `1024`; pattern `^(?!/)(?!.*(?:^|/)\.\.(?:/|$)).+$`)
- `workers` (integer; optional; minimum `1`; maximum `64`)
- `timeoutMs` (integer; optional; default `600000`; minimum `1000`; maximum `3600000`)
- `minimumExecutedTests` (integer; optional; minimum `0`; maximum `100000`)
- `requiredTests` (array; optional; maxItems `10000`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `playwright` |
| `contractId` | `kubeclaw.playwright@1` |
| `module` | `src/provider.js` |
| `export` | `provider` |
| `configSchema` | `schemas/config.schema.json` |
| `inputs` | `[{"name":"deployment","kind":"value","required":false,"schemaId":"kubeclaw.kubernetes-deployment-fixture@1"},{"name":"endpoint","kind":"value","required":false,"schemaId":"kubeclaw.public-endpoint-fixture@1"}]` |
| `outputs` | Empty list. |
| `requiredCapabilities` | `["browser.playwright"]` |
| `retrySafe` | `false` |
| `matrixFields` | Empty list. |
| `reportFormats` | Empty list. |
| `evidenceTypes` | `["log","test-report","screenshot","video","trace","test-artifact"]` |
| `evidenceDefaults` | `{"onPass":["log","test-report","screenshot","video","trace","test-artifact"],"onFail":["log","test-report","screenshot","video","trace","test-artifact"],"onError":["log"]}` |

Inputs:

- `deployment`: value; optional.
- `endpoint`: value; optional.

## Failure Behavior

The provider runs the selected browser test and imports its report and artifacts. Malformed reports and excess artifact counts fail. The package test needs an absolute PLAYWRIGHT_BROWSERS_PATH.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports; discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
Nova or Buster records a bounded failure without giving the package lifecycle authority.

## Verification Record

Audit status: `content-written`.
Earlier AP08.7–AP08.9 local command result on 2026-09-16: `unavailable`.

The command requires a configured real Chromium or Playwright browser that is absent on this host.

Run the package command:

```bash
npm test --prefix skills/buster/plugins/playwright
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/live-function.test.ts
```

The audit status does not claim live host or cluster acceptance. See the AP08
[AP08.10 checkpoint](../../../blueprint/AP08.10-checkpoint.md) for the independent rerun and current boundaries. Earlier results are historical.

## Source Evidence

- Manifest: [skills/buster/plugins/playwright/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/plugin.json)
- Authored package guide: [skills/buster/plugins/playwright/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/README.md)
- Module for `playwright`: [src/provider.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/src/provider.js)
- Test: [skills/buster/plugins/playwright/tests/fixture/specs/home.spec.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/tests/fixture/specs/home.spec.ts)
- Test: [skills/buster/plugins/playwright/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/playwright/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

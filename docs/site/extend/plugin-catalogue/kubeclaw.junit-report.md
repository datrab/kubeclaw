# kubeclaw.junit-report

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/buster/plugins/junit-report-adapter/plugin.json; skills/buster/plugins/junit-report-adapter/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: authored guidance and generated facts reviewed at bcf032f241b432bf920baa9ee5f727947921447d

## Authored Guidance

Normalize JUnit XML into the Buster report contract.

## When To Use It

Use it when a provider emits JUnit-compatible test results.

## When Not To Use It

Do not use it to execute tests or decide quality policy.

## Most Important Limit

Malformed, oversized, or unsupported JUnit input must fail normalization.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Generated Package Facts

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.junit-report@1.0.0`.
- Runtime-role manifest inclusion: `buster`
- Manifest: [skills/buster/plugins/junit-report-adapter/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| report adapter | `junit` | `junit` | `src/adapter.js` | `adapt` |

## report adapter: junit

Public identifier: `junit`.

Required capabilities: None.

Provided capabilities: None.

Configuration schema: None.

Configuration fields:

Not applicable.

Input schema: None.

Result schema: None.

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `junit` |
| `format` | `junit` |
| `contractVersion` | `1` |
| `module` | `src/adapter.js` |
| `export` | `adapt` |
| `mediaTypes` | `["application/junit+xml","application/xml","text/xml"]` |

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
npm test --prefix skills/buster/plugins/junit-report-adapter
```

Package tests found: 2.

The audit status does not claim live host or cluster acceptance. See the AP08
checkpoint for the exact local result and unavailable environment boundaries.

## Source Evidence

- Manifest: [skills/buster/plugins/junit-report-adapter/plugin.json](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/plugin.json)
- Authored package guide: [skills/buster/plugins/junit-report-adapter/README.md](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/README.md)
- Module for `junit`: [src/adapter.js](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/src/adapter.js)
- Test: [skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs)
- Test: [skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts)

Generated facts come from the manifest, package metadata, runtime-role inventory,
schemas, and test-file discovery. The separate AP08 guidance file owns the purpose,
use, exclusion, and limit text. Publication can refresh facts without inventing or
silently replacing those explanations.

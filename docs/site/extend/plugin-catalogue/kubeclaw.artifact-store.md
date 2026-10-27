# kubeclaw.artifact-store

Status: implemented
Audience: plugin author, operator, maintainer
Owner: plugin-foundation
Evidence: skills/common/plugins/artifact-store/plugin.json; skills/common/plugins/artifact-store/README.md
Applies to: pipeline-plugin-v2; package 1.0.0
Last verified: source facts revision 7994a51e16bc752357c3a801190b12b7d6a191a4; package behavior sources revision 32b02816cc19cc8865a45b221b8b6ca28e99e8fb. Local command results and their limits appear under Package Checks.

## Purpose

Give controlled artifact read and write access through the capability boundary.

## When To Use It

When a pipeline capability consumer must exchange durable bounded artifacts, use it.

## When Not To Use It

Do not use it as arbitrary filesystem access or as canonical pipeline state.

## Most Important Limit

All operations remain subject to the granted artifact capability constraints.

The package guide explains package-specific behavior. The shared guides explain
the contract and lifecycle rules that apply to this package.

- [Package guide](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/README.md)
- [Shared extension contracts](../contracts.md)
- [Proof and failure exercises](../testing.md#use-a-proof-ladder)
- [Install and activate](../testing.md#install-and-activate-by-surface)
- [Update or replace](../testing.md#update-or-replace)
- [Disable safely](../testing.md#disable-safely)
- [Remove and inspect remaining state](../testing.md#remove-and-inspect-remaining-state)
- [Host and engine boundaries](../host-and-engine.md)

## Package Reference

- Host: `pipeline-runtime`.
- Package identity: `kubeclaw.artifact-store@1.0.0`.
- Runtime-role manifest inclusion: `buster`, `nova`, `prism`
- Manifest: [skills/common/plugins/artifact-store/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/plugin.json)

## Boundaries

- The manifest declares extension identity and requested authority.
- Nova and Buster apply the selection rules for each declared surface.
- Platform grants or resolved plans supply authority separately from package code.
- Pipeline Core keeps canonical lifecycle authority.
- The package cannot use undeclared capabilities.

## Registration Summary

| Kind | ID | Public contract or type | Module | Export |
| --- | --- | --- | --- | --- |
| capability adapter | `artifact-store` | `artifact-store` | `src/adapter.ts` | `activate` |

## capability adapter: artifact-store

Public identifier: `artifact-store`.
Global registration ID: `kubeclaw.artifact-store:artifact-store`. This identifies the installed registration. Graphs select stage types. Buster plans select provider contract IDs or report formats. Use the guide for the relevant selection field.

Required capabilities: None.

Provided capabilities: `artifacts.read`, `artifacts.write`

Configuration schema: [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/schemas/config.schema.json)

Configuration fields: schema declarations. Defaults are annotations, not proof that the caller inserts a value.

- `artifactRoot` (string; required; minLength `1`)
- `maxArtifactBytes` (integer; optional; minimum `1`)
- `maximumRecords` (integer; optional; default `100000`; minimum `1`)
- `maximumStoreBytes` (integer; optional; default `268435456`; minimum `1`)

Input schema: No package-specific inputSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Result schema: No package-specific resultSchema field. Use the [shared runtime data contract](../contracts.md#data-and-authority-comparison).

Declared manifest facts:

| Field | Exact declared value |
| --- | --- |
| `id` | `artifact-store` |
| `module` | `src/adapter.ts` |
| `export` | `activate` |
| `providesCapabilities` | `["artifacts.read","artifacts.write"]` |
| `requiredCapabilities` | Empty list. |
| `configSchema` | `schemas/config.schema.json` |

## Failure Behavior

Consumers write JSON or read through artifact references. Digest, reference, and store-budget failures are errors. Package removal does not change the configured artifact store or run references.

Registry validation checks declared paths, schemas, and capability names.
Activation or the Buster loader checks executable exports. Discovery does not import package code.
The surface runtime rejects a missing grant or resolved-plan binding before unauthorized work.
The selected runtime owns failure recording and lifecycle state. Package code does not gain lifecycle authority.
Adapter startup cleanup can remain pending when shutdown ignores its abort signal. Use the [startup stop rules](../../use/plugins.md#3-activate-and-prove-health).

## Package Checks

Historical local command record dated 2026-09-16.
Recorded source revision: `bcf032f241b432bf920baa9ee5f727947921447d`.
Recorded environment: `Linux workspace with Node.js 24 and BusyBox userland`.
Recorded result: `unavailable`.

Exact reason from that historical record:

> The command reached a persistent-path check, but BusyBox flock has no required --timeout option.

This historical quotation is not a current package-availability or readiness result.
The next section gives the current command or no-command declaration.

Run the package command:

```bash
npm test --prefix skills/common/plugins/artifact-store
```

Package test files found: 2. This is file discovery, not an executed test count.

Exact package test script (run from the package directory):

```text
node tests/package-boundary.test.mjs && node tests/live-function.test.ts
```

Local package checks do not prove live host or cluster readiness.
The result above states the exact local limit. Run the package command in the target environment before activation.

## Source Evidence

- Manifest: [skills/common/plugins/artifact-store/plugin.json](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/plugin.json)
- Package implementation guide: [skills/common/plugins/artifact-store/README.md](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/README.md)
- Module for `artifact-store`: [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/src/adapter.ts)
- Test: [skills/common/plugins/artifact-store/tests/live-function.test.ts](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/tests/live-function.test.ts)
- Test: [skills/common/plugins/artifact-store/tests/package-boundary.test.mjs](https://github.com/datrab/kubeclaw/blob/7994a51e16bc752357c3a801190b12b7d6a191a4/skills/common/plugins/artifact-store/tests/package-boundary.test.mjs)
